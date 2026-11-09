import type { Tier } from './store.ts';
import { AttestError, BudgetError, BusyError, getCached, UserLimitError } from './store.ts';
import { keyOf } from './media.ts';
import { RUBY_LEVELS } from './ai.ts';
import { asLevel, LEVELS, USER_CAP_JPY, type Level } from './config.ts';
import { report } from './report.ts';

export type Env = { Variables: { uid: string; tier: Tier; attested: boolean } };

export const S = { STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY', OBJECT: 'OBJECT', BOOLEAN: 'BOOLEAN' } as const;
export const str = (extra: object = {}) => ({ type: S.STRING, ...extra });
// Model output: a parse failure is a server error, not the client's bad_json (see app.ts).
export const json = <T>(text: string | undefined): T => {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    throw new Error('bad_model_json');
  }
};
export const clean = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Each learning stage has its own cached explanations; 'std' keeps the original keys so existing caches stay in use.
// Stages written with furigana (《》) moved to new keys when the marks were introduced.
export const atLevel = (key: string, level: Level) => (level === 'std' ? key : RUBY_LEVELS.has(level) ? `${key}-${level}-r1` : `${key}-${level}`);
export const levelOf = (v: unknown) => asLevel(v);

export type ExploreDoc = { name?: string; en?: string; summary?: string; oneLiner?: string; funFact?: string; topics?: { title: string; teaser?: string; kind?: string }[] };

// Paid endpoints only work for things the app has already explored (and for their listed topics),
// so the API can't be used as a general-purpose Gemini proxy.
// The listed topic with this title (at this stage first, then any: cards keep the stage they were saved at), or null.
export async function exploredTopic(name: string, topic: string, level: Level = 'std') {
  for (const l of [level, ...LEVELS.filter((x) => x !== level)]) {
    const ex = await getCached<ExploreDoc>('cache_explore', atLevel(keyOf('explore', name), l));
    const t = (ex?.topics ?? []).find((x) => clean(x.title, 80) === topic);
    if (t) return t;
  }
  return null;
}

/** The stored explanation of a thing, at this stage first and then any other (null when it was never explored). */
export async function exploreDoc(name: string, level: Level = 'std') {
  for (const l of [level, ...LEVELS.filter((x) => x !== level)]) {
    const ex = await getCached<ExploreDoc>('cache_explore', atLevel(keyOf('explore', name), l));
    if (ex) return ex;
  }
  return null;
}

// Card illustrations are shared by every stage, so a thing explored at any stage qualifies.
export async function exploredAtAnyLevel(name: string) {
  return !!(await exploreDoc(name));
}

const RUBY = /《[^《》\n]{0,20}》/g;
export const stripRuby = (s: string) => s.replace(RUBY, '');

/** The stored deep dive of a topic, at this stage first and then any other. */
export async function deepText(name: string, topic: string, level: Level = 'std') {
  for (const l of [level, ...LEVELS.filter((x) => x !== level)]) {
    const d = await getCached<{ text: string }>('cache_deep', atLevel(keyOf('deep', name, topic), l));
    if (d?.text) return d.text;
  }
  return null;
}

/**
 * What a diagram or video is about, taken from the stored deep dive (or the explanation) on the server: shared results
 * must not be steered by text a client sends. Plain prose only: no mermaid, furigana or markdown marks.
 */
export async function outlineOf(name: string, topic: string, level: Level = 'std', max = 600) {
  const text = await deepText(name, topic, level);
  const ex = text ? null : await exploreDoc(name, level);
  const t = ex?.topics?.find((x) => clean(x.title, 80) === topic);
  const raw = text ?? [t?.teaser, ex?.summary].filter(Boolean).join('\n');
  return stripRuby(raw)
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/[#*>`_|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const unknown = { error: 'unknown_subject' } as const;

/** The JSON error (and status) for errors the API expects; null for anything else. Streams send the same body as an `error` event. */
export function errorOf(err: unknown): { status: 400 | 402 | 403 | 429 | 503; body: { error: string; tier?: Tier; capJpy?: number } } | null {
  if (err instanceof BudgetError) {
    // The whole app has stopped generating: worth a mail every time.
    report('rejected', 'budget');
    return { status: 402, body: { error: 'budget' } };
  }
  if (err instanceof UserLimitError) return { status: 402, body: { error: 'user_limit', tier: err.tier, capJpy: USER_CAP_JPY[err.tier] } };
  if (err instanceof AttestError) return { status: 403, body: { error: 'attest_required' } };
  // Too many generations of this account running at once.
  if (err instanceof BusyError) return { status: 429, body: { error: 'busy' } };
  // A request body that isn't JSON (c.req.json() throws SyntaxError; model output is parsed with json() above, which doesn't).
  if (err instanceof SyntaxError) return { status: 400, body: { error: 'bad_json' } };
  if ((err as any)?.status === 429) return { status: 503, body: { error: 'busy' } };
  return null;
}
