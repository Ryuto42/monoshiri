// Overrides the Identity Toolkit sign-up quota (sign-ups per hour per IP, anonymous included). The override expires after quotaDuration, so rerun this yearly.
// 100 leaves room for a classroom or event venue behind one IP; App Check (not this quota) is what stops account farming.
import { execSync } from 'node:child_process';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const QUOTA = Number(process.env.SIGNUP_QUOTA ?? 100);
const token = execSync('gcloud auth print-access-token').toString().trim();
const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config?updateMask=quota.signUpQuotaConfig`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': P, 'Content-Type': 'application/json' },
  body: JSON.stringify({ quota: { signUpQuotaConfig: { quota: QUOTA, startTime: new Date().toISOString(), quotaDuration: `${365 * 86400}s` } } }),
});
const j = await r.json();
if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
console.log('signUpQuotaConfig', JSON.stringify(j.quota?.signUpQuotaConfig));
