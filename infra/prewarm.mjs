// Pre-generates explore / illustration / deep-dive results through the public API so they land in the shared cache.
// Usage: node infra/prewarm.mjs [--topics 1] [--no-illust] [--levels std,lower,upper,junior,senior] [item ...]
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
const li = args.indexOf('--levels');
const LEVELS = ['std', 'lower', 'upper', 'junior', 'senior'];
const levels = li >= 0 ? args[li + 1].split(',').map((x) => x.trim()).filter(Boolean) : ['std'];
const badLevel = levels.find((l) => !LEVELS.includes(l));
if (badLevel) throw new Error(`unknown level: ${badLevel} (use ${LEVELS.join(',')})`);
const items = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--topics' && args[i - 1] !== '--levels');
const list = items.length ? items : DEFAULT_ITEMS;

const env = fs.readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
const key = /VITE_FB_API_KEY=(.+)/.exec(env)?.[1]?.trim();
const AUTH_FILE = new URL('./.prewarm-auth.json', import.meta.url);
const jsonPost = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
let idToken, uid;
const saved = fs.existsSync(AUTH_FILE) ? JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) : null;
if (saved?.refreshToken) {
  const t = await fetch(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken }),
  }).then((r) => r.json());
  if (t.id_token) {
    idToken = t.id_token;
    uid = t.user_id;
    if (t.refresh_token && t.refresh_token !== saved.refreshToken) fs.writeFileSync(AUTH_FILE, JSON.stringify({ refreshToken: t.refresh_token }), { mode: 0o600 });
  }
}
if (!idToken) {
  const auth = await jsonPost(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, { returnSecureToken: true });
  if (!auth.idToken) throw new Error(`signUp failed: ${JSON.stringify(auth).slice(0, 200)}`);
  idToken = auth.idToken;
  uid = auth.localId;
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ refreshToken: auth.refreshToken }), { mode: 0o600 });
}
console.log(`prewarm uid: ${uid}`);
console.log('Put this uid in ADMIN_UIDS of Cloud Run to prewarm without per-account limits.');
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
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
  const un = await post('/api/units', { name: label });
  const unitMark = un.ok ? 'units' : `units×${un.error ?? ''}`;
  for (const level of levels) {
    const ex = await post('/api/explore', { label, level });
    if (!ex.ok || !ex.name) {
      console.log(`× ${label} [${level}]: ${ex.error ?? 'failed'}`);
      if (ex.error === 'budget') process.exit(1);
      continue;
    }
    const marks = [unitMark, `explore${ex.cached ? '(cache)' : ''}`];
    if (illust && level === levels[0]) {
      const il = await post('/api/illustrate', { name: ex.name, en: ex.en });
      marks.push(il.url ? `illust${il.cached ? '(cache)' : ''}` : `illust×${il.error ?? ''}`);
      if (!il.cached) await sleep(8000);
    }
    for (const t of (ex.topics ?? []).slice(0, topics)) {
      const d = await post('/api/deep', { name: ex.name, topic: t.title, level });
      marks.push(d.ok ? `deep${d.cached ? '(cache)' : ''}` : 'deep×');
    }
    console.log(`✓ ${label} [${level}] → ${ex.name}: ${marks.join(' ')}`);
  }
}

const usage = await fetch(`${API}/api/usage`, { headers: h }).then((r) => r.json());
console.log(`app meter: ¥${usage.spentJpy} / ¥${usage.capJpy}`);
