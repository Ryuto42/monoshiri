// Idempotent App Check setup for the web app: reCAPTCHA Enterprise key + App Check provider registration + a local debug token.
// Enforcement (Firestore, Auth, ...) is deliberately left off so the native apps keep working.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const SITE = process.env.SITE ?? (P === 'monoshiri-df26' ? 'monoshiri' : P);
const DISPLAY = 'monoshiri-web';
// Production domains only: local development uses the debug token below, so the key can't be used from any localhost page.
const DOMAINS = [...new Set([`${SITE}.web.app`, `${SITE}.firebaseapp.com`, `${P}.web.app`, `${P}.firebaseapp.com`])];
const TOKEN_FILE = new URL('./.appcheck-debug-token', import.meta.url);

execSync(`gcloud services enable recaptchaenterprise.googleapis.com firebaseappcheck.googleapis.com --project ${P}`, { stdio: 'inherit' });
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P, 'Content-Type': 'application/json' };
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};

const keys = (await call('GET', `https://recaptchaenterprise.googleapis.com/v1/projects/${P}/keys`)).keys ?? [];
let key = keys.find((k) => k.displayName === DISPLAY && k.webSettings);
if (!key) {
  key = await call('POST', `https://recaptchaenterprise.googleapis.com/v1/projects/${P}/keys`, {
    displayName: DISPLAY,
    webSettings: { integrationType: 'SCORE', allowedDomains: DOMAINS, allowAmpTraffic: false },
  });
  console.log('created reCAPTCHA key');
} else if (JSON.stringify(key.webSettings.allowedDomains?.slice().sort()) !== JSON.stringify(DOMAINS.slice().sort())) {
  key = await call('PATCH', `https://recaptchaenterprise.googleapis.com/v1/${key.name}?updateMask=webSettings.allowedDomains`, { webSettings: { allowedDomains: DOMAINS } });
  console.log('updated reCAPTCHA domains');
}
const siteKey = key.name.split('/').pop();
console.log(`reCAPTCHA site key: ${siteKey}`);

const apps = await call('GET', `https://firebase.googleapis.com/v1beta1/projects/${P}/webApps`);
const appId = apps.apps?.[0]?.appId;
if (!appId) throw new Error('no web app');
const cfgName = `projects/${P}/apps/${appId}/recaptchaEnterpriseConfig`;
const cfg = await call('PATCH', `https://firebaseappcheck.googleapis.com/v1/${cfgName}?updateMask=siteKey`, { name: cfgName, siteKey });
console.log(`App Check provider registered: ${cfg.name} siteKey=${cfg.siteKey}`);

if (fs.existsSync(TOKEN_FILE)) {
  console.log('debug token already exists (infra/.appcheck-debug-token)');
} else {
  const value = crypto.randomUUID();
  await call('POST', `https://firebaseappcheck.googleapis.com/v1/projects/${P}/apps/${appId}/debugTokens`, { displayName: 'local-dev', token: value });
  fs.writeFileSync(TOKEN_FILE, value + '\n', { mode: 0o600 });
  console.log('created debug token -> infra/.appcheck-debug-token');
}
console.log('enforcement is untouched (off).');
