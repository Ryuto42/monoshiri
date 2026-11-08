import sharp from 'sharp';
import { ai, track } from './ai.ts';
import { MODELS } from './config.ts';
import { commonsImages, type CommonsImage } from './media.ts';
import { ensureBudget } from './store.ts';
import { safeSearch } from './vision.ts';

const UA = 'Monoshiri/1.0 (educational hackathon app; https://monoshiri.web.app)';
const json = <T>(text: string | undefined): T | null => {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    return null;
  }
};

async function thumb(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const small = await sharp(Buffer.from(await r.arrayBuffer())).resize({ width: 384, height: 384, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    return small.toString('base64');
  } catch {
    return null;
  }
}

// Wikimedia Commons is the source (freely licensed, attributable). Search results alone are hit-and-miss, so:
// 1. Gemini turns the topic into a couple of focused English search queries,
// 2. Gemini looks at the thumbnails and keeps the few that clearly show what the topic is about,
// 3. only those few go through Cloud Vision SafeSearch (billed per image, so not every candidate).
export async function topicPhotos(name: string, en: string, topic: string, max = 4): Promise<CommonsImage[]> {
  await ensureBudget(0.01);
  const plan = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: `Wikimedia Commons で、子ども向けの学びアプリに載せる写真を探します。
モノ: ${name}（${en}）
テーマ: ${topic || '（このモノの全体像）'}
Commons で検索する英語のキーワードを 2 つ考えてください。1 つ目はモノそのものがきれいに写った写真、2 つ目はテーマ（作り方・しくみ・歴史など）が分かる写真が見つかるもの。各 2〜5 語、固有の商品名は避ける。
JSON の配列（文字列 2 つ）だけで答える。`,
    config: { thinkingConfig: { thinkingLevel: 'MINIMAL' as any }, responseMimeType: 'application/json' },
  });
  await track(MODELS.quiz, plan.usageMetadata, 'photos');
  const queries = [...new Set([...(json<string[]>(plan.text) ?? []).filter((q) => typeof q === 'string').slice(0, 2), en || name])].slice(0, 3);
  const lists = await Promise.all(queries.map((q) => commonsImages(String(q).slice(0, 60), 8).catch(() => [])));
  const seen = new Set<string>();
  const candidates = lists.flat().filter((c) => (seen.has(c.full) ? false : (seen.add(c.full), true))).slice(0, 16);
  if (!candidates.length) return [];

  const thumbs = await Promise.all(candidates.map((c) => thumb(c.thumb)));
  const safe = candidates.map((c, i) => ({ c, b64: thumbs[i] })).filter((x): x is { c: CommonsImage; b64: string } => !!x.b64);
  if (!safe.length) return [];

  const pick = await ai.models.generateContent({
    model: MODELS.quiz,
    contents: [
      {
        role: 'user',
        parts: [
          ...safe.flatMap((x, i) => [{ text: `#${i}` }, { inlineData: { mimeType: 'image/jpeg', data: x.b64 } }]),
          {
            text: `上の写真（#番号つき）から、子ども向けの学びアプリで「${name}」— ${topic || '全体像'} の説明に添える写真を最大 ${max} 枚選んでください。
選ぶ基準: 主役（${name}）がはっきり大きく写っている／テーマが伝わる／明るく鮮明で構図がよい／同じような写真は 1 枚だけ。
外す写真: 関係ないもの、文字や表ばかりのもの、ロゴ・切手・紙幣、地図（テーマが地理でない限り）、人物の顔が主役のもの、ぼやけた・暗い・小さい写真、子どもに不適切なもの。
よい順に並べた番号の配列（例: [3, 0, 7]）だけを JSON で答える。合う写真がなければ []。`,
          },
        ],
      },
    ],
    config: { thinkingConfig: { thinkingLevel: 'MINIMAL' as any }, responseMimeType: 'application/json' },
  });
  await track(MODELS.quiz, pick.usageMetadata, 'photos');
  const order = [...new Set((json<number[]>(pick.text) ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < safe.length))].slice(0, max);
  const chosen = order.map((n) => safe[n]);
  const verdicts = await safeSearch(chosen.map((x) => ({ base64: x.b64 })));
  return chosen.filter((_, i) => verdicts[i]).map((x) => x.c);
}
