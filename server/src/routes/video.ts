import { Hono } from 'hono';
import { accessToken } from '../ai.ts';
import { MODELS, PROJECT, VIDEO_LIMIT } from '../config.ts';
import { clean, exploreDoc, exploredTopic, levelOf, outlineOf, unknown, type Env } from '../http.ts';
import { keyOf, saveMedia } from '../media.ts';
import { addSpent, ensureBudget, getCached, releaseCounter, reserveCounter, setCached } from '../store.ts';
import { report } from '../report.ts';

export const video = new Hono<Env>();

const VIDEO_SECONDS = 6;
const VIDEO_EST_USD = 0.07 * VIDEO_SECONDS * 1.2;
const IX_BASE = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/interactions`;

type IxResult = { ok: boolean; data: any };
// The Interactions API calls, swappable in tests.
export const interactions = {
  start: async (body: object): Promise<IxResult> => {
    const res = await fetch(IX_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  },
  get: async (id: string): Promise<IxResult> => {
    const res = await fetch(`${IX_BASE}/${id}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  },
};

video.post('/api/video', async (c) => {
  const { name, topic, level: lv } = await c.req.json<{ name: string; topic: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80), level = levelOf(lv);
  const key = keyOf('video', n, t);
  const hit = await getCached<{ url: string }>('cache_video', key);
  if (hit) return c.json({ status: 'completed', url: hit.url, cached: true });
  if (!(await exploredTopic(n, t, level))) return c.json(unknown, 400);
  await ensureBudget(VIDEO_EST_USD);
  // The English name and the outline come from what the server stored (the video is shared), not from the client.
  const en = clean((await exploreDoc(n, level))?.en, 40);
  const outline = await outlineOf(n, t, level, 500);
  if (!(await reserveCounter('video', VIDEO_LIMIT))) return c.json({ error: 'video_limit' }, 429);
  const prompt = `A short, friendly educational animation for children explaining "${t}" about ${en || n} (${n}).
${outline}
Picture-book 3D clay style, bright soft lighting, smooth camera move, clear visual storytelling, no on-screen text. Gentle cheerful music.`;
  let started: IxResult;
  try {
    started = await interactions.start({
      model: MODELS.video,
      background: true,
      input: [{ type: 'text', text: prompt }],
      response_format: [{ type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: `${VIDEO_SECONDS}s` }],
      generation_config: { video_config: { task: 'text_to_video' } },
    });
  } catch (e) {
    started = { ok: false, data: { error: String(e) } };
  }
  if (!started.ok || !started.data?.id) {
    // Nothing was made: the slot goes back and nothing is charged.
    report('failed', 'video_failed', { step: 'start', detail: JSON.stringify(started.data).slice(0, 500) });
    await releaseCounter('video');
    return c.json({ error: 'video_failed' }, 502);
  }
  await addSpent(VIDEO_EST_USD, 'video');
  const id = String(started.data.id);
  await setCached('video_jobs', id.replace(/\//g, '_'), { key, startedAt: Date.now() });
  return c.json({ status: 'in_progress', id });
});

video.get('/api/video/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[\w-]+$/.test(id)) return c.json({ error: 'bad_id' }, 400);
  const job = await getCached<{ key: string; url?: string }>('video_jobs', id);
  if (!job) return c.json({ error: 'not_found' }, 404);
  if (job.url) return c.json({ status: 'completed', url: job.url });
  const { ok, data } = await interactions.get(id);
  if (!ok) {
    report('failed', 'video_failed', { step: 'status', detail: JSON.stringify(data).slice(0, 300) });
    return c.json({ status: 'failed' });
  }
  if (data.status !== 'completed') return c.json({ status: data.status ?? 'in_progress' });
  const b64 = findVideoData(data);
  if (!b64) {
    report('failed', 'video_failed', { step: 'payload', detail: JSON.stringify(data).slice(0, 400) });
    return c.json({ status: 'failed' });
  }
  const url = await saveMedia(`video/${job.key}.mp4`, Buffer.from(b64, 'base64'), 'video/mp4');
  await setCached('video_jobs', id, { ...job, url });
  await setCached('cache_video', job.key, { url });
  return c.json({ status: 'completed', url });
});

function findVideoData(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'video' && typeof node.data === 'string') return node.data;
  for (const v of Object.values(node)) {
    const hit = findVideoData(v);
    if (hit) return hit;
  }
  return null;
}
