import { Hono } from 'hono';
import { ai, diagramPrompt, illustrationPrompt, track } from '../ai.ts';
import { MODELS } from '../config.ts';
import { clean, explored, exploredAtAnyLevel, levelOf, unknown, type Env } from '../http.ts';
import { keyOf, saveMedia, toWebp, youtubeVideos } from '../media.ts';
import { topicPhotos } from '../photos.ts';
import { track as count } from '../stats.ts';
import { BudgetError, ensureBudget, getCached, setCached, UserLimitError, AttestError } from '../store.ts';

export const media = new Hono<Env>();

media.get('/api/media', async (c) => {
  const name = clean(c.req.query('name'), 30), en = clean(c.req.query('en'), 40), topic = clean(c.req.query('topic'), 80);
  const level = levelOf(c.req.query('level'));
  // YouTube search has a small daily quota, so results are shared like the AI ones. v2: photos are picked by Gemini.
  const key = keyOf('media2', name, topic);
  const hit = await getCached<{ images: unknown[]; videos: unknown[] }>('cache_media', key);
  if (hit) return c.json({ images: hit.images, videos: hit.videos });
  if (!(await explored(name, topic || undefined, level))) return c.json(unknown, 400);
  const [images, videos] = await Promise.all([
    topicPhotos(name, en || name, topic).catch((e) => {
      if (e instanceof BudgetError || e instanceof UserLimitError || e instanceof AttestError) throw e;
      console.error('photos failed', e);
      return [];
    }),
    youtubeVideos(`${name} ${topic.replace(/[？?！!]/g, ' ')}`.trim()).catch(() => []),
  ]);
  if (images.length || videos.length) await setCached('cache_media', key, { images, videos });
  return c.json({ images, videos });
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
