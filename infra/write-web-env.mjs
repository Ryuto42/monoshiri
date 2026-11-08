// Writes web/.env.production.local from the Firebase Management API so CI needs no stored secrets.
// With --local it writes web/.env.local for development instead (API base defaults to the local server).
// The Firebase web config is public by design (it ships inside the built JS); access is governed by Auth and Firestore rules.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const local = process.argv.includes('--local');
const P = process.env.PROJECT ?? 'monoshiri-df26';
const SITE = process.env.SITE ?? (P === 'monoshiri-df26' ? 'monoshiri' : P);
const API_BASE = process.env.VITE_API_BASE ?? (local ? 'http://localhost:8080' : undefined);
if (!API_BASE) throw new Error('VITE_API_BASE is required');
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P };
const apps = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/webApps`, { headers: h }).then((r) => r.json());
const appId = apps.apps?.[0]?.appId;
if (!appId) throw new Error(`no web app: ${JSON.stringify(apps).slice(0, 200)}`);
const c = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/webApps/${appId}/config`, { headers: h }).then((r) => r.json());
// Native Google sign-in: the web OAuth client (Android) comes from the Auth provider, the iOS one from the iOS app's plist.
const google = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/defaultSupportedIdpConfigs/google.com`, { headers: h }).then((r) => r.json());
const iosApp = (await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/iosApps`, { headers: h }).then((r) => r.json())).apps?.[0];
const plist = iosApp
  ? Buffer.from((await fetch(`https://firebase.googleapis.com/v1beta1/projects/${P}/iosApps/${iosApp.appId}/config`, { headers: h }).then((r) => r.json())).configFileContents ?? '', 'base64').toString()
  : '';
const plistValue = (key) => plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`))?.[1] ?? '';
const iosClient = plistValue('CLIENT_ID');
const recaptchaKey = process.env.VITE_RECAPTCHA_KEY
  ?? (await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${P}/apps/${appId}/recaptchaEnterpriseConfig`, { headers: h }).then((r) => r.json()).catch(() => ({}))).siteKey
  ?? '';
const debugTokenFile = new URL('./.appcheck-debug-token', import.meta.url);
const debugToken = local && fs.existsSync(debugTokenFile) ? fs.readFileSync(debugTokenFile, 'utf8').trim() : '';
const env = {
  VITE_FB_API_KEY: c.apiKey, // Sign-in popups and email links run on the app's own domain instead of <project>.firebaseapp.com.
  VITE_FB_AUTH_DOMAIN: process.env.AUTH_DOMAIN ?? `${SITE}.web.app`, VITE_FB_PROJECT_ID: c.projectId, VITE_FB_APP_ID: c.appId,
  VITE_FB_STORAGE_BUCKET: c.storageBucket, VITE_FB_SENDER_ID: c.messagingSenderId, VITE_API_BASE: API_BASE,
  VITE_GOOGLE_WEB_CLIENT_ID: google.enabled ? google.clientId : '', VITE_GOOGLE_IOS_CLIENT_ID: google.enabled ? iosClient : '',
  VITE_RECAPTCHA_KEY: recaptchaKey, ...(debugToken && { VITE_APPCHECK_DEBUG_TOKEN: debugToken }),
};
fs.writeFileSync(
  new URL('../web/ios/google.local.xcconfig', import.meta.url),
  `GOOGLE_REVERSED_CLIENT_ID = ${google.enabled ? plistValue('REVERSED_CLIENT_ID') : ''}\n`,
);
fs.writeFileSync(new URL(local ? '../web/.env.local' : '../web/.env.production.local', import.meta.url), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(`wrote web env for ${c.projectId}${env.VITE_GOOGLE_WEB_CLIENT_ID ? '' : ' (Google sign-in is off in the native apps: enable Google in Firebase Auth)'}`);
