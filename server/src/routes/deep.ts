import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ai, deepPrompt, grounding, quizPrompt, restyleDeepPrompt, track } from '../ai.ts';
import { LEVELS, LOCAL, MODELS, type Level } from '../config.ts';
import { atLevel, clean, deepText, exploreDoc, exploredTopic, levelOf, S, str, stripRuby, unknown, type Env } from '../http.ts';
import { keyOf } from '../media.ts';
import { track as count } from '../stats.ts';
import { ensureBudget, getCached, holdRequest, setCached } from '../store.ts';
import { errorText, report } from '../report.ts';

// A grounded call: tokens plus a few Google Search queries ($14 / 1,000), with the meter's safety margin.
export const GROUNDED_EST_USD = 0.06;

export const deep = new Hono<Env>();

async function otherStage(name: string, topic: string, level: Level) {
  for (const l of LEVELS) {
    if (l === level) continue;
    const d = await getCached<{ text: string; meta: object }>('cache_deep', atLevel(keyOf('deep', name, topic), l));
    if (d?.text) return { ...d, level: l };
  }
  return null;
}

deep.post('/api/deep', async (c) => {
  const { name, topic, level: lv } = await c.req.json<{ name: string; topic: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80), level = levelOf(lv);
  const key = atLevel(keyOf('deep', n, t), level);
  let hit = await getCached<{ text: string; meta: object }>('cache_deep', key);
  if (!hit) {
    // Cards keep the stage they were saved at, so a topic listed at any stage can be read at the current one.
    if (!(await exploredTopic(n, t, level))) return c.json(unknown, 400);
    // Already written for another stage: rewrite it for this one (no new search), cheap enough for every reader.
    const other = await otherStage(n, t, level);
    if (other) {
      await ensureBudget(0.006, { attest: false });
      const res = await ai.models.generateContent({ model: MODELS.quiz, contents: restyleDeepPrompt(level, n, t, other.text), config: { thinkingConfig: { thinkingLevel: 'MINIMAL' as any } } });
      await track(MODELS.quiz, res.usageMetadata, 'restyle');
      const text = (res.text ?? '').trim();
      if (text.length > 100) {
        hit = { text, meta: other.meta };
        await setCached('cache_deep', key, { ...hit, restyledFrom: other.level });
      }
    }
    if (!hit) await ensureBudget(GROUNDED_EST_USD);
  }
  count({ topic_open: 1 }, level, c.get('uid'));
  // The stream keeps generating after this handler returns; the reservation is released when it ends.
  const release = holdRequest();
  return streamSSE(c, async (stream) => {
    try {
      await write(stream);
    } finally {
      release();
    }
  });

  async function write(stream: Parameters<Parameters<typeof streamSSE>[1]>[0]) {
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
      report('failed', 'deep_failed', { name: n, topic: t, detail: errorText(e) });
      await stream.writeSSE({ event: 'error', data: JSON.stringify(LOCAL ? String(e?.message ?? e).slice(0, 200) : 'generation_failed') });
      return;
    }
    const meta = grounding(last);
    await track(MODELS.deep, last?.usageMetadata, 'deep', 0, meta.queries.length);
    await stream.writeSSE({ event: 'done', data: JSON.stringify(meta) });
    if (text.length > 100) await setCached('cache_deep', key, { text, meta });
  }
});

type Quiz = { questions: { q: string; choices: string[]; answer: number; explain: string }[] };

// Quizzes are shared, so what comes back from the model is checked before it is stored or shown.
export function validQuiz(v: any): Quiz | null {
  const qs = v?.questions;
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 5) return null;
  const okStr = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  for (const q of qs) {
    if (!q || typeof q !== 'object') return null;
    if (!okStr(q.q, 200) || !okStr(q.explain, 200)) return null;
    if (!Array.isArray(q.choices) || q.choices.length !== 3 || !q.choices.every((c: unknown) => okStr(c, 80))) return null;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) return null;
  }
  return { questions: qs.map((q: any) => ({ q: q.q, choices: q.choices, answer: q.answer, explain: q.explain })) };
}

// The quiz is written from the stored deep dive of the topic (or the explanation), never from text the client sends.
deep.post('/api/quiz', async (c) => {
  const { name, topic, level: lv } = await c.req.json<{ name: string; topic?: string; level?: string }>();
  const n = clean(name, 30), t = clean(topic, 80), level = levelOf(lv);
  if (!n) return c.json({ error: 'bad_name' }, 400);
  const key = atLevel(keyOf('quiz2', n, t), level);
  const hit = await getCached<Quiz>('cache_quiz', key);
  if (hit) {
    count({ quiz: 1 }, level, c.get('uid'));
    return c.json(hit);
  }
  // A thing (and topic) explored at any stage: cards keep the stage they were saved at.
  if (t ? !(await exploredTopic(n, t, level)) : !(await exploreDoc(n, level))) return c.json(unknown, 400);
  const deepBody = t ? await deepText(n, t, level) : null;
  const ex = deepBody ? null : await exploreDoc(n, level);
  const context = stripRuby(deepBody ?? [ex?.summary, ex?.funFact].filter(Boolean).join('\n')).replace(/```[\s\S]*?(```|$)/g, ' ');
  await ensureBudget(0.003);
  const res = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: quizPrompt(n, t ? `問い: ${t}\n${context}` : context, level),
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
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.text ?? 'null');
  } catch {}
  const out = validQuiz(parsed);
  if (!out) {
    report('failed', 'quiz_failed', { name: n, topic: t, detail: String(res.text ?? '').slice(0, 300) });
    return c.json({ error: 'quiz_failed' }, 502);
  }
  await setCached('cache_quiz', key, out);
  count({ quiz: 1 }, level, c.get('uid'));
  return c.json(out);
});
