import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomBytes } from 'node:crypto';
import {
  restyleExplorePrompt, ai, CATEGORIES, explorePrompt, exploreQuickPrompt, exploreRestPrompt, grounding, ICONS, namePrompt, TOPIC_KINDS, track, type ExploreDraft,
} from '../ai.ts';
import { LEVELS, LOCAL, MODELS, type Level } from '../config.ts';
import { atLevel, clean, errorOf, json, levelOf, S, str, type Env } from '../http.ts';
import { keyOf, wikiSummary } from '../media.ts';
import { track as count } from '../stats.ts';
import { GROUNDED_EST_USD } from './deep.ts';
import { addCached, ensureBudget, getCached, holdRequest, setCached } from '../store.ts';
import { safeSearch } from '../vision.ts';
import { errorText, report } from '../report.ts';

export const explore = new Hono<Env>();

const front = {
  name: str(), reading: str(), en: str(), category: str({ enum: [...CATEGORIES] }), icon: str({ enum: [...ICONS] }), oneLiner: str(), summary: str(),
};
const back = {
  funFact: str(),
  topics: {
    type: S.ARRAY,
    items: {
      type: S.OBJECT,
      properties: { title: str(), teaser: str(), kind: str({ enum: [...TOPIC_KINDS] }), icon: str({ enum: [...ICONS] }) },
      required: ['title', 'teaser', 'kind', 'icon'],
    },
  },
  keywords: { type: S.ARRAY, items: str() },
};
const exploreSchema = {
  type: S.OBJECT,
  properties: { ...front, ...back, ok: { type: S.BOOLEAN } },
  required: ['name', 'reading', 'en', 'category', 'icon', 'oneLiner', 'summary', 'funFact', 'topics', 'keywords', 'ok'],
};
const quickSchema = { type: S.OBJECT, properties: { ...front, ok: { type: S.BOOLEAN } }, required: [...Object.keys(front), 'ok'] };
const restSchema = {
  type: S.OBJECT,
  properties: { oneLiner: str(), summary: str(), category: front.category, ...back },
  required: ['oneLiner', 'summary', 'funFact', 'topics', 'keywords'],
};

// Only the correction fields may replace the draft. The fun fact comes from the grounded step only; if it is still empty
// the card is saved without it (the screen hides the box) rather than failing the whole explanation.
export function mergeExploreRest<T extends ExploreDraft>(draft: T, rest: {
  oneLiner?: string | null; summary?: string | null; category?: string | null; funFact?: string | null;
}) {
  const funFact = clean(rest.funFact, 400);
  const category = clean(rest.category, 20);
  return {
    ...draft,
    oneLiner: clean(rest.oneLiner, 200) || draft.oneLiner,
    summary: clean(rest.summary, 2000) || draft.summary,
    category: CATEGORIES.some((c) => c === category) ? category : draft.category,
    funFact,
  };
}

const plain = (s: unknown, max: number) => clean(String(s ?? '').replace(/《[^《》\n]{0,20}》/g, ''), max);

// Lets the app say "nobody has explored this yet" while a new explanation is being written. Reads the cache only.
explore.get('/api/known', async (c) => {
  const label = clean(c.req.query('label'), 30);
  if (!label) return c.json({ error: 'bad_label' }, 400);
  const alias = await getCached<{ target: string }>('explore_alias', keyOf('alias', label));
  const hit = await getCached<object>('cache_explore', alias?.target ?? keyOf('explore', label));
  return c.json({ known: !!hit });
});

// A short look at the photo: the general name of what the label points at (the label itself when it already fits).
async function nameFromPhoto(label: string, image: string) {
  const res = await ai.models.generateContent({
    model: MODELS.detect,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text: namePrompt(label) }] }],
    config: {
      thinkingConfig: { thinkingLevel: 'MINIMAL' as any },
      responseMimeType: 'application/json',
      responseSchema: { type: S.OBJECT, properties: { name: str() }, required: ['name'] },
    },
  });
  await track(MODELS.detect, res.usageMetadata, 'explore_name');
  try {
    return plain(JSON.parse(res.text ?? 'null')?.name, 30);
  } catch {
    return '';
  }
}

// The same thing already explained at another stage: rewrite that one for this stage instead of searching again.
async function restyled(base: string, level: Level) {
  let src: any = null;
  for (const l of LEVELS) {
    if (l === level) continue;
    src = await getCached<any>('cache_explore', atLevel(base, l));
    if (src) break;
  }
  if (!src) return null;
  // Cheap and only for things already explained, so the native apps (no App Check) can read every stage too.
  await ensureBudget(0.004, { attest: false });
  const topics: any[] = src.topics ?? [];
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: restyleExplorePrompt(level, { name: src.name, oneLiner: src.oneLiner, summary: src.summary, funFact: src.funFact, teasers: topics.map((t) => t.teaser ?? '') }),
    config: {
      thinkingConfig: { thinkingLevel: 'MINIMAL' as any },
      responseMimeType: 'application/json',
      responseSchema: {
        type: S.OBJECT,
        properties: { oneLiner: str(), summary: str(), funFact: str(), teasers: { type: S.ARRAY, items: str() } },
        required: ['oneLiner', 'summary', 'funFact', 'teasers'],
      },
    },
  });
  await track(MODELS.quiz, res.usageMetadata, 'restyle');
  const d = json<any>(res.text);
  if (!d?.summary) return null;
  const out = {
    ...src,
    oneLiner: clean(d.oneLiner, 200) || src.oneLiner,
    summary: clean(d.summary, 2000) || src.summary,
    funFact: clean(d.funFact, 400) || src.funFact,
    topics: topics.map((t, i) => ({ ...t, teaser: clean(d.teasers?.[i], 200) || t.teaser })),
    level,
    restyledFrom: src.level ?? 'std',
  };
  delete out.firstFind;
  await addCached('cache_explore', atLevel(base, level), out);
  return (await getCached<any>('cache_explore', atLevel(base, level))) ?? out;
}

type ExploreRequest = { label: string; level: Level; from: string; image: string | null };
type Grounding = ReturnType<typeof grounding>;
// What is known before anything new is written: a finished explanation, a refusal, or the name to write one for.
type Prepared = { done: object } | { refused: 'unsafe_image' } | { subject: string };

async function readRequest(c: Context<Env>): Promise<ExploreRequest> {
  const body = await c.req.json<{ label: string; image?: string; from?: string; level?: string }>();
  const image = typeof body.image === 'string' && body.image && body.image.length < 1_500_000 ? body.image : null;
  return { label: clean(body.label, 30), level: levelOf(body.level), from: clean(body.from, 30), image };
}

// Already explained at this stage, or at another one (rewritten for this stage): the finished response, or null.
async function stored(base: string, level: Level) {
  const hit = (await getCached<any>('cache_explore', atLevel(base, level))) ?? (await restyled(base, level));
  return hit && { ...hit, id: base, cached: true };
}

async function prepare(r: ExploreRequest, uid: string): Promise<Prepared> {
  const { label, level } = r;
  // A person told us the photo was misread. Kept (server-only) so detection mistakes can be counted and improved.
  if (r.from && r.from !== label) await setCached('corrections', `${Date.now()}-${randomBytes(6).toString('hex')}`, { from: r.from, to: label, at: Date.now() });
  // Results are shared by everyone: the same thing photographed under another label resolves through explore_alias.
  const alias = await getCached<{ target: string }>('explore_alias', keyOf('alias', label));
  const hit = await stored(alias?.target ?? keyOf('explore', label), level);
  if (hit) {
    count({ explore: 1 }, level, uid);
    return { done: hit };
  }
  await ensureBudget(GROUNDED_EST_USD + 0.002 + (r.image ? 0.005 : 0));
  if (!r.image) return { subject: label };
  // The photo only helps decide what the thing is called. The shared explanation is written from the name alone,
  // so a crafted photo can't steer what everyone else reads. Both look at the photo at once; the name is dropped if it isn't safe.
  const [[ok], named] = await Promise.all([safeSearch([{ base64: r.image }], 'explore'), nameFromPhoto(label, r.image)]);
  if (!ok) return { refused: 'unsafe_image' };
  const subject = named || label;
  if (subject !== label) {
    const known = await getCached<{ target: string }>('explore_alias', keyOf('alias', subject));
    const hit2 = await stored(known?.target ?? keyOf('explore', subject), level);
    if (hit2) {
      count({ explore: 1 }, level, uid);
      return { done: hit2 };
    }
  }
  return { subject };
}

// The whole card in one grounded call (the JSON endpoint, kept for app versions that don't read the stream).
async function writeWhole(subject: string, level: Level) {
  const res = await ai.models.generateContent({
    model: MODELS.explore,
    contents: [{ role: 'user', parts: [{ text: explorePrompt(subject, level) }] }],
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: 'LOW' as any },
      responseMimeType: 'application/json',
      responseSchema: exploreSchema,
    },
  });
  const g = grounding(res);
  await track(MODELS.explore, res.usageMetadata, 'explore', 0, g.queries.length);
  const data = json<any>(res.text);
  if (!data) throw new Error('empty_explore');
  return { data, g };
}

// Step 1 of the stream: the front of the card from a light model, without search. null when the name isn't fit to explain.
async function writeQuick(subject: string, level: Level) {
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: [{ role: 'user', parts: [{ text: exploreQuickPrompt(subject, level) }] }],
    config: { thinkingConfig: { thinkingLevel: 'MINIMAL' as any }, responseMimeType: 'application/json', responseSchema: quickSchema },
  });
  await track(MODELS.quiz, res.usageMetadata, 'explore_quick');
  const d = json<any>(res.text);
  if (!d) throw new Error('empty_explore');
  if (d.ok === false) return null;
  return {
    name: plain(d.name, 30) || subject, reading: clean(d.reading, 60), en: clean(d.en, 60), category: clean(d.category, 20), icon: clean(d.icon, 40),
    oneLiner: clean(d.oneLiner, 200), summary: clean(d.summary, 2000),
  };
}

// Step 2: check the whole draft with Google Search and write the rest of the card.
async function writeRest(quick: ExploreDraft, level: Level) {
  const res = await ai.models.generateContent({
    model: MODELS.explore,
    contents: [{ role: 'user', parts: [{ text: exploreRestPrompt(quick, level) }] }],
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: 'LOW' as any },
      responseMimeType: 'application/json',
      responseSchema: restSchema,
    },
  });
  const g = grounding(res);
  await track(MODELS.explore, res.usageMetadata, 'explore', 0, g.queries.length);
  const d = json<any>(res.text);
  if (!d?.topics?.length) throw new Error('empty_explore');
  return { data: { ...mergeExploreRest(quick, d), topics: d.topics, keywords: d.keywords ?? [] }, g };
}

// Stores a newly written explanation for everyone and returns what the requester gets.
async function save(r: ExploreRequest, uid: string, subject: string, data: any, g: Grounding, wiki?: Promise<unknown>) {
  const { label, level } = r;
  delete data.ok;
  // Names and topic titles are keys (cache, card id, deep-dive checks), so they never carry reading marks.
  data.name = plain(data.name, 30) || subject;
  data.topics = (data.topics ?? []).slice(0, 6).map((t: any, i: number) => ({ id: `t${i}`, ...t, title: plain(t.title, 80) }));
  const w = await (wiki ?? wikiSummary(data.name)).catch(() => null);
  // The card id is the stage-independent key, so the same thing stays one card whatever stage it was read at.
  const key = keyOf('explore', data.name);
  const levelKey = atLevel(key, level);
  const existing = await getCached<any>('cache_explore', levelKey);
  if (existing) {
    await addCached('explore_alias', keyOf('alias', label), { target: key, name: label });
    count({ explore: 1 }, level, uid);
    return { ...existing, id: key, cached: true };
  }
  const out = { id: key, label, ...data, entryPoint: g.entryPoint, queries: g.queries, wiki: w, foundAt: Date.now(), level };
  // create() only succeeds once, so exactly one person becomes the first finder even if two explore the same thing at once.
  const created = await addCached('cache_explore', levelKey, out);
  const names = new Set([label, data.name, clean(data.en, 40)].filter(Boolean));
  await Promise.all([...names].map((n) => addCached('explore_alias', keyOf('alias', n), { target: key, name: n })));
  count({ explore: 1, explore_new: created ? 1 : 0 }, level, uid);
  if (!created) return { ...((await getCached<object>('cache_explore', levelKey)) ?? out), id: key, cached: true };
  // Reading something at a new stage isn't a first find if it was already explored at another one.
  const firstFind = level === 'std' || !(await getCached<object>('cache_explore', key));
  return { ...out, ...(firstFind && { firstFind: true }) };
}

explore.post('/api/explore', async (c) => {
  const r = await readRequest(c);
  if (!r.label) return c.json({ error: 'bad_label' }, 400);
  const uid = c.get('uid');
  const p = await prepare(r, uid);
  if ('done' in p) return c.json(p.done);
  if ('refused' in p) return c.json({ error: p.refused }, 422);
  const { data, g } = await writeWhole(p.subject, r.level);
  // Names now come from people too (typed or corrected), so a name Gemini judges unfit never reaches the shared cache.
  if (data.ok === false) {
    report('rejected', 'not_a_thing', { where: 'explore', label: p.subject });
    return c.json({ error: 'not_a_thing' }, 422);
  }
  return c.json(await save(r, uid, p.subject, data, g));
});

// The same explanation in two steps (SSE): `quick` with the front of the card within seconds, then `done` with the whole
// card once the rest has been written and checked with Google Search. Cached ones come as a single `done`.
explore.post('/api/explore/stream', async (c) => {
  const r = await readRequest(c);
  if (!r.label) return c.json({ error: 'bad_label' }, 400);
  const uid = c.get('uid');
  // The stream keeps generating after this handler returns; the reservation is released when it ends.
  const release = holdRequest();
  return streamSSE(c, async (stream) => {
    const send = (event: 'quick' | 'done' | 'error', data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    try {
      const p = await prepare(r, uid);
      if ('done' in p) return void (await send('done', p.done));
      if ('refused' in p) return void (await send('error', { error: p.refused }));
      const quick = await writeQuick(p.subject, r.level);
      if (!quick) {
        report('rejected', 'not_a_thing', { where: 'explore', label: p.subject });
        return void (await send('error', { error: 'not_a_thing' }));
      }
      const key = keyOf('explore', quick.name);
      // The name it settled on may already be explained (e.g. a typed label written differently): no search needed then.
      const hit = await stored(key, r.level);
      if (hit) {
        await addCached('explore_alias', keyOf('alias', r.label), { target: key, name: r.label });
        count({ explore: 1 }, r.level, uid);
        return void (await send('done', hit));
      }
      await send('quick', { id: key, label: r.label, ...quick, level: r.level });
      const wiki = wikiSummary(quick.name).catch(() => null);
      const rest = await writeRest(quick, r.level);
      await send('done', await save(r, uid, p.subject, rest.data, rest.g, wiki));
    } catch (e: any) {
      const known = errorOf(e);
      if (!known) report('failed', 'internal', { where: 'explore/stream', detail: errorText(e) });
      await send('error', known?.body ?? { error: 'internal', ...(LOCAL && { message: String(e?.message ?? e).slice(0, 200) }) });
    } finally {
      release();
    }
  });
});
