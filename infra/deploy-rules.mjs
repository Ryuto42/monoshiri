// Deploys firestore.rules with the developer's gcloud login (no Firebase CLI login needed).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': P };
const base = `https://firebaserules.googleapis.com/v1/projects/${P}`;

const rs = await fetch(`${base}/rulesets`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
}).then((r) => r.json());
if (!rs.name) throw new Error(JSON.stringify(rs));
const release = { name: `projects/${P}/releases/cloud.firestore`, rulesetName: rs.name };
let r = await fetch(`${base}/releases/cloud.firestore`, { method: 'PATCH', headers: h, body: JSON.stringify({ release }) });
if (r.status === 404) r = await fetch(`${base}/releases`, { method: 'POST', headers: h, body: JSON.stringify(release) });
console.log(r.status, (await r.text()).slice(0, 200));
