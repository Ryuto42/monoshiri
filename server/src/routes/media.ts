import { Hono } from 'hono';
import { ai, diagramPrompt, illustrationPrompt, track } from '../ai.ts';
import { MODELS } from '../config.ts';
import { clean, explored, exploredAtAnyLevel, exploredTopic, levelOf, unknown, type Env } from '../http.ts';
import { keyOf, kindQuery, saveMedia, toWebp, videoQuery, youtubeVideos, type Video } from '../media.ts';
import { topicPhotos } from '../photos.ts';
import { track as count } from '../stats.ts';
import { BudgetError, ensureBudget, getCached, setCached, UserLimitError, AttestError } from '../store.ts';

export const media = new Hono<Env>();

media.get('/api/media', async (c) => {
  const name = clean(c.req.query('name'), 30), en = clean(c.req.query('en'), 40), topic = clean(c.req.query('topic'), 80);
  const level = levelOf(c.req.query('level'));
  const t = await exploredTopic(name, topic, level);
  if (!t) return c.json(unknown, 400);
  const query = videoQuery(name, t.title, t.kind);
  // YouTube search has a small daily quota, so results are shared like the AI ones (per query, see youtubeVideos).
  // A second, broader search only when the question's own search leaves fewer than two videos about the thing.
  const videos = (async (): Promise<Video[]> => {
    const first = await youtubeVideos(query, [name, en]).catch(() => [] as Video[]);
    const broad = kindQuery(name, t.kind);
    if (first.length >= 2 || broad === query) return first;
    const more = await youtubeVideos(broad, [name, en]).catch(() => [] as Video[]);
    return [...first, ...more.filter((v) => !first.some((f) => f.id === v.id))].slice(0, 4);
  })();
  // v2: photos are picked by Gemini.
  const key = keyOf('media2', name, topic);
  const hit = await getCached<{ images: unknown[] }>('cache_media', key);
  if (hit) return c.json({ images: hit.images, videos: await videos, query });
  const images = await topicPhotos(name, en || name, topic).catch((e) => {
    if (e instanceof BudgetError || e instanceof UserLimitError || e instanceof AttestError) throw e;
    console.error('photos failed', e);
    return [];
  });
  if (images.length) await setCached('cache_media', key, { images });
  return c.json({ images, videos: await videos, query });
});

async function generateImage(prompt: string, aspectRatio: string, kind: string) {
  await ensureBudget(0.05);
  const res = await ai.models.generateContent({
    model: MODELS.image,
    contents: prompt,
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize: '1K' } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  await track(MODELS.image, res.usageMetadata, kind, part ? 1 : 0);
  if (!part?.inlineData?.data) throw new Error('no_image');
  return Buffer.from(part.inlineData.data, 'base64');
}

media.post('/api/illustrate', async (c) => {
  const { name, en } = await c.req.json<{ name: string; en: string }>();
  const n = clean(name, 30), e = clean(en, 40);
  const key = keyOf('illust', n);
  const hit = await getCached<{ url: string }>('cache_illust', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  if (!(await exploredAtAnyLevel(n))) return c.json(unknown, 400);
  const png = await generateImage(illustrationPrompt(n, e || n), '1:1', 'illust');
  const url = await saveMedia(`illust/${key}.webp`, await toWebp(png, 768), 'image/webp');
  await setCached('cache_illust', key, { url });
  count({ card_illust: 1 }, 'std', c.get('uid'));
  return c.json({ url });
});

media.post('/api/diagram', async (c) => {
  const { name, en, topic, outline, level } = await c.req.json<{ name: string; en: string; topic: string; outline: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80);
  const key = keyOf('diagram', n, t);
  const hit = await getCached<{ url: string }>('cache_diagram', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  if (!(await explored(n, t, levelOf(level)))) return c.json(unknown, 400);
  const png = await generateImage(diagramPrompt(n, clean(en, 40) || n, t, String(outline ?? '').replace(/《[^《》\n]{0,20}》/g, '')), '16:9', 'diagram');
  const url = await saveMedia(`diagram/${key}.webp`, await toWebp(png, 1280), 'image/webp');
  await setCached('cache_diagram', key, { url });
  return c.json({ url });
});
