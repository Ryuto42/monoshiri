import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { execSync } from 'node:child_process';
import { GROUNDING_USD_PER_QUERY, LOCAL, PROJECT, PRICES, SAFETY, type Level } from './config.ts';
import { addSpent } from './store.ts';

function makeClient() {
  const base = { vertexai: true, project: PROJECT, location: 'global' } as const;
  if (!LOCAL) return new GoogleGenAI(base);
  // A developer's shell may export Gemini API keys; Vertex AI here must use the gcloud login instead.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  // Local dev borrows the developer's gcloud login instead of a key file.
  const authClient = new OAuth2Client();
  const refresh = () =>
    authClient.setCredentials({ access_token: execSync('gcloud auth print-access-token').toString().trim() });
  refresh();
  setInterval(refresh, 30 * 60 * 1000).unref();
  return new GoogleGenAI({ ...base, googleAuthOptions: { authClient: authClient as any } });
}

// Created on first use, so importing the app (tests, scripts) needs no Google credentials.
let clientInstance: GoogleGenAI | null = null;
const client = () => (clientInstance ??= makeClient());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busy = (e: any) => e?.status === 429 || e?.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/.test(String(e?.message));

// New projects get small per-minute quotas, so retry briefly on 429/503 before surfacing an error.
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1 || !busy(e)) throw e;
      await sleep(1500 * 2 ** i + Math.random() * 500);
    }
  }
}

export const ai = {
  models: {
    generateContent: (p: Parameters<GoogleGenAI['models']['generateContent']>[0]) => retry(() => client().models.generateContent(p)),
    generateContentStream: (p: Parameters<GoogleGenAI['models']['generateContentStream']>[0]) => retry(() => client().models.generateContentStream(p)),
  },
};

const gauth = LOCAL ? null : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

export async function accessToken(): Promise<string> {
  if (!gauth) return execSync('gcloud auth print-access-token').toString().trim();
  return (await gauth.getAccessToken()) ?? '';
}

type Usage = GenerateContentResponse['usageMetadata'];

export function costOf(model: string, usage: Usage, images = 0) {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  const inTok = usage.promptTokenCount ?? 0;
  const outTok = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return ((inTok * p.in + (p.perImage ? 0 : outTok * p.out)) / 1e6 + images * (p.perImage ?? 0)) * SAFETY;
}

// searchQueries: how many Google Search queries a grounded call ran (billed per query on top of tokens).
export async function track(model: string, usage: Usage, kind: string, images = 0, searchQueries = 0) {
  await addSpent(costOf(model, usage, images) + searchQueries * GROUNDING_USD_PER_QUERY * SAFETY, kind);
}

export function grounding(res: GenerateContentResponse | undefined) {
  const gm = res?.candidates?.[0]?.groundingMetadata;
  if (!gm) return { sources: [], queries: [], entryPoint: null as string | null };
  const seen = new Set<string>();
  const sources = (gm.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title: string } => !!w?.uri)
    .filter((w) => (seen.has(w.title ?? w.uri) ? false : (seen.add(w.title ?? w.uri), true)))
    .map((w) => ({ title: w.title ?? w.uri, uri: w.uri }));
  return { sources, queries: gm.webSearchQueries ?? [], entryPoint: gm.searchEntryPoint?.renderedContent ?? null };
}

export const CATEGORIES = ['くらし', 'たべもの', 'しぜん', 'いきもの', 'のりもの', 'どうぐ', 'きかい', 'たてもの', 'そざい', 'からだ', 'あそび', 'そのほか'] as const;

export const TOPIC_KINDS = ['つくりかた', 'れきし', 'しくみ', 'かんきょう', 'くらしとぶんか', 'みらい', 'まめちしき', 'からだとけんこう'] as const;

export const ICONS = [
  'recycling', 'factory', 'history_edu', 'science', 'eco', 'public', 'lightbulb', 'restaurant', 'water_drop',
  'local_shipping', 'construction', 'psychology', 'biotech', 'bolt', 'savings', 'pets', 'forest', 'rocket_launch',
  'school', 'travel_explore', 'health_and_safety', 'palette', 'music_note', 'sports_soccer', 'directions_car',
  'computer', 'home', 'thermostat', 'auto_awesome', 'diamond', 'star', 'museum', 'flag', 'emoji_objects',
] as const;

export const DETECT_PROMPT = `あなたは写真の中のモノを見つける名人です。
写真に写っている「学びのきっかけになる具体的なモノ」を、目立つ順に最大6個見つけてください。
- label: 子どもにも分かる日本語の一般名（例: ペットボトル, マグカップ, イチョウの葉）。商品名・人名は使わない。
- en: 英語の一般名
- box_2d: [ymin, xmin, ymax, xmax] を 0〜1000 に正規化した整数
- alts: 見まちがえやすい別の候補の一般名（日本語、最大2個。自信があれば空の配列）
- 人物そのものは対象にしない（服やメガネなど身につけているモノは可）
- 何も見つからなければ空の配列`;

// How each learning stage is written. 'std' keeps the original wording so existing shared caches stay valid.
const AUDIENCE: Record<Exclude<Level, 'std'>, { who: string; style: string; summary: string; deep: string }> = {
  lower: {
    who: '小学校1〜3年生',
    style: `- 漢字は小学2年生までに習うもの（例: 木・水・山・川・花・犬・空・家・時間・天気）だけを使い、それ以外はひらがなにする
- 1文を短く（30字くらいまで）。むずかしい言葉は使わず、身近なものにたとえる
- 数字は大きすぎない、イメージしやすいものにする（例: 「プール1ぱいぶん」）
- 漢字を使うときは、毎回その直後に《》で読みがなを付ける（例: 水《みず》、時間《じかん》、天気《てんき》）。ひらがな・カタカナ・数字には付けない
- name・reading・en・keywords・問いの title と、mermaid の図の中には《》を付けない`,
    summary: '80字前後のやさしいせつめい',
    deep: '全体で 400 字前後。見出しは 3 個まで。mermaid の図は入れない',
  },
  upper: {
    who: '小学校4〜6年生',
    style: `- 漢字は小学校で習うものまで。中学校以上で習う漢字はひらがなにするか、直後に《》で読みがなを付ける（例: 循環《じゅんかん》）。むずかしい言葉には（かっこ）で言いかえを添える
- name・reading・en・keywords・問いの title と、mermaid の図の中には《》を付けない
- 理科や社会の授業とつながる言葉（例: 原料、気体、しくみ）は使ってよい。1文は40字くらいまで`,
    summary: '120字前後のやさしい説明',
    deep: '全体で 600 字前後。むずかしい言葉には（かっこ）で言いかえを添える',
  },
  junior: {
    who: '中学生',
    style: `- 中学校の理科・社会・技術家庭で習う用語（例: 化学変化、分子、圧力、産業革命）を使い、しくみや理由まで説明する
- 常用漢字はそのまま使ってよい。専門用語は初めて出たときに短く説明する`,
    summary: '150字前後の説明（しくみや理由を含める）',
    deep: '全体で 900 字前後。原因と結果、しくみを順を追って説明する',
  },
  senior: {
    who: '高校生以上',
    style: `- 学術的に正確な用語を使い、原理まで踏み込む（化学式・物理法則・生物のしくみ・経済の構造など、該当するものを具体的に）
- 定量的な数字や、学説・研究の出典が分かる事実を入れる。単純化しすぎず、例外や限界にも触れる`,
    summary: '180字前後の説明（原理を含める）',
    deep: '全体で 1200 字前後。原理・メカニズムを中心に、関連する法則や式があれば示す',
  },
};

// Stages whose text carries 《》 reading marks (furigana); their caches use a new key so older plain text isn't mixed in.
export const RUBY_LEVELS: ReadonlySet<Level> = new Set(['lower', 'upper']);

export function unitsPrompt(name: string, en: string, summary: string, list: string) {
  return `「${name}」（${en}）について、日本の小学校・中学校・高校の授業で、このモノが教材や例として出てくる単元を選んでください。
モノの説明: ${summary.slice(0, 300)}

単元の一覧（id|学年|教科|単元|例のモノ）:
${list}

- 一覧の id からだけ選ぶ。関係が強い順に最大3つ。こじつけになるなら選ばない（0個でもよい）
- why: その単元でこのモノがどう出てくるかを、小学生にも分かる言葉で25字以内（例: 「水にとける量を調べる実験で使う」）`;
}

export function explorePrompt(label: string, level: Level = 'std') {
  if (level !== 'std') {
    const a = AUDIENCE[level];
    return stdExplorePrompt(label)
      .replace('小学校高学年〜中学生が「へぇ！」と思える学びのカードを作ります。', `${a.who}が「へぇ！」と思える学びのカードを作ります。\n読む人は${a.who}です。次を守ってください。\n${a.style}`)
      .replace('120字前後のやさしい説明', a.summary);
  }
  return stdExplorePrompt(label);
}

function stdExplorePrompt(label: string) {
  return `「${label}」について、小学校高学年〜中学生が「へぇ！」と思える学びのカードを作ります。
必ず Google 検索で事実を確認してから、正確な内容だけを書いてください。

- name: モノの一般名（日本語）
- reading: ひらがなの読み
- en: 英語名
- category: 次から1つ ${CATEGORIES.join(' / ')}
- icon: 次から1つ ${ICONS.join(', ')}
- oneLiner: 30字以内のキャッチコピー
- summary: 120字前後のやさしい説明
- funFact: 意外な豆知識 1つ（60字以内、数字や年号を入れる）
- topics: 6個。それぞれ
  - title: 好奇心をくすぐる「問い」の形（例: ペットボトルはどうやってできる？）
  - teaser: 40字以内の答えのチラ見せ
  - kind: 次から1つ ${TOPIC_KINDS.join(' / ')}
  - icon: 上と同じリストから1つ
  6個の kind はできるだけバラバラにする（つくりかた・れきし・しくみ・かんきょう を優先）
- keywords: 関連キーワード 4個
- ok: 「${label}」が、子ども向けに説明してよい具体的なモノ・生き物・食べ物・自然などの一般名なら true。
  人名や個人を特定する情報、暴力的・性的な内容、危険な物の作り方につながる名前、意味のない文字列なら false
  （false のときは、ほかの項目は空でよい）`;
}

export function deepPrompt(name: string, topic: string, level: Level = 'std') {
  if (level !== 'std') {
    const a = AUDIENCE[level];
    return stdDeepPrompt(name, topic)
      .replace('小学校高学年〜中学生向けに、', `${a.who}向けに、`)
      .replace('書式（Markdown）:', `読む人は${a.who}です。次を守ってください。\n${a.style}\n書式（Markdown）:`)
      .replace('- 全体で 700 字前後。むずかしい言葉には（かっこ）で言いかえを添える', `- ${a.deep}`);
  }
  return stdDeepPrompt(name, topic);
}

function stdDeepPrompt(name: string, topic: string) {
  return `テーマ: 「${name}」— ${topic}

小学校高学年〜中学生向けに、このテーマを深掘りして説明してください。必ず Google 検索で事実を確認すること。
書式（Markdown）:
- 最初に 2〜3 文で結論をズバッと言う
- 続けて「### 見出し」を 3〜4 個。各見出しの下は短い段落か箇条書き
- 数字・年号・具体例をできるだけ入れる
- 工程・流れ・因果関係があるなら、1つだけ mermaid の図を入れる:
  \`\`\`mermaid
  flowchart LR
    A["ノードの文字"] --> B["..."]
  \`\`\`
  ノードは 6 個以内、文字は必ずダブルクォートで囲み、15字以内
- 最後に「### やってみよう」として、家や学校でできる観察・実験・調べ学習を 1〜2 個
- 全体で 700 字前後。むずかしい言葉には（かっこ）で言いかえを添える
- 前置きや「いかがでしたか」などの締めは書かない`;
}

export function quizPrompt(name: string, context: string, level: Level = 'std') {
  const who = level === 'std' ? '' : `\n解く人は${AUDIENCE[level].who}です。その学年に合った言葉と漢字で書いてください。\n${AUDIENCE[level].style}`;
  return `「${name}」について、次の内容から 3 問の 3 択クイズを作ってください。${who}
内容:
${context.slice(0, 3000)}
- q: 問題文（40字以内）
- choices: 3 つ
- answer: 正解の index (0-2)
- explain: 30字以内の解説`;
}

export function illustrationPrompt(name: string, en: string) {
  return `A charming picture-book illustration of a single ${en} (${name}), centered with generous margin, slightly tilted 3/4 view.
Soft gouache textures, rounded friendly shapes, gentle shading, subtle paper grain, accurate recognizable details.
Full-bleed warm off-white background with one soft pastel blob behind the object.
No border, no frame, no card layout, no text, no letters, no logos, no watermark.`;
}

export function diagramPrompt(name: string, en: string, topic: string, outline: string) {
  return `An educational explainer illustration for children about: "${topic}" (${en} / ${name}).
Show the idea visually as a clear left-to-right sequence of 3-5 stages with simple arrows, like a picture-book infographic.
Key points to visualize: ${outline.slice(0, 600)}
Soft gouache picture-book style, warm off-white background, cute but accurate. Avoid any written words or numbers; use icons and arrows only.`;
}
