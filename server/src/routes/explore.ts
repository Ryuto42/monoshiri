import { Hono } from 'hono';
import { ai, CATEGORIES, explorePrompt, grounding, ICONS, TOPIC_KINDS, track } from '../ai.ts';
import { MODELS } from '../config.ts';
import { atLevel, clean, json, levelOf, S, str, type Env } from '../http.ts';
import { keyOf, wikiSummary } from '../media.ts';
import { track as count } from '../stats.ts';
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

explore.post('/api/explore', async (c) => {
  const body = await c.req.json<{ label: string; image?: string; from?: string; level?: string }>();
  const label = clean(body.label, 30);
  const level = levelOf(body.level);
  if (!label) return c.json({ error: 'bad_label' }, 400);
  // A person told us the photo was misread. Kept (server-only) so detection mistakes can be counted and improved.
  const from = clean(body.from, 30);
  if (from && from !== label) await setCached('corrections', `${Date.now()}-${c.get('uid')}`, { from, to: label, at: Date.now() });
  // Results are shared by everyone: the same thing photographed under another label resolves through explore_alias.
  const alias = await getCached<{ target: string }>('explore_alias', keyOf('alias', label));
  const base = alias?.target ?? keyOf('explore', label);
  const hit = await getCached<any>('cache_explore', atLevel(base, level));
  if (hit) {
    count({ explore: 1 }, level, c.get('uid'));
    return c.json({ ...hit, id: base, cached: true });
  }
  await ensureBudget(0.012);
  const parts: any[] = [{ text: explorePrompt(label, level) }];
  if (body.image && body.image.length < 1_500_000) {
    const [ok] = await safeSearch([{ base64: body.image }]);
    if (!ok) return c.json({ error: 'unsafe_image' }, 422);
    parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: body.image } });
  }
  const res = await ai.models.generateContent({
    model: MODELS.explore,
    contents: [{ role: 'user', parts }],
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
  data.name = plain(data.name, 30) || label;
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
