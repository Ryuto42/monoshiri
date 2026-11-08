import { test as base, expect, type Page, type Route } from '@playwright/test';

export const API = 'http://127.0.0.1:8787';

export type Call = { path: string; body: Record<string, unknown> };

// A 1x1 transparent PNG, served for every /media/* image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// A short silent WAV, served for /api/tts.
const WAV = (() => {
  const n = 800;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
})();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,x-firebase-appcheck',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });

export const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const PET_LOWER = '石油《せきゆ》から作《つく》られた、かるくて丈夫《じょうぶ》な入《い》れものだよ。';
const PET_STD = '石油から作られた、軽くて丈夫な容器です。';

export const OBJECTS = [
  { label: 'ペットボトル', en: 'plastic bottle', box: [100, 150, 600, 450], alts: ['水筒'] },
  { label: 'りんご', en: 'apple', box: [350, 520, 650, 780] },
];

export const UNITS = [
  { id: 'e12-life-home', why: 'くらしの中でつかう物だから' },
  { id: 'e4-sci-water-state', why: '中の水のすがたがかわるよ' },
];

export function explore(level: string) {
  return {
    id: '0123456789abcdef01234567',
    label: 'ペットボトル',
    name: 'ペットボトル',
    reading: 'ぺっとぼとる',
    en: 'plastic bottle',
    category: 'くらし',
    icon: 'water_bottle',
    oneLiner: `${level}むけのひとこと`,
    summary: level === 'lower' ? PET_LOWER : PET_STD,
    funFact: level === 'lower' ? 'リサイクルすると ふくに なるよ' : 'リサイクルすると繊維になります',
    topics: [
      { id: 't1', title: 'どうやってできる？', teaser: '作り方をのぞいてみよう', kind: 'しくみ', icon: 'factory' },
      { id: 't2', title: 'なぜリサイクルする？', teaser: '資源を大事にするため', kind: 'くらし', icon: 'recycling' },
    ],
    keywords: ['PET'],
    entryPoint: null,
    queries: [],
    wiki: null,
    firstFind: false,
  };
}

export const DEEP_TEXT = ['ペットボトルは', '、石油から作られる**樹脂**でできています。'];

export type Api = { calls: Call[]; of: (path: string) => Call[] };

// Replaces the whole API server (and the external fonts) so no test reaches Gemini or the network.
export async function mockApi(page: Page): Promise<Api> {
  const calls: Call[] = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname;
    let body: Record<string, unknown> = {};
    try {
      body = req.method() === 'POST' ? req.postDataJSON() : Object.fromEntries(url.searchParams);
    } catch {
      /* no body */
    }
    calls.push({ path, body });
    const level = String(body.level ?? 'std');
    switch (path) {
      case '/api/detect':
        return json(route, { objects: OBJECTS });
      case '/api/explore':
        return json(route, explore(level));
      case '/api/known':
        return json(route, { known: true });
      case '/api/units':
        return json(route, { units: UNITS });
      case '/api/deep':
        return route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': 'text/event-stream' },
          body: sse([
            ...DEEP_TEXT.map((d): [string, unknown] => ['delta', d]),
            ['done', { sources: [{ title: '参考ページ', uri: 'https://example.com/pet' }], queries: [], entryPoint: null }],
          ]),
        });
      case '/api/media':
        return json(route, { images: [], videos: [] });
      case '/api/quiz':
        return json(route, { questions: [] });
      case '/api/events':
        return json(route, { ok: true });
      case '/api/usage':
        return json(route, { spentJpy: 0, capJpy: 1000, videoLeft: 1, tier: 'guest', mySpentJpy: 0, myCapJpy: 100 });
      case '/api/illustrate':
      case '/api/diagram':
        return json(route, { url: '/media/mock.png' });
      case '/api/tts':
        return json(route, { url: '/media/mock.wav' });
      default:
        if (path === '/media/mock.wav') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'audio/wav' }, body: WAV });
        if (path.startsWith('/media/')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: PNG });
        return json(route, { error: 'not_mocked' }, 404);
    }
  });
  return { calls, of: (p) => calls.filter((c) => c.path === p) };
}

export const test = base.extend<{ api: Api }>({
  api: async ({ page }, run) => run(await mockApi(page)),
});

export { expect };

// Welcome -> school year -> sample photo -> markers visible.
export async function startWithSample(page: Page, grade = '小2') {
  await page.goto('/');
  await page.getByRole('button', { name: 'この写真でためしてみる' }).click();
  await page.getByRole('button', { name: grade, exact: true }).click();
  await page.getByRole('button', { name: 'これで ためしてみる' }).click();
  await expect(page.getByRole('button', { name: 'ペットボトルをしらべる' })).toBeVisible();
}
