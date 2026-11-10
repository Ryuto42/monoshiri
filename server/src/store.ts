import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { AsyncLocalStorage } from 'node:async_hooks';
import { GROUNDING_FREE_PER_MONTH, APPCHECK_ENFORCE, LOCAL, PROJECT, CAP_USD, JPY_PER_USD, UNATTESTED_POOL_JPY, USER_CAP_JPY } from './config.ts';

const app = initializeApp({ projectId: PROJECT });
export const auth = getAuth(app);

export const db: Firestore | null = LOCAL ? null : getFirestore(app);
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

export type Tier = 'guest' | 'member' | 'admin';
// Who the current API request is for, so every cost recorded during it is also charged to that account.
// attested: the request carried a valid App Check token (it came from our own app).
// reservedUsd / running: what this request has reserved with ensureBudget and whether it counts as a running generation;
// holds: the request itself plus any stream still writing after the handler returned (see holdRequest).
export type Requester = { uid: string; tier: Tier; attested: boolean; unattested?: boolean; reservedUsd?: number; running?: boolean; holds?: number };
export const requester = new AsyncLocalStorage<Requester>();

// Generation still running, per account. Spend is only recorded when a call finishes, so without these reservations
// several requests started at once would each see the same, still-low meter and could together pass the caps.
const inflight = new Map<string, { usd: number; running: number }>();
let inflightUsd = 0;
export const MAX_RUNNING_PER_USER = 3;

function unreserve(who: Requester, usd: number) {
  const take = Math.min(usd, who.reservedUsd ?? 0);
  if (!(take > 0)) return;
  // Rounded so float leftovers don't linger as a reservation.
  const sub = (a: number) => (a - take < 1e-9 ? 0 : a - take);
  who.reservedUsd = sub(who.reservedUsd ?? 0);
  inflightUsd = sub(inflightUsd);
  const f = inflight.get(who.uid);
  if (f) f.usd = sub(f.usd);
}

function finish(who: Requester) {
  unreserve(who, who.reservedUsd ?? 0);
  const f = inflight.get(who.uid);
  if (f && who.running) f.running--;
  who.running = false;
  if (f && f.running <= 0 && f.usd <= 0) inflight.delete(who.uid);
}

/** Runs a request with its reservations released when it is over (success or failure), including any stream it left open. */
export async function runAs<T>(who: Requester, fn: () => Promise<T>): Promise<T> {
  who.holds = 1;
  try {
    return await requester.run(who, fn);
  } finally {
    if (--who.holds === 0) finish(who);
  }
}

/** For a response that keeps working after the handler returns (SSE): call the returned function when it is done. */
export function holdRequest(): () => void {
  const who = requester.getStore();
  if (!who) return () => {};
  who.holds = (who.holds ?? 0) + 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--who.holds! === 0) finish(who);
  };
}

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

// Today's spend by guests without App Check (JST days), against UNATTESTED_POOL_JPY.
const poolDay = () => `d${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '')}`;
let poolCache = { day: '', usd: 0, at: 0 };
async function getPoolSpent(): Promise<number> {
  const day = poolDay();
  if (poolCache.day === day && Date.now() - poolCache.at < 5000) return poolCache.usd;
  const usd = !db ? (mem.get(`p:${day}`) ?? 0) : (((await db.collection('meta').doc('unattested').get()).get(day) as number | undefined) ?? 0);
  poolCache = { day, usd, at: Date.now() };
  return usd;
}
async function addPoolSpent(usd: number) {
  const day = poolDay();
  if (poolCache.day === day) poolCache.usd += usd;
  if (!db) return void mem.set(`p:${day}`, (mem.get(`p:${day}`) ?? 0) + usd);
  await db.collection('meta').doc('unattested').set({ [day]: FieldValue.increment(usd) }, { merge: true });
}

export async function addSpent(usd: number, kind: string) {
  if (!(usd > 0)) return;
  const who = requester.getStore();
  if (who?.unattested) await addPoolSpent(usd);
  // What was reserved for this request turns into recorded spend.
  if (who) unreserve(who, usd);
  if (who) await addUserSpent(who.uid, usd, kind);
  spentCache.usd += usd;
  if (!db) return void mem.set('spent', (mem.get('spent') ?? 0) + usd);
  await db.collection('meta').doc('usage').set(
    { spentUsd: FieldValue.increment(usd), [`by.${kind}`]: FieldValue.increment(usd), updatedAt: Date.now() },
    { merge: true },
  );
}

// Takes one of `limit` slots atomically, so two requests at the same moment can't both take the last one.
export async function reserveCounter(name: string, limit: number): Promise<boolean> {
  if (!db) {
    const v = mem.get(`c:${name}`) ?? 0;
    if (v >= limit) return false;
    mem.set(`c:${name}`, v + 1);
    return true;
  }
  const ref = db.collection('meta').doc('counters');
  return db.runTransaction(async (tx) => {
    const v = ((await tx.get(ref)).get(name) as number | undefined) ?? 0;
    if (v >= limit) return false;
    tx.set(ref, { [name]: v + 1 }, { merge: true });
    return true;
  });
}

// Counts this month's Google Search queries (JST months) and returns how many of these n are past the free allowance.
export async function billableSearches(n: number): Promise<number> {
  if (!(n > 0)) return 0;
  const month = `g${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7).replace('-', '')}`;
  const past = (before: number) => Math.max(0, before + n - Math.max(before, GROUNDING_FREE_PER_MONTH));
  if (!db) {
    const before = mem.get(`c:${month}`) ?? 0;
    mem.set(`c:${month}`, before + n);
    return past(before);
  }
  const ref = db.collection('meta').doc('grounding');
  return db.runTransaction(async (tx) => {
    const before = ((await tx.get(ref)).get(month) as number | undefined) ?? 0;
    tx.set(ref, { [month]: before + n }, { merge: true });
    return past(before);
  });
}

// Gives a slot back when the work it was taken for never started.
export async function releaseCounter(name: string) {
  if (!db) return void mem.set(`c:${name}`, Math.max(0, (mem.get(`c:${name}`) ?? 0) - 1));
  await db.collection('meta').doc('counters').set({ [name]: FieldValue.increment(-1) }, { merge: true });
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

export class AttestError extends Error {
  constructor() {
    super('attest_required');
  }
}

export class UserLimitError extends Error {
  readonly tier: Tier;
  constructor(tier: Tier) {
    super('user_limit');
    this.tier = tier;
  }
}

export class BusyError extends Error {
  constructor() {
    super('busy');
  }
}

export const userCapUsd = (tier: Tier) => USER_CAP_JPY[tier] / JPY_PER_USD;

/**
 * Checks the caps and reserves `reserveUsd` (an estimate close to the real cost) for this request until it is over.
 * attest: false lets guests without App Check through without using the shared pool (detection: the native apps can't attest,
 * and the caps still apply).
 */
export async function ensureBudget(reserveUsd: number, { attest = true }: { attest?: boolean } = {}) {
  const who = requester.getStore();
  // Anonymous accounts are free to create, so new generation for guests without proof that the request came from the app
  // itself (the native apps can't attest) comes out of one shared daily pool; once that is used up they need an account.
  if (attest && APPCHECK_ENFORCE && who && who.tier === 'guest' && !who.attested) {
    if ((await getPoolSpent()) + reserveUsd > UNATTESTED_POOL_JPY / JPY_PER_USD) throw new AttestError();
    who.unattested = true;
  }
  const spent = await getSpent();
  const userSpent = who ? await getUserSpent(who.uid) : 0;
  // No await from here on, so requests arriving together see each other's reservations.
  const f = (who && inflight.get(who.uid)) || { usd: 0, running: 0 };
  if (who && !who.running && who.tier !== 'admin' && f.running >= MAX_RUNNING_PER_USER) throw new BusyError();
  if (spent + inflightUsd + reserveUsd > CAP_USD) throw new BudgetError();
  if (who && userSpent + f.usd + reserveUsd > userCapUsd(who.tier)) throw new UserLimitError(who.tier);
  if (!who) return;
  if (!who.running) {
    who.running = true;
    f.running++;
  }
  f.usd += reserveUsd;
  inflightUsd += reserveUsd;
  who.reservedUsd = (who.reservedUsd ?? 0) + reserveUsd;
  inflight.set(who.uid, f);
}

export const inflightOf = (uid: string) => ({ ...(inflight.get(uid) ?? { usd: 0, running: 0 }) });

// Tests start from an empty in-memory store.
export function resetMemory() {
  mem.clear();
  inflight.clear();
  inflightUsd = 0;
  userCache.clear();
  spentCache = { usd: 0, at: 0 };
  poolCache = { day: '', usd: 0, at: 0 };
}
