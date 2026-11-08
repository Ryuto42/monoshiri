// Prints daily usage from the Firestore `stats_daily` collection (shards summed per date).
// Usage: node infra/stats.mjs [--days 7]
import { execSync } from 'node:child_process';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const args = process.argv.slice(2);
const di = args.indexOf('--days');
const days = di >= 0 ? Number(args[di + 1]) || 0 : 0;

const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P };
const base = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/stats_daily`;

const val = (v) => (v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? (v.mapValue ? plain(v.mapValue.fields ?? {}) : v.stringValue));
const plain = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));

const docs = [];
let pageToken = '';
do {
  const r = await fetch(`${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: h });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  docs.push(...(j.documents ?? []));
  pageToken = j.nextPageToken ?? '';
} while (pageToken);

const byDate = new Map();
for (const d of docs) {
  const f = plain(d.fields ?? {});
  const date = f.date ?? d.name.split('/').pop().split('_')[0];
  const day = byDate.get(date) ?? { e: {}, users: 0 };
  for (const [k, n] of Object.entries(f.e ?? {})) day.e[k] = (day.e[k] ?? 0) + n;
  day.users += Number(f.users ?? 0);
  day.el = day.el ?? {};
  for (const [k, n] of Object.entries(f.el ?? {})) day.el[k] = (day.el[k] ?? 0) + n;
  byDate.set(date, day);
}

let dates = [...byDate.keys()].sort();
if (days > 0) {
  const cut = new Date(Date.now() - (days - 1) * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
  dates = dates.filter((d) => d >= cut);
}
if (!dates.length) {
  console.log('まだ記録がありません');
  process.exit(0);
}

const events = [...new Set(dates.flatMap((d) => Object.keys(byDate.get(d).e)))].sort();
const total = { e: {}, users: 0, el: {} };
const rows = dates.map((d) => {
  const x = byDate.get(d);
  for (const k of events) total.e[k] = (total.e[k] ?? 0) + (x.e[k] ?? 0);
  for (const [k, n] of Object.entries(x.el ?? {})) total.el[k] = (total.el[k] ?? 0) + n;
  total.users += x.users;
  return { 日付: d, 人数: x.users, ...Object.fromEntries(events.map((k) => [k, x.e[k] ?? 0])) };
});
rows.push({ 日付: '合計', 人数: `${total.users}(延べ)`, ...Object.fromEntries(events.map((k) => [k, total.e[k] ?? 0])) });
console.table(rows);

const levelRows = Object.entries(total.el).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => ({ 'イベント@段階': k, 回数: n }));
if (levelRows.length) {
  console.log('段階別');
  console.table(levelRows);
}
