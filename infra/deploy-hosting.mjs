// Uploads web/dist to Firebase Hosting through the REST API using the developer's gcloud login.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const SITE = process.env.SITE ?? P;
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
      const r = await fetch(`${pop.uploadUrl}/${hash}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: gz.get(hash) });
      if (!r.ok) throw new Error(`upload ${hash} ${r.status}`);
    }
  }),
);
await call(`${api}/${version.name}?update_mask=status`, { method: 'PATCH', body: JSON.stringify({ status: 'FINALIZED' }) });
await call(`${api}/sites/${SITE}/releases?versionName=${encodeURIComponent(version.name)}`, { method: 'POST', body: '{}' });
console.log(`deployed ${files.length} files (${(pop.uploadRequiredHashes ?? []).length} uploaded) → https://${SITE}.web.app`);
