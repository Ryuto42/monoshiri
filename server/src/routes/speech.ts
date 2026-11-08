import { Hono } from 'hono';
import { ai, track } from '../ai.ts';
import { LEVELS, MODELS, type Level } from '../config.ts';
import { atLevel, clean, levelOf, type Env, type ExploreDoc } from '../http.ts';
import { keyOf, saveMedia } from '../media.ts';
import { track as count } from '../stats.ts';
import { ensureBudget, getCached, setCached } from '../store.ts';
import { pcmOf, wav } from '../wav.ts';

export const speech = new Hono<Env>();

export const stripMarks = (s: string) => s.replace(/《[^《》\n]{0,20}》/g, '');
// Compares only letters and digits, so markdown, punctuation, spacing and furigana don't matter.
export const letters = (s: string) => stripMarks(s.normalize('NFKC')).replace(/[^\p{L}\p{N}]/gu, '');
// Headings and labels on screen ("まめちしき" etc.) aren't in the stored text; very short strings cost next to nothing.
const SHORT = 16;
// Screen labels can sit in the same block as stored text (e.g. "知ってた？" before the fun fact), so a few extra letters
// at either end are tolerated.
const SLACK = 8;
const within = (body: string, want: string) => {
  for (let k = 0; k <= SLACK && want.length - k >= 10; k++) {
    if (body.includes(want.slice(k)) || body.includes(want.slice(0, want.length - k))) return true;
  }
  return false;
};

async function corpus(name: string, topic: string | undefined, level: Level): Promise<string> {
  const ex = await getCached<ExploreDoc & { reading?: string; keywords?: string[] }>('cache_explore', atLevel(keyOf('explore', name), level));
  const parts: string[] = [];
  if (ex) {
    parts.push(ex.name ?? '', ex.reading ?? '', ex.oneLiner ?? '', ex.summary ?? '', ex.funFact ?? '', ...(ex.keywords ?? []));
    for (const t of ex.topics ?? []) parts.push(t.title, t.teaser ?? '');
  }
  if (topic) {
    const d = await getCached<{ text: string }>('cache_deep', atLevel(keyOf('deep', name, topic), level));
    if (d) parts.push(d.text);
  }
  return letters(parts.join('\n'));
}

// The text must come from this thing's stored explanation (at the given stage first, then any stage: cards keep the
// stage they were saved at), so the endpoint can't be used to voice arbitrary text.
export async function allowedText(text: string, ref: { name?: unknown; topic?: unknown; level?: unknown } | undefined) {
  const want = letters(text);
  if (want.length <= SHORT) return true;
  if (!ref?.name) return false;
  const name = clean(ref.name, 30), topic = ref.topic ? clean(ref.topic, 80) : undefined;
  const first = levelOf(ref.level);
  for (const level of [first, ...LEVELS.filter((l) => l !== first)]) {
    if (within(await corpus(name, topic, level), want)) return true;
  }
  return false;
}

speech.post('/api/tts', async (c) => {
  const { text, ref } = await c.req.json<{ text: string; ref?: { name: string; topic?: string; level?: string } }>();
  const t = stripMarks(String(text ?? '')).replace(/```[\s\S]*?```/g, '').replace(/[#*>`_\-]/g, '').trim().slice(0, 900);
  if (!t) return c.json({ error: 'empty' }, 400);
  // v2: earlier audio was generated with a style prompt that the model sometimes read aloud.
  const key = keyOf('tts2', t);
  const hit = await getCached<{ url: string }>('cache_tts', key);
  if (hit) return c.json({ url: hit.url, cached: true });
  if (!(await allowedText(t, ref))) return c.json({ error: 'unknown_text' }, 400);
  await ensureBudget(0.01);
  const res = await ai.models.generateContent({
    model: MODELS.tts,
    contents: [{ role: 'user', parts: [{ text: t }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } } },
  });
  await track(MODELS.tts, res.usageMetadata, 'tts');
  const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!data?.data) throw new Error('no_audio');
  // The model may send raw PCM (rate in the MIME type) or a whole WAV file; only the samples go into ours.
  const { pcm, rate } = pcmOf(Buffer.from(data.data, 'base64'), Number(/rate=(\d+)/.exec(data.mimeType ?? '')?.[1] ?? 24000));
  const url = await saveMedia(`tts/${key}.wav`, wav(pcm, rate), 'audio/wav');
  await setCached('cache_tts', key, { url });
  count({ tts: 1 }, levelOf(ref?.level), c.get('uid'));
  return c.json({ url });
});
