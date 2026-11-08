import Dexie, { type Table } from 'dexie';
import { useSyncExternalStore } from 'react';
import type { Card } from './types';
import { auth, canSync, currentUser, firebaseApp, onEmulators } from './firebase';

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

let emulated = false;
async function firestore() {
  const mod = await import('firebase/firestore/lite');
  const fs = mod.getFirestore(firebaseApp);
  if (onEmulators && !emulated) {
    emulated = true;
    mod.connectFirestoreEmulator(fs, '127.0.0.1', 8085);
  }
  return { ...mod, fs };
}

export async function loadCards() {
  if (loaded) return;
  loaded = true;
  cards = sortCards(await db.cards.toArray().catch(() => []));
  emit();
  await syncCloud();
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
    last = Date.now();
    void syncCloud();
  });
}

// Per account: ids known to be in the cloud (so a card missing there was deleted on another device) and deletes still to send.
type SyncState = { known: string[]; del: string[] };
const stateKey = (uid: string) => `monoshiri.sync.${uid}`;
function readState(uid: string): SyncState {
  try {
    const s = JSON.parse(localStorage.getItem(stateKey(uid)) ?? '{}');
    return { known: Array.isArray(s.known) ? s.known : [], del: Array.isArray(s.del) ? s.del : [] };
  } catch {
    return { known: [], del: [] };
  }
}
function writeState(uid: string, s: SyncState) {
  try {
    localStorage.setItem(stateKey(uid), JSON.stringify(s));
  } catch {
    /* storage can be unavailable (private mode); sync still works, just without delete tracking */
  }
}
function patchState(uid: string, f: (s: { known: Set<string>; del: Set<string> }) => void) {
  const s = readState(uid);
  const sets = { known: new Set(s.known), del: new Set(s.del) };
  f(sets);
  writeState(uid, { known: [...sets.known], del: [...sets.del] });
}

const toCloud = (c: Card) => {
  const { photo: _photo, ...cloud } = c;
  return JSON.parse(JSON.stringify(cloud));
};

let chain: Promise<void> = Promise.resolve();

// Two-way merge with the signed-in account: newest updatedAt wins, cards deleted elsewhere disappear here,
// and anything collected on this device (including as a guest before logging in) is uploaded. Photos never leave the device.
export function syncCloud(): Promise<void> {
  chain = chain.then(runSync);
  return chain;
}

async function runSync() {
    try {
      const [{ fs, collection, getDocs, doc, setDoc, deleteDoc }, user] = await Promise.all([firestore(), currentUser()]);
      if (!canSync(user)) return;
      const uid = user.uid;
      const state = readState(uid);
      for (const id of state.del) {
        await deleteDoc(doc(fs, 'users', uid, 'cards', id)).catch(() => {});
        patchState(uid, (s) => s.del.delete(id));
      }
      const snap = await getDocs(collection(fs, 'users', uid, 'cards'));
      if (auth.currentUser?.uid !== uid) return;
      const known = new Set(state.known);
      const byId = new Map(cards.map((c) => [c.id, c]));
      const remote = new Map<string, number>();
      snap.forEach((d) => {
        const r = d.data() as Card;
        remote.set(d.id, r.updatedAt);
        const local = byId.get(d.id);
        if (!local || r.updatedAt > local.updatedAt) byId.set(d.id, { ...r, photo: local?.photo ?? null });
      });
      const gone = [...byId.keys()].filter((id) => !remote.has(id) && known.has(id));
      gone.forEach((id) => byId.delete(id));
      cards = sortCards([...byId.values()]);
      await db.cards.bulkDelete(gone).catch(() => {});
      await db.cards.bulkPut(cards).catch(() => {});
      emit();
      const push = cards.filter((c) => (remote.get(c.id) ?? -1) < c.updatedAt);
      await Promise.all(push.map((c) => setDoc(doc(fs, 'users', uid, 'cards', c.id), toCloud(c))));
      writeState(uid, { known: cards.map((c) => c.id), del: [] });
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
    if (!canSync(user)) return;
    await setDoc(doc(fs, 'users', user.uid, 'cards', card.id), toCloud(card));
    patchState(user.uid, (s) => s.known.add(card.id));
  } catch (e) {
    console.warn('cloud save failed', e);
  }
}

export async function removeCard(id: string) {
  cards = cards.filter((c) => c.id !== id);
  emit();
  await db.cards.delete(id).catch(() => {});
  let uid: string | undefined;
  try {
    const [{ fs, doc, deleteDoc }, user] = await Promise.all([firestore(), currentUser()]);
    uid = user.uid;
    if (!canSync(user)) return;
    await deleteDoc(doc(fs, 'users', uid, 'cards', id));
    patchState(uid, (s) => s.known.delete(id));
  } catch (e) {
    if (uid) patchState(uid, (s) => s.del.add(id));
    console.warn('cloud delete failed', e);
  }
}

// Wipes this device's copy (logout / account deletion) so the next person using the device starts from an empty zukan.
export async function clearLocalCards() {
  cards = [];
  emit();
  await db.cards.clear().catch(() => {});
}

// Account deletion: remove every cloud card of the signed-in user before the auth account itself goes away.
export async function deleteCloudCards() {
  const [{ fs, collection, getDocs, deleteDoc }, user] = await Promise.all([firestore(), currentUser()]);
  if (!canSync(user)) return;
  const snap = await getDocs(collection(fs, 'users', user.uid, 'cards'));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  try {
    localStorage.removeItem(stateKey(user.uid));
  } catch {
    /* ignore */
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
