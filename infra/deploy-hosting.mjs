// Uploads web/dist to Firebase Hosting through the REST API using the developer's gcloud login.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const SITE = process.env.SITE ?? (P === 'monoshiri-df26' ? 'monoshiri' : P);
// CHANNEL=<id> deploys to a temporary preview channel (expires in 7 days) instead of the live site.
const CHANNEL = process.env.CHANNEL;
const root = new URL('..', import.meta.url).pathname;
const dist = path.join(root, 'web/dist');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8')).hosting;
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': P };
const api = 'https://firebasehosting.googleapis.com/v1beta1';

async function call(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...h, ...init.headers } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : {};
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dist).filter((f) => !/(^|\/)\.|\.tmp\./.test(path.relative(dist, f)));

const gz = new Map();
const manifest = {};
for (const f of files) {
  const data = zlib.gzipSync(fs.readFileSync(f), { level: 9 });
  const hash = createHash('sha256').update(data).digest('hex');
  gz.set(hash, data);
  manifest['/' + path.relative(dist, f)] = hash;
}

// Keep the previous release's chunks and fonts for one more generation: a page loaded just before this deploy
// (or an HTML copy still in a browser cache) can then still fetch them instead of breaking. Only files reachable
// from the live index.html are kept, so files kept last time are dropped now and nothing piles up.
async function previousBuild() {
  const seen = new Set();
  const queue = ['/index.html'];
  while (queue.length) {
    const p = queue.shift();
    const r = await fetch(`https://${SITE}.web.app${p}`).catch(() => null);
    if (!r?.ok || !/(html|javascript|css)/.test(r.headers.get('content-type') ?? '')) continue;
    for (const m of (await r.text()).matchAll(/\/?((?:assets|fonts)\/[\w.-]+\.(?:js|css|woff2))/g)) {
      const ref = `/${m[1]}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (/\.(js|css)$/.test(ref)) queue.push(ref);
    }
  }
  return seen;
}

const kept = await (async () => {
  const live = (await call(`${api}/sites/${SITE}/releases?pageSize=1`)).releases?.[0]?.version?.name;
  if (!live) return 0;
  const wanted = await previousBuild();
  let n = 0;
  let pageToken = '';
  do {
    const page = await call(`${api}/${live}/files?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
    for (const f of page.files ?? []) {
      if (wanted.has(f.path) && !manifest[f.path]) {
        manifest[f.path] = f.hash;
        n++;
      }
    }
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return n;
})();

const config = {
  rewrites: cfg.rewrites.map((r) => ({ glob: r.source, path: r.destination })),
  headers: cfg.headers.map((x) => ({ glob: x.source, headers: Object.fromEntries(x.headers.map((k) => [k.key, k.value])) })),
};

const version = await call(`${api}/sites/${SITE}/versions`, { method: 'POST', body: JSON.stringify({ config }) });
const pop = await call(`${api}/${version.name}:populateFiles`, { method: 'POST', body: JSON.stringify({ files: manifest }) });
const queue = [...(pop.uploadRequiredHashes ?? [])];
await Promise.all(
  Array.from({ length: 16 }, async () => {
    for (let hash = queue.shift(); hash; hash = queue.shift()) {
      if (!gz.has(hash)) throw new Error(`file ${hash} kept from the previous release is no longer on the server`);
      const r = await fetch(`${pop.uploadUrl}/${hash}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: gz.get(hash) });
      if (!r.ok) throw new Error(`upload ${hash} ${r.status}`);
    }
  }),
);
await call(`${api}/${version.name}?update_mask=status`, { method: 'PATCH', body: JSON.stringify({ status: 'FINALIZED' }) });
let target = `${api}/sites/${SITE}`;
let url = `https://${SITE}.web.app`;
if (CHANNEL) {
  target = `${api}/sites/${SITE}/channels/${CHANNEL}`;
  const ch = await call(target).catch(() =>
    call(`${api}/sites/${SITE}/channels?channelId=${encodeURIComponent(CHANNEL)}`, { method: 'POST', body: JSON.stringify({ ttl: '604800s' }) }),
  );
  url = ch.url;
}
await call(`${target}/releases?versionName=${encodeURIComponent(version.name)}`, { method: 'POST', body: '{}' });
console.log(`deployed ${files.length} files + ${kept} kept from the previous release (${(pop.uploadRequiredHashes ?? []).length} uploaded) → ${url}`);
