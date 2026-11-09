import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { restyleExplorePrompt, ai, CATEGORIES, explorePrompt, grounding, ICONS, namePrompt, TOPIC_KINDS, track } from '../ai.ts';
import { LEVELS, MODELS, type Level } from '../config.ts';
import { atLevel, clean, json, levelOf, S, str, type Env } from '../http.ts';
import { keyOf, wikiSummary } from '../media.ts';
import { track as count } from '../stats.ts';
import { GROUNDED_EST_USD } from './deep.ts';
import { addCached, ensureBudget, getCached, setCached } from '../store.ts';
import { safeSearch } from '../vision.ts';

export const explore = new Hono<Env>();

const exploreSchema = {
  type: S.OBJECT,
  properties: {
    name: str(), reading: str(), en: str(), category: str({ enum: [...CATEGORIES] }), icon: str({ enum: [...ICONS] }),
    oneLiner: str(), summary: str(), funFact: str(),
    topics: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: { title: str(), teaser: str(), kind: str({ enum: [...TOPIC_KINDS] }), icon: str({ enum: [...ICONS] }) },
        required: ['title', 'teaser', 'kind', 'icon'],
      },
    },
    keywords: { type: S.ARRAY, items: str() },
    ok: { type: S.BOOLEAN },
  },
  required: ['name', 'reading', 'en', 'category', 'icon', 'oneLiner', 'summary', 'funFact', 'topics', 'keywords', 'ok'],
};

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

explore.post('/api/explore', async (c) => {
  const body = await c.req.json<{ label: string; image?: string; from?: string; level?: string }>();
  const label = clean(body.label, 30);
  const level = levelOf(body.level);
  if (!label) return c.json({ error: 'bad_label' }, 400);
  // A person told us the photo was misread. Kept (server-only) so detection mistakes can be counted and improved.
  const from = clean(body.from, 30);
  if (from && from !== label) await setCached('corrections', `${Date.now()}-${randomBytes(6).toString('hex')}`, { from, to: label, at: Date.now() });
  // Results are shared by everyone: the same thing photographed under another label resolves through explore_alias.
  const alias = await getCached<{ target: string }>('explore_alias', keyOf('alias', label));
  const base = alias?.target ?? keyOf('explore', label);
  const hit = await getCached<any>('cache_explore', atLevel(base, level));
  if (hit) {
    count({ explore: 1 }, level, c.get('uid'));
    return c.json({ ...hit, id: base, cached: true });
  }
  const again = await restyled(base, level);
  if (again) {
    count({ explore: 1 }, level, c.get('uid'));
    return c.json({ ...again, id: base, cached: true });
  }
  const withImage = !!body.image && body.image.length < 1_500_000;
  await ensureBudget(GROUNDED_EST_USD + (withImage ? 0.005 : 0));
  // The photo only helps decide what the thing is called. The shared explanation is written from the name alone,
  // so a crafted photo can't steer what everyone else reads.
  let subject = label;
  if (withImage) {
    const [ok] = await safeSearch([{ base64: body.image! }]);
    if (!ok) return c.json({ error: 'unsafe_image' }, 422);
    subject = (await nameFromPhoto(label, body.image!)) || label;
    if (subject !== label) {
      const known = await getCached<{ target: string }>('explore_alias', keyOf('alias', subject));
      const hit2 = await getCached<any>('cache_explore', atLevel(known?.target ?? keyOf('explore', subject), level));
      if (hit2) {
        count({ explore: 1 }, level, c.get('uid'));
        return c.json({ ...hit2, id: known?.target ?? keyOf('explore', subject), cached: true });
      }
      const again2 = await restyled(known?.target ?? keyOf('explore', subject), level);
      if (again2) {
        count({ explore: 1 }, level, c.get('uid'));
        return c.json({ ...again2, id: known?.target ?? keyOf('explore', subject), cached: true });
      }
    }
  }
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
  // Names now come from people too (typed or corrected), so a name Gemini judges unfit never reaches the shared cache.
  if (!data) throw new Error('empty_explore');
  if (data.ok === false) return c.json({ error: 'not_a_thing' }, 422);
  delete data.ok;
  // Names and topic titles are keys (cache, card id, deep-dive checks), so they never carry reading marks.
  data.name = plain(data.name, 30) || subject;
  data.topics = (data.topics ?? []).slice(0, 6).map((t: any, i: number) => ({ id: `t${i}`, ...t, title: plain(t.title, 80) }));
  const wiki = await wikiSummary(data.name).catch(() => null);
  // The card id is the stage-independent key, so the same thing stays one card whatever stage it was read at.
  const key = keyOf('explore', data.name);
  const levelKey = atLevel(key, level);
  const existing = await getCached<any>('cache_explore', levelKey);
  if (existing) {
    await addCached('explore_alias', keyOf('alias', label), { target: key, name: label });
    count({ explore: 1 }, level, c.get('uid'));
    return c.json({ ...existing, id: key, cached: true });
  }
  const out = { id: key, label, ...data, entryPoint: g.entryPoint, queries: g.queries, wiki, foundAt: Date.now(), level };
  // create() only succeeds once, so exactly one person becomes the first finder even if two explore the same thing at once.
  const created = await addCached('cache_explore', levelKey, out);
  const names = new Set([label, data.name, clean(data.en, 40)].filter(Boolean));
  await Promise.all([...names].map((n) => addCached('explore_alias', keyOf('alias', n), { target: key, name: n })));
  count({ explore: 1, explore_new: created ? 1 : 0 }, level, c.get('uid'));
  if (!created) return c.json({ ...((await getCached<object>('cache_explore', levelKey)) ?? out), id: key, cached: true });
  // Reading something at a new stage isn't a first find if it was already explored at another one.
  const firstFind = level === 'std' || !(await getCached<object>('cache_explore', key));
  return c.json({ ...out, ...(firstFind && { firstFind: true }) });
});
