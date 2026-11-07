// Pre-generates explore / illustration / deep-dive results through the public API so they land in the shared cache.
// Usage: node infra/prewarm.mjs [--topics 1] [--no-illust] [item ...]
// Spends real money (about ¥8 per item with 1 topic). Already-cached items cost nothing.
import fs from 'node:fs';

const API = process.env.API_BASE ?? 'https://monoshiri-api-557874444860.asia-northeast1.run.app';
const DEFAULT_ITEMS = [
  'ペットボトル', 'りんご', '鉛筆', '消しゴム', 'ノート',
  '松ぼっくり', 'イチョウの葉', 'どんぐり',
  '卵', 'バナナ', 'はちみつ', '箸',
  'マグカップ', 'ノートパソコン', 'キーボード',
];

const args = process.argv.slice(2);
const ti = args.indexOf('--topics');
const topics = ti >= 0 ? Number(args[ti + 1]) || 0 : 1;
const illust = !args.includes('--no-illust');
const items = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--topics');
const list = items.length ? items : DEFAULT_ITEMS;

const env = fs.readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
const key = /VITE_FB_API_KEY=(.+)/.exec(env)?.[1]?.trim();
const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
}).then((r) => r.json());
const h = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (path === '/api/deep') {
    const text = await r.text();
    return { ok: r.ok, cached: text.includes('"cached":true') };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
}

for (const label of list) {
  const ex = await post('/api/explore', { label });
  if (!ex.ok || !ex.name) {
    console.log(`× ${label}: ${ex.error ?? 'failed'}`);
    if (ex.error === 'budget') break;
    continue;
  }
  const marks = [`explore${ex.cached ? '(cache)' : ''}`];
  if (illust) {
    const il = await post('/api/illustrate', { name: ex.name, en: ex.en });
    marks.push(il.url ? `illust${il.cached ? '(cache)' : ''}` : `illust×${il.error ?? ''}`);
    if (!il.cached) await sleep(8000);
  }
  for (const t of ex.topics.slice(0, topics)) {
    const d = await post('/api/deep', { name: ex.name, topic: t.title });
    marks.push(d.ok ? `deep${d.cached ? '(cache)' : ''}` : 'deep×');
  }
  console.log(`✓ ${label} → ${ex.name}: ${marks.join(' ')}`);
}

const usage = await fetch(`${API}/api/usage`, { headers: h }).then((r) => r.json());
console.log(`app meter: ¥${usage.spentJpy} / ¥${usage.capJpy}`);
