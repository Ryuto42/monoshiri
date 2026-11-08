// Writes web/.env.production.local from the Firebase Management API so CI needs no stored secrets.
// With --local it writes web/.env.local for development instead (API base defaults to the local server).
// The Firebase web config is public by design (it ships inside the built JS); access is governed by Auth and Firestore rules.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const local = process.argv.includes('--local');
const P = process.env.PROJECT ?? 'monoshiri-df26';
const API_BASE = process.env.VITE_API_BASE ?? (local ? 'http://localhost:8080' : undefined);
if (!API_BASE) throw new Error('VITE_API_BASE is required');
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P };
const apps = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/webApps`, { headers: h }).then((r) => r.json());
const appId = apps.apps?.[0]?.appId;
if (!appId) throw new Error(`no web app: ${JSON.stringify(apps).slice(0, 200)}`);
const c = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/webApps/${appId}/config`, { headers: h }).then((r) => r.json());
const env = {
  VITE_FB_API_KEY: c.apiKey, VITE_FB_AUTH_DOMAIN: c.authDomain, VITE_FB_PROJECT_ID: c.projectId, VITE_FB_APP_ID: c.appId,
  VITE_FB_STORAGE_BUCKET: c.storageBucket, VITE_FB_SENDER_ID: c.messagingSenderId, VITE_API_BASE: API_BASE,
};
fs.writeFileSync(new URL(local ? '../web/.env.local' : '../web/.env.production.local', import.meta.url), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(`wrote web env for ${c.projectId}`);
