import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ai, deepPrompt, grounding, quizPrompt, track } from '../ai.ts';
import { LOCAL, MODELS } from '../config.ts';
import { atLevel, clean, explored, json, levelOf, S, str, unknown, type Env } from '../http.ts';
import { keyOf } from '../media.ts';
import { track as count } from '../stats.ts';
import { ensureBudget, getCached, setCached } from '../store.ts';

export const deep = new Hono<Env>();

deep.post('/api/deep', async (c) => {
  const { name, topic, level: lv } = await c.req.json<{ name: string; topic: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80), level = levelOf(lv);
  const key = atLevel(keyOf('deep', n, t), level);
  const hit = await getCached<{ text: string; meta: object }>('cache_deep', key);
  if (!hit) {
    if (!(await explored(n, t, level))) return c.json(unknown, 400);
    await ensureBudget(0.01);
  }
  count({ topic_open: 1 }, level, c.get('uid'));
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
        contents: deepPrompt(n, t, level),
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
      console.error(e);
      await stream.writeSSE({ event: 'error', data: JSON.stringify(LOCAL ? String(e?.message ?? e).slice(0, 200) : 'generation_failed') });
      return;
    }
    const meta = grounding(last);
    await track(MODELS.deep, last?.usageMetadata, 'deep', 0, meta.queries.length);
    await stream.writeSSE({ event: 'done', data: JSON.stringify(meta) });
    if (text.length > 100) await setCached('cache_deep', key, { text, meta });
  });
});

deep.post('/api/quiz', async (c) => {
  const { name, context, level: lv } = await c.req.json<{ name: string; context: string; level?: string }>();
  const n = clean(name, 30), level = levelOf(lv);
  const key = atLevel(keyOf('quiz', n, String(context ?? '').slice(0, 200)), level);
  const hit = await getCached<any>('cache_quiz', key);
  if (hit) {
    count({ quiz: 1 }, level, c.get('uid'));
    return c.json(hit);
  }
  if (!(await explored(n, undefined, level))) return c.json(unknown, 400);
  await ensureBudget(0.003);
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: quizPrompt(n, String(context ?? ''), level),
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
  count({ quiz: 1 }, level, c.get('uid'));
  return c.json(out);
});
