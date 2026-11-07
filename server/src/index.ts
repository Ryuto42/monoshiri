import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { ALLOWED_ORIGINS, CAP_JPY, JPY_PER_USD, LOCAL, MODELS, PORT, PROJECT, VIDEO_LIMIT } from './config.ts';
import { auth, BudgetError, ensureBudget, getCached, getCounter, getSpent, incrCounter, setCached, addSpent } from './store.ts';
import {
  ai, accessToken, track, grounding, DETECT_PROMPT, explorePrompt, deepPrompt, quizPrompt, illustrationPrompt, diagramPrompt,
  CATEGORIES, TOPIC_KINDS, ICONS,
} from './ai.ts';
import { commonsImages, keyOf, readMedia, saveMedia, toWebp, wikiSummary, youtubeVideos } from './media.ts';

type Env = { Variables: { uid: string } };
const app = new Hono<Env>();

app.use('*', cors({ origin: ALLOWED_ORIGINS, allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }));
const mediaCache = new Map<string, { data: Buffer; type: string }>();
app.get('/media/*', async (c) => {
  const name = c.req.path.slice('/media/'.length);
  if (!/^(illust|diagram|tts|video)\/[\w-]+\.(webp|wav|mp4)$/.test(name)) return c.notFound();
  let m = mediaCache.get(name);
  if (!m) {
    const got = await readMedia(name);
    if (!got) return c.notFound();
    m = got;
    if (m.data.length < 2_000_000) mediaCache.set(name, m);
    if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value!);
  }
  const range = c.req.header('Range');
  const headers: Record<string, string> = { 'Content-Type': m.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' };
  const r = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (r) {
    const start = Number(r[1] || 0), end = Math.min(m.data.length - 1, Number(r[2] || m.data.length - 1));
    return c.body(new Uint8Array(m.data.subarray(start, end + 1)), 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${m.data.length}` });
  }
  return c.body(new Uint8Array(m.data), 200, headers);
});

app.get('/api/health', (c) => c.json({ ok: true }));

const tokenCache = new Map<string, { uid: string; exp: number }>();
const hits = new Map<string, number[]>();

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next();
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  if (!token) return c.json({ error: 'unauthenticated' }, 401);
  let entry = tokenCache.get(token);
  if (!entry || entry.exp < Date.now()) {
    try {
      const d = await auth.verifyIdToken(token);
      entry = { uid: d.uid, exp: d.exp * 1000 };
      tokenCache.set(token, entry);
    } catch {
      return c.json({ error: 'unauthenticated' }, 401);
    }
  }
  c.set('uid', entry.uid);
  if (c.req.method === 'POST') {
    const now = Date.now();
    const list = (hits.get(entry.uid) ?? []).filter((t) => now - t < 5 * 60_000);
    if (list.length >= 60) return c.json({ error: 'rate_limited' }, 429);
    list.push(now);
    hits.set(entry.uid, list);
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof BudgetError) return c.json({ error: 'budget' }, 402);
  if ((err as any)?.status === 429) return c.json({ error: 'busy' }, 503);
  console.error(err);
  return c.json({ error: 'internal', message: String(err?.message ?? err).slice(0, 200) }, 500);
});

const S = { STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY', OBJECT: 'OBJECT' } as const;
const str = (extra: object = {}) => ({ type: S.STRING, ...extra });
const json = <T>(text: string | undefined): T => JSON.parse(text ?? 'null');
const clean = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

app.get('/api/usage', async (c) => {
  const spentJpy = (await getSpent()) * JPY_PER_USD;
  const videos = await getCounter('video');
  return c.json({ spentJpy: Math.round(spentJpy * 10) / 10, capJpy: CAP_JPY, videoLeft: Math.max(0, VIDEO_LIMIT - videos) });
});

app.post('/api/detect', async (c) => {
  const { image } = await c.req.json<{ image: string }>();
  if (!image || image.length > 3_000_000) return c.json({ error: 'bad_image' }, 400);
  await ensureBudget(0.003);
  const res = await ai.models.generateContent({
    model: MODELS.detect,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text: DETECT_PROMPT }] }],
    config: {
      thinkingConfig: { thinkingLevel: 'MINIMAL' as any },
      responseMimeType: 'application/json',
      responseSchema: {
        type: S.ARRAY,
        items: {
          type: S.OBJECT,
          properties: { label: str(), en: str(), box_2d: { type: S.ARRAY, items: { type: S.INTEGER } } },
          required: ['label', 'en', 'box_2d'],
        },
      },
    },
  });
  await track(MODELS.detect, res.usageMetadata, 'detect');
  const objects = (json<any[]>(res.text) ?? [])
    .filter((o) => Array.isArray(o.box_2d) && o.box_2d.length === 4)
    .slice(0, 6)
    .map((o) => ({ label: clean(o.label, 30), en: clean(o.en, 40), box: o.box_2d.map((n: number) => Math.max(0, Math.min(1000, n))) }));
  return c.json({ objects });
});

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
  },
  required: ['name', 'reading', 'en', 'category', 'icon', 'oneLiner', 'summary', 'funFact', 'topics', 'keywords'],
};

app.post('/api/explore', async (c) => {
  const body = await c.req.json<{ label: string; image?: string }>();
  const label = clean(body.label, 30);
  if (!label) return c.json({ error: 'bad_label' }, 400);
  // Results are shared by everyone: the same thing photographed under another label resolves through explore_alias.
  const alias = await getCached<{ target: string }>('explore_alias', keyOf('alias', label));
  const hit = await getCached<any>('cache_explore', alias?.target ?? keyOf('explore', label));
  if (hit) return c.json({ ...hit, cached: true });
  await ensureBudget(0.01);
  const parts: any[] = [{ text: explorePrompt(label) }];
  if (body.image && body.image.length < 1_500_000) parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: body.image } });
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
  await track(MODELS.explore, res.usageMetadata, 'explore');
  const data = json<any>(res.text);
  const g = grounding(res);
  const wiki = await wikiSummary(data.name).catch(() => null);
  const key = keyOf('explore', clean(data.name, 30) || label);
  const out = {
    id: key, label, ...data, topics: (data.topics ?? []).slice(0, 6).map((t: any, i: number) => ({ id: `t${i}`, ...t })),
    entryPoint: g.entryPoint, queries: g.queries, wiki,
  };
  await setCached('cache_explore', key, out);
  const names = new Set([label, clean(data.name, 30), clean(data.en, 40)].filter(Boolean));
  await Promise.all([...names].map((n) => setCached('explore_alias', keyOf('alias', n), { target: key, name: n })));
  return c.json(out);
});

app.post('/api/deep', async (c) => {
  const { name, topic } = await c.req.json<{ name: string; topic: string }>();
  const n = clean(name, 30), t = clean(topic, 80);
  const key = keyOf('deep', n, t);
  const hit = await getCached<{ text: string; meta: object }>('cache_deep', key);
  if (!hit) await ensureBudget(0.01);
  return streamSSE(c, async (stream) => {
    if (hit) {
      for (const chunk of hit.text.match(/[\s\S]{1,40}/g) ?? []) {
        await stream.writeSSE({ event: 'delta', data: JSON.stringify(chunk) });
        await stream.sleep(8);
      }
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ ...hit.meta, cached: true }) });
      return;
    }
    let text = '';
    let last: any;
    try {
      const it = await ai.models.generateContentStream({
        model: MODELS.deep,
        contents: deepPrompt(n, t),
        config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: 'LOW' as any } },
      });
      for await (const chunk of it) {
        last = chunk;
        const d = chunk.text ?? '';
        if (d) {
          text += d;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify(d) });
        }
      }
    } catch (e: any) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify(String(e?.message ?? e).slice(0, 200)) });
      return;
    }
    await track(MODELS.deep, last?.usageMetadata, 'deep');
    const meta = grounding(last);
    await stream.writeSSE({ event: 'done', data: JSON.stringify(meta) });
    if (text.length > 100) await setCached('cache_deep', key, { text, meta });
  });
});

app.post('/api/quiz', async (c) => {
  const { name, context } = await c.req.json<{ name: string; context: string }>();
  const n = clean(name, 30);
  const key = keyOf('quiz', n, String(context ?? '').slice(0, 200));
  const hit = await getCached<any>('cache_quiz', key);
  if (hit) return c.json(hit);
  await ensureBudget(0.003);
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: quizPrompt(n, String(context ?? '')),
    config: {
      thinkingConfig: { thinkingLevel: 'MINIMAL' as any },
      responseMimeType: 'application/json',
      responseSchema: {
        type: S.OBJECT,
        properties: {
          questions: {
            type: S.ARRAY,
            items: {
              type: S.OBJECT,
              properties: { q: str(), choices: { type: S.ARRAY, items: str() }, answer: { type: S.INTEGER }, explain: str() },
              required: ['q', 'choices', 'answer', 'explain'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });
  await track(MODELS.quiz, res.usageMetadata, 'quiz');
  const out = json<any>(res.text);
  await setCached('cache_quiz', key, out);
  return c.json(out);
});

app.get('/api/media', async (c) => {
  const name = clean(c.req.query('name'), 30), en = clean(c.req.query('en'), 40), topic = clean(c.req.query('topic'), 80);
  const [images, videos] = await Promise.all([
    commonsImages(en || name).catch(() => []),
    youtubeVideos(`${name} ${topic.replace(/[？?！!]/g, ' ')}`.trim()).catch(() => []),
  ]);
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

app.post('/api/illustrate', async (c) => {
  const { name, en } = await c.req.json<{ name: string; en: string }>();
  const n = clean(name, 30), e = clean(en, 40);
  const key = keyOf('illust', n);
  const hit = await getCached<{ url: string }>('cache_illust', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  const png = await generateImage(illustrationPrompt(n, e || n), '1:1', 'illust');
  const url = await saveMedia(`illust/${key}.webp`, await toWebp(png, 768), 'image/webp');
  await setCached('cache_illust', key, { url });
  return c.json({ url });
});

app.post('/api/diagram', async (c) => {
  const { name, en, topic, outline } = await c.req.json<{ name: string; en: string; topic: string; outline: string }>();
  const n = clean(name, 30), t = clean(topic, 80);
  const key = keyOf('diagram', n, t);
  const hit = await getCached<{ url: string }>('cache_diagram', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  const png = await generateImage(diagramPrompt(n, clean(en, 40) || n, t, String(outline ?? '')), '16:9', 'diagram');
  const url = await saveMedia(`diagram/${key}.webp`, await toWebp(png, 1280), 'image/webp');
  await setCached('cache_diagram', key, { url });
  return c.json({ url });
});

function wav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

app.post('/api/tts', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const t = String(text ?? '').replace(/```[\s\S]*?```/g, '').replace(/[#*>`_\-]/g, '').trim().slice(0, 900);
  if (!t) return c.json({ error: 'empty' }, 400);
  const key = keyOf('tts', t);
  const hit = await getCached<{ url: string }>('cache_tts', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  await ensureBudget(0.01);
  const res = await ai.models.generateContent({
    model: MODELS.tts,
    contents: [{ role: 'user', parts: [{ text: `やさしく、わくわくする調子で、子どもに語りかけるように読んでください:\n${t}` }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } } },
  });
  await track(MODELS.tts, res.usageMetadata, 'tts');
  const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!data?.data) throw new Error('no_audio');
  const rate = Number(/rate=(\d+)/.exec(data.mimeType ?? '')?.[1] ?? 24000);
  const url = await saveMedia(`tts/${key}.wav`, wav(Buffer.from(data.data, 'base64'), rate), 'audio/wav');
  await setCached('cache_tts', key, { url });
  return c.json({ url });
});

const VIDEO_SECONDS = 6;
const VIDEO_EST_USD = 0.07 * VIDEO_SECONDS * 1.2;
const IX_BASE = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/interactions`;

app.post('/api/video', async (c) => {
  const { name, en, topic, outline } = await c.req.json<{ name: string; en: string; topic: string; outline: string }>();
  const n = clean(name, 30), t = clean(topic, 80);
  const key = keyOf('video', n, t);
  const hit = await getCached<{ url: string }>('cache_video', key);
  if (hit) return c.json({ status: 'completed', url: hit.url, cached: true });
  if ((await getCounter('video')) >= VIDEO_LIMIT) return c.json({ error: 'video_limit' }, 429);
  await ensureBudget(VIDEO_EST_USD);
  await incrCounter('video');
  await addSpent(VIDEO_EST_USD, 'video');
  const prompt = `A short, friendly educational animation for children explaining "${t}" about ${clean(en, 40) || n} (${n}).
${String(outline ?? '').slice(0, 500)}
Picture-book 3D clay style, bright soft lighting, smooth camera move, clear visual storytelling, no on-screen text. Gentle cheerful music.`;
  const res = await fetch(IX_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.video,
      background: true,
      input: [{ type: 'text', text: prompt }],
      response_format: [{
        type: 'video', aspect_ratio: '16:9', resolution: '720p',
        duration: `${VIDEO_SECONDS}s`,
      }],
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

app.get('/api/video/:id', async (c) => {
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

serve({ fetch: app.fetch, port: PORT }, () => console.log(`monoshiri api on :${PORT} (local=${LOCAL})`));

