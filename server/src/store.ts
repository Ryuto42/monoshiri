import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { LOCAL, PROJECT, CAP_USD } from './config.ts';

const app = initializeApp({ projectId: PROJECT });
export const auth = getAuth(app);

const db: Firestore | null = LOCAL ? null : getFirestore(app);
const mem = new Map<string, any>();

export async function getCached<T>(col: string, id: string): Promise<T | null> {
  if (!db) return (mem.get(`${col}/${id}`) as T) ?? null;
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}

export async function setCached(col: string, id: string, data: object) {
  if (!db) return void mem.set(`${col}/${id}`, data);
  await db.collection(col).doc(id).set({ ...data, cachedAt: Date.now() });
}

let spentCache = { usd: 0, at: 0 };

export async function getSpent(): Promise<number> {
  if (!db) return mem.get('spent') ?? 0;
  if (Date.now() - spentCache.at < 5000) return spentCache.usd;
  const snap = await db.collection('meta').doc('usage').get();
  spentCache = { usd: snap.get('spentUsd') ?? 0, at: Date.now() };
  return spentCache.usd;
}

export async function addSpent(usd: number, kind: string) {
  if (!(usd > 0)) return;
  spentCache.usd += usd;
  if (!db) return void mem.set('spent', (mem.get('spent') ?? 0) + usd);
  await db.collection('meta').doc('usage').set(
    { spentUsd: FieldValue.increment(usd), [`by.${kind}`]: FieldValue.increment(usd), updatedAt: Date.now() },
    { merge: true },
  );
}

export async function incrCounter(name: string): Promise<number> {
  if (!db) {
    const v = (mem.get(`c:${name}`) ?? 0) + 1;
    mem.set(`c:${name}`, v);
    return v;
  }
  const ref = db.collection('meta').doc('counters');
  await ref.set({ [name]: FieldValue.increment(1) }, { merge: true });
  return (await ref.get()).get(name) ?? 0;
}

export async function getCounter(name: string): Promise<number> {
  if (!db) return mem.get(`c:${name}`) ?? 0;
  return (await db.collection('meta').doc('counters').get()).get(name) ?? 0;
}

export class BudgetError extends Error {
  constructor() {
    super('budget_exceeded');
  }
}

export async function ensureBudget(reserveUsd: number) {
  if ((await getSpent()) + reserveUsd > CAP_USD) throw new BudgetError();
}
