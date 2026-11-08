import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { AsyncLocalStorage } from 'node:async_hooks';
import { LOCAL, PROJECT, CAP_USD, JPY_PER_USD, USER_CAP_JPY } from './config.ts';

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

// Shared results must not be replaced by a later request (a crafted photo could otherwise rewrite what everyone sees).
export async function addCached(col: string, id: string, data: object): Promise<boolean> {
  if (!db) {
    if (mem.has(`${col}/${id}`)) return false;
    mem.set(`${col}/${id}`, data);
    return true;
  }
  try {
    await db.collection(col).doc(id).create({ ...data, cachedAt: Date.now() });
    return true;
  } catch (e: any) {
    if (e?.code === 6) return false;
    throw e;
  }
}

let spentCache = { usd: 0, at: 0 };

export async function getSpent(): Promise<number> {
  if (!db) return mem.get('spent') ?? 0;
  if (Date.now() - spentCache.at < 5000) return spentCache.usd;
  const snap = await db.collection('meta').doc('usage').get();
  spentCache = { usd: snap.get('spentUsd') ?? 0, at: Date.now() };
  return spentCache.usd;
}

export type Tier = 'guest' | 'member';
// Who the current API request is for, so every cost recorded during it is also charged to that account.
export const requester = new AsyncLocalStorage<{ uid: string; tier: Tier }>();

const userCache = new Map<string, { usd: number; at: number }>();

export async function getUserSpent(uid: string): Promise<number> {
  const c = userCache.get(uid);
  if (c && Date.now() - c.at < 5000) return c.usd;
  const usd = !db ? (mem.get(`u:${uid}`) ?? 0) : ((await db.collection('meter_users').doc(uid).get()).get('spentUsd') ?? 0);
  userCache.set(uid, { usd, at: Date.now() });
  if (userCache.size > 5000) userCache.delete(userCache.keys().next().value!);
  return usd;
}

async function addUserSpent(uid: string, usd: number, kind: string) {
  const c = userCache.get(uid);
  if (c) c.usd += usd;
  if (!db) return void mem.set(`u:${uid}`, (mem.get(`u:${uid}`) ?? 0) + usd);
  await db.collection('meter_users').doc(uid).set(
    { spentUsd: FieldValue.increment(usd), [`by.${kind}`]: FieldValue.increment(usd), updatedAt: Date.now() },
    { merge: true },
  );
}

export async function addSpent(usd: number, kind: string) {
  if (!(usd > 0)) return;
  const who = requester.getStore();
  if (who) await addUserSpent(who.uid, usd, kind);
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

export class UserLimitError extends Error {
  readonly tier: Tier;
  constructor(tier: Tier) {
    super('user_limit');
    this.tier = tier;
  }
}

export const userCapUsd = (tier: Tier) => USER_CAP_JPY[tier] / JPY_PER_USD;

export async function ensureBudget(reserveUsd: number) {
  if ((await getSpent()) + reserveUsd > CAP_USD) throw new BudgetError();
  const who = requester.getStore();
  if (who && (await getUserSpent(who.uid)) + reserveUsd > userCapUsd(who.tier)) throw new UserLimitError(who.tier);
}
