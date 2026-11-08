import Dexie, { type Table } from 'dexie';
import { useSyncExternalStore } from 'react';
import type { Card } from './types';
import { currentUser, firebaseApp } from './firebase';

class DB extends Dexie {
  cards!: Table<Card, string>;
  constructor() {
    super('monoshiri');
    this.version(1).stores({ cards: 'id, createdAt, category' });
  }
}

const db = new DB();
let cards: Card[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const sortCards = (list: Card[]) => [...list].sort((a, b) => b.createdAt - a.createdAt);

async function firestore() {
  const mod = await import('firebase/firestore/lite');
  return { ...mod, fs: mod.getFirestore(firebaseApp) };
}

export async function loadCards() {
  if (loaded) return;
  loaded = true;
  cards = sortCards(await db.cards.toArray().catch(() => []));
  emit();
  await syncCloud();
}

// Pulls the signed-in user's cards and pushes any local card the cloud lacks (or has older).
// Called on startup and again after a future login switches/links the account, so nothing collected on this device is lost.
export async function syncCloud() {
  try {
    const [{ fs, collection, getDocs, doc, setDoc }, user] = await Promise.all([firestore(), currentUser()]);
    const snap = await getDocs(collection(fs, 'users', user.uid, 'cards'));
    const byId = new Map(cards.map((c) => [c.id, c]));
    const remoteIds = new Map<string, number>();
    snap.forEach((d) => {
      const remote = d.data() as Card;
      remoteIds.set(remote.id, remote.updatedAt);
      const local = byId.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) byId.set(remote.id, { ...remote, photo: local?.photo ?? null });
    });
    cards = sortCards([...byId.values()]);
    await db.cards.bulkPut(cards).catch(() => {});
    emit();
    const push = cards.filter((c) => (remoteIds.get(c.id) ?? -1) < c.updatedAt);
    await Promise.all(
      push.map((c) => {
        const { photo: _photo, ...cloud } = c;
        return setDoc(doc(fs, 'users', user.uid, 'cards', c.id), JSON.parse(JSON.stringify(cloud)));
      }),
    );
  } catch (e) {
    console.warn('cloud sync skipped', e);
  }
}

export async function saveCard(card: Card) {
  cards = sortCards([card, ...cards.filter((c) => c.id !== card.id)]);
  emit();
  await db.cards.put(card).catch(() => {});
  try {
    const [{ fs, doc, setDoc }, user] = await Promise.all([firestore(), currentUser()]);
    const { photo: _photo, ...cloud } = card;
    await setDoc(doc(fs, 'users', user.uid, 'cards', card.id), JSON.parse(JSON.stringify(cloud)));
  } catch (e) {
    console.warn('cloud save failed', e);
  }
}

export async function removeCard(id: string) {
  cards = cards.filter((c) => c.id !== id);
  emit();
  await db.cards.delete(id).catch(() => {});
  try {
    const [{ fs, doc, deleteDoc }, user] = await Promise.all([firestore(), currentUser()]);
    await deleteDoc(doc(fs, 'users', user.uid, 'cards', id));
  } catch (e) {
    console.warn('cloud delete failed', e);
  }
}

export const allCards = () => cards;

export function getCard(id: string) {
  return cards.find((c) => c.id === id);
}

export function useCards() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cards,
  );
}
