import type { Tier } from './store.ts';
import { getCached } from './store.ts';
import { keyOf } from './media.ts';
import { RUBY_LEVELS } from './ai.ts';
import { asLevel, LEVELS, type Level } from './config.ts';

export type Env = { Variables: { uid: string; tier: Tier; attested: boolean } };

export const S = { STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY', OBJECT: 'OBJECT', BOOLEAN: 'BOOLEAN' } as const;
export const str = (extra: object = {}) => ({ type: S.STRING, ...extra });
export const json = <T>(text: string | undefined): T => JSON.parse(text ?? 'null');
export const clean = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Each learning stage has its own cached explanations; 'std' keeps the original keys so existing caches stay in use.
// Stages written with furigana (《》) moved to new keys when the marks were introduced.
export const atLevel = (key: string, level: Level) => (level === 'std' ? key : RUBY_LEVELS.has(level) ? `${key}-${level}-r1` : `${key}-${level}`);
export const levelOf = (v: unknown) => asLevel(v);

export type ExploreDoc = { name?: string; en?: string; summary?: string; oneLiner?: string; funFact?: string; topics?: { title: string; teaser?: string }[] };

// Paid endpoints only work for things the app has already explored (and for their listed topics),
// so the API can't be used as a general-purpose Gemini proxy.
export async function explored(name: string, topic?: string, level: Level = 'std') {
  const ex = await getCached<ExploreDoc>('cache_explore', atLevel(keyOf('explore', name), level));
  if (!ex) return false;
  return topic === undefined || (ex.topics ?? []).some((t) => clean(t.title, 80) === topic);
}

// Card illustrations are shared by every stage, so a thing explored at any stage qualifies.
export async function exploredAtAnyLevel(name: string) {
  for (const level of LEVELS) if (await explored(name, undefined, level)) return true;
  return false;
}

export const unknown = { error: 'unknown_subject' } as const;
