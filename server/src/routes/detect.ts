import { Hono } from 'hono';
import { ai, DETECT_PROMPT, track } from '../ai.ts';
import { MODELS } from '../config.ts';
import { clean, json, levelOf, S, str, type Env } from '../http.ts';
import { track as count } from '../stats.ts';
import { ensureBudget } from '../store.ts';
import { safeSearch } from '../vision.ts';

export const detect = new Hono<Env>();

detect.post('/api/detect', async (c) => {
  const { image, level } = await c.req.json<{ image: string; level?: string }>();
  if (!image || image.length > 3_000_000) return c.json({ error: 'bad_image' }, 400);
  // Detection is exempt from App Check: the native apps can't attest, and without it a guest there couldn't look anything up.
  // The per-account and app-wide caps and the rate limit still apply.
  await ensureBudget(0.005, { attest: false });
  // SafeSearch first: an unsuitable photo is never sent on to Gemini. The photo itself is not stored anywhere.
  const [ok] = await safeSearch([{ base64: image }], 'detect');
  if (!ok) return c.json({ error: 'unsafe_image' }, 422);
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
          properties: { label: str(), en: str(), box_2d: { type: S.ARRAY, items: { type: S.INTEGER } }, alts: { type: S.ARRAY, items: str() } },
          required: ['label', 'en', 'box_2d'],
        },
      },
    },
  });
  await track(MODELS.detect, res.usageMetadata, 'detect');
  count({ detect: 1 }, levelOf(level), c.get('uid'));
  const objects = (json<any[]>(res.text) ?? [])
    .filter((o) => Array.isArray(o.box_2d) && o.box_2d.length === 4)
    .slice(0, 6)
    .map((o) => {
      const label = clean(o.label, 30);
      const alts = [...new Set((Array.isArray(o.alts) ? o.alts : []).map((a: unknown) => clean(a, 30)))].filter((a) => a && a !== label).slice(0, 2);
      return { label, en: clean(o.en, 40), box: o.box_2d.map((n: number) => Math.max(0, Math.min(1000, n))), alts };
    });
  return c.json({ objects });
});
