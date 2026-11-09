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
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const sortCards = (list: Card[]) => [...list].sort((a, b) => b.createdAt - a.createdAt);

let emulated = false;
export async function firestore() {
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
  const stored = await db.cards.toArray().catch(() => [] as Card[]);
  // Photos taken in the app are not kept anymore; drop thumbnails saved by earlier versions.
  const withPhoto = stored.filter((c) => 'photo' in c);
  cards = sortCards(stored.map(({ photo: _photo, ...c }: Card & { photo?: unknown }) => c));
  if (withPhoto.length) await db.cards.bulkPut(cards).catch(() => {});
  emit();
  await syncCloud();
  ready = true;
  emit();
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
  return JSON.parse(JSON.stringify(c));
};

let chain: Promise<void> = Promise.resolve();

// Two-way merge with the signed-in account: newest updatedAt wins, cards deleted elsewhere disappear here,
// and anything collected on this device (including as a guest before logging in) is uploaded. Photos taken in the app are never stored.
// Resolves to true once this device and the account match, false when the sync didn't happen (no confirmed address,
// offline, a failed write).
export function syncCloud(): Promise<boolean> {
  const run = chain.then(runSync);
  chain = run.then(() => {});
  return run;
}

async function runSync(): Promise<boolean> {
    try {
      const [{ fs, collection, getDocs, doc, setDoc, deleteDoc }, user] = await Promise.all([firestore(), currentUser()]);
      if (!canSync(user)) return false;
      const uid = user.uid;
      const state = readState(uid);
      for (const id of state.del) {
        await deleteDoc(doc(fs, 'users', uid, 'cards', id)).catch(() => {});
        patchState(uid, (s) => s.del.delete(id));
      }
      const snap = await getDocs(collection(fs, 'users', uid, 'cards'));
      if (auth.currentUser?.uid !== uid) return false;
      const known = new Set(state.known);
      const byId = new Map(cards.map((c) => [c.id, c]));
      const remote = new Map<string, number>();
      snap.forEach((d) => {
        const r = d.data() as Card;
        remote.set(d.id, r.updatedAt);
        const local = byId.get(d.id);
        if (!local || r.updatedAt > local.updatedAt) byId.set(d.id, r);
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
      return true;
    } catch (e) {
      console.warn('cloud sync skipped', e);
      return false;
    }
}

/** How many of this device's cards would be lost by logging out now (they are not safely in the account). */
export async function cardsAtRisk(): Promise<number> {
  if (!cards.length) return 0;
  return (await syncCloud()) ? 0 : cards.length;
}

export async function saveCard(card: Card) {
  await db.cards.put(card);
  cards = sortCards([card, ...cards.filter((c) => c.id !== card.id)]);
  emit();
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
// Also for an address that was never confirmed: cards collected as a guest were synced under the same uid before the
// email was linked. Such an account can't list its cards (the rules only let it delete), so the ids this device knows
// about are deleted instead.
export async function deleteCloudCards() {
  const [{ fs, collection, getDocs, deleteDoc, doc }, user] = await Promise.all([firestore(), currentUser()]);
  const ids = new Set([...cards.map((c) => c.id), ...readState(user.uid).known]);
  try {
    const snap = await getDocs(collection(fs, 'users', user.uid, 'cards'));
    snap.docs.forEach((d) => ids.add(d.id));
  } catch {
    if (canSync(user)) throw new Error('cloud cards unreadable');
  }
  await Promise.all([...ids].map((id) => deleteDoc(doc(fs, 'users', user.uid, 'cards', id))));
  await deleteDoc(doc(fs, 'users', user.uid)).catch(() => {});
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

export function useCardsLoaded() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => ready);
}
