import { Hono } from 'hono';
import { accessToken } from '../ai.ts';
import { MODELS, PROJECT, VIDEO_LIMIT } from '../config.ts';
import { clean, explored, levelOf, unknown, type Env } from '../http.ts';
import { keyOf, saveMedia } from '../media.ts';
import { addSpent, ensureBudget, getCached, reserveCounter, setCached } from '../store.ts';

export const video = new Hono<Env>();

const VIDEO_SECONDS = 6;
const VIDEO_EST_USD = 0.07 * VIDEO_SECONDS * 1.2;
const IX_BASE = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/interactions`;

video.post('/api/video', async (c) => {
  const { name, en, topic, outline, level } = await c.req.json<{ name: string; en: string; topic: string; outline: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80);
  const key = keyOf('video', n, t);
  const hit = await getCached<{ url: string }>('cache_video', key);
  if (hit) return c.json({ status: 'completed', url: hit.url, cached: true });
  if (!(await explored(n, t, levelOf(level)))) return c.json(unknown, 400);
  await ensureBudget(VIDEO_EST_USD);
  if (!(await reserveCounter('video', VIDEO_LIMIT))) return c.json({ error: 'video_limit' }, 429);
  await addSpent(VIDEO_EST_USD, 'video');
  const prompt = `A short, friendly educational animation for children explaining "${t}" about ${clean(en, 40) || n} (${n}).
${String(outline ?? '').replace(/《[^《》\n]{0,20}》/g, '').slice(0, 500)}
Picture-book 3D clay style, bright soft lighting, smooth camera move, clear visual storytelling, no on-screen text. Gentle cheerful music.`;
  const res = await fetch(IX_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.video,
      background: true,
      input: [{ type: 'text', text: prompt }],
      response_format: [{ type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: `${VIDEO_SECONDS}s` }],
      generation_config: { video_config: { task: 'text_to_video' } },
    }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.id) {
    console.error('video start failed', JSON.stringify(data).slice(0, 500));
    return c.json({ error: 'video_failed' }, 502);
  }
  await setCached('video_jobs', data.id.replace(/\//g, '_'), { key, startedAt: Date.now() });
  return c.json({ status: 'in_progress', id: data.id });
});

video.get('/api/video/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[\w-]+$/.test(id)) return c.json({ error: 'bad_id' }, 400);
  const job = await getCached<{ key: string; url?: string }>('video_jobs', id);
  if (!job) return c.json({ error: 'not_found' }, 404);
  if (job.url) return c.json({ status: 'completed', url: job.url });
  const res = await fetch(`${IX_BASE}/${id}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const data: any = await res.json();
  if (data.status !== 'completed') return c.json({ status: data.status ?? 'in_progress' });
  const b64 = findVideoData(data);
  if (!b64) {
    console.error('video payload missing', JSON.stringify(data).slice(0, 400));
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
