import fs from 'node:fs';
import { Hono } from 'hono';
import { ai, track, unitsPrompt } from '../ai.ts';
import { CAP_JPY, JPY_PER_USD, LEVELS, MODELS, USER_CAP_JPY, VIDEO_LIMIT, type Level } from '../config.ts';
import { atLevel, clean, levelOf, S, str, unknown, type Env, type ExploreDoc } from '../http.ts';
import { keyOf } from '../media.ts';
import { CLIENT_EVENTS, track as count } from '../stats.ts';
import { ensureBudget, getCached, getCounter, getSpent, getUserSpent, setCached } from '../store.ts';

export const learn = new Hono<Env>();

type Unit = { id: string; grade: string; subject: string; unit: string; examples: string[] };
let units: Unit[] | null = null;
// The course-of-study list (学習指導要領) shared with the web app; Gemini may only pick ids from it.
export function curriculum(): Unit[] {
  units ??= JSON.parse(fs.readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8')) as Unit[];
  return units;
}

learn.post('/api/units', async (c) => {
  const { name, level } = await c.req.json<{ name: string; level?: string }>();
  const n = clean(name, 30);
  if (!n) return c.json({ error: 'bad_name' }, 400);
  // Units don't depend on the reader's stage, so one result per thing is shared by every stage.
  const key = keyOf('units', n);
  const hit = await getCached<{ units: { id: string; why: string }[] }>('cache_units', key);
  if (hit) {
    count({ units: 1 }, levelOf(level), c.get('uid'));
    return c.json({ units: hit.units });
  }
  const first = levelOf(level);
  let ex: ExploreDoc | null = null;
  for (const l of [first, ...LEVELS.filter((x) => x !== first)] as Level[]) {
    ex = await getCached<ExploreDoc>('cache_explore', atLevel(keyOf('explore', n), l));
    if (ex) break;
  }
  if (!ex) return c.json(unknown, 400);
  await ensureBudget(0.004);
  const list = curriculum();
  const lines = list.map((u) => `${u.id}|${u.grade}|${u.subject}|${u.unit}|${u.examples.join('・')}`).join('\n');
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: unitsPrompt(n, ex.en ?? '', String(ex.summary ?? '').replace(/《[^《》\n]{0,20}》/g, ''), lines),
    config: {
      thinkingConfig: { thinkingLevel: 'LOW' as any },
      responseMimeType: 'application/json',
      responseSchema: {
        type: S.OBJECT,
        properties: {
          units: {
            type: S.ARRAY,
            items: { type: S.OBJECT, properties: { id: str({ enum: list.map((u) => u.id) }), why: str() }, required: ['id', 'why'] },
          },
        },
        required: ['units'],
      },
    },
  });
  await track(MODELS.quiz, res.usageMetadata, 'units');
  const ids = new Set(list.map((u) => u.id));
  const seen = new Set<string>();
  const picked = ((JSON.parse(res.text ?? 'null')?.units ?? []) as { id: string; why: string }[])
    .filter((u) => ids.has(u.id) && !seen.has(u.id) && seen.add(u.id))
    .slice(0, 3)
    .map((u) => ({ id: u.id, why: clean(u.why, 40) }));
  await setCached('cache_units', key, { units: picked });
  count({ units: 1 }, levelOf(level), c.get('uid'));
  return c.json({ units: picked });
});

// Learning events from the app, folded into daily totals (see stats.ts). Unknown names are ignored.
learn.post('/api/events', async (c) => {
  const body = await c.req.json<{ events?: { name?: string; n?: number }[]; level?: string }>().catch(() => ({}) as { events?: never[]; level?: string });
  const totals: Record<string, number> = {};
  for (const e of (body.events ?? []).slice(0, 20)) {
    const name = String(e?.name ?? '');
    if (!CLIENT_EVENTS.has(name)) continue;
    totals[name] = Math.min(10, (totals[name] ?? 0) + Math.max(1, Math.min(10, Math.floor(Number(e?.n) || 1))));
  }
  if (Object.keys(totals).length) count(totals, levelOf(body.level), c.get('uid'));
  return c.json({ ok: true });
});

learn.get('/api/usage', async (c) => {
  const round = (usd: number) => Math.round(usd * JPY_PER_USD * 10) / 10;
  const [spent, mine, videos] = await Promise.all([getSpent(), getUserSpent(c.get('uid')), getCounter('video')]);
  const tier = c.get('tier');
  return c.json({
    spentJpy: round(spent), capJpy: CAP_JPY, videoLeft: Math.max(0, VIDEO_LIMIT - videos),
    tier, mySpentJpy: round(mine), myCapJpy: USER_CAP_JPY[tier], attested: c.get('attested'),
  });
});
