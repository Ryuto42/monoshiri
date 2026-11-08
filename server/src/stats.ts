import { FieldValue } from 'firebase-admin/firestore';
import { db } from './store.ts';

// Learning is counted as daily totals only: no uid or other personal detail is ever stored with an event.
// Each day is spread over a few documents so a busy moment doesn't hit Firestore's per-document write rate.
const SHARDS = 10;
const mem = new Map<string, Record<string, number>>();
const seenToday = new Set<string>();
let seenDay = '';

export const EVENTS = new Set([
  'detect', 'explore', 'explore_new', 'topic_open', 'quiz', 'card_illust', 'tts', 'units',
  'quiz_answer', 'quiz_correct', 'card_save', 'unit_view', 'mission_start', 'mission_done', 'stage_set', 'zukan_units',
]);
export const CLIENT_EVENTS = new Set(['quiz_answer', 'quiz_correct', 'card_save', 'unit_view', 'mission_start', 'mission_done', 'stage_set', 'zukan_units']);

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function count(events: Record<string, number>, level: string, uid?: string) {
  const date = today();
  if (date !== seenDay) {
    seenDay = date;
    seenToday.clear();
  }
  // A person is counted once a day per server instance; the uid itself is only kept in memory.
  const newUser = !!uid && !seenToday.has(uid);
  if (uid) seenToday.add(uid);
  if (seenToday.size > 50_000) seenToday.clear();
  const fields: Record<string, unknown> = { date };
  for (const [name, n] of Object.entries(events)) {
    if (!EVENTS.has(name) || !(n > 0)) continue;
    fields[`e.${name}`] = n;
    fields[`el.${name}@${level}`] = n;
  }
  if (newUser) fields.users = 1;
  if (Object.keys(fields).length === 1) return;
  if (!db) {
    const row = mem.get(date) ?? {};
    for (const [k, v] of Object.entries(fields)) if (typeof v === 'number') row[k] = (row[k] ?? 0) + v;
    mem.set(date, row);
    return;
  }
  // set() with merge folds nested maps key by key, so increments from concurrent first writes all count.
  const inc = (v: number) => FieldValue.increment(v);
  const doc: Record<string, any> = { date, e: {}, el: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'number') continue;
    if (k.startsWith('e.')) doc.e[k.slice(2)] = inc(v);
    else if (k.startsWith('el.')) doc.el[k.slice(3)] = inc(v);
    else if (k === 'users') doc.users = inc(v);
  }
  await db.collection('stats_daily').doc(`${date}_${Math.floor(Math.random() * SHARDS)}`).set(doc, { merge: true });
}

// Never lets counting break or slow down a request.
export function track(events: Record<string, number>, level: string, uid?: string) {
  void count(events, level, uid).catch((e) => console.error('stats failed', e));
}

export const memStats = () => mem;
export function resetStats() {
  mem.clear();
  seenToday.clear();
}
