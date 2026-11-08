// Applies Monoshiri's email templates (infra/email/) to Firebase Authentication, and points the links in them at the
// app's own page (/auth/action), which confirms the address and goes back into the app.
// Usage: PROJECT=<project> node infra/setup-email-templates.mjs [--preview <dir>] [--no-action-url]
//   --preview <dir>   only writes the HTML (with sample values) to <dir> to look at in a browser
//   --no-action-url   keeps Firebase's default link page (use before the app with /auth/action is deployed)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templates } from './email/templates.mjs';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const SITE = process.env.SITE ?? (P === 'monoshiri-df26' ? 'monoshiri' : P);
const args = process.argv.slice(2);

const pi = args.indexOf('--preview');
if (pi >= 0) {
  const dir = args[pi + 1] ?? 'email-preview';
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, t] of Object.entries(templates)) {
    const html = t.body
      .replaceAll('%LINK%', `https://${SITE}.web.app/auth/action?mode=verifyEmail&oobCode=SAMPLE`)
      .replaceAll('%EMAIL%', 'taro@example.com')
      .replaceAll('%NEW_EMAIL%', 'new@example.com');
    fs.writeFileSync(path.join(dir, `${name}.html`), html);
  }
  console.log(`wrote previews to ${dir}`);
  process.exit(0);
}

const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P, 'Content-Type': 'application/json' };
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config`;
const current = await fetch(base, { headers: h }).then((r) => r.json());
if (current.error) throw new Error(JSON.stringify(current.error));

const sendEmail = { ...current.notification?.sendEmail };
const mask = [];
for (const [name, t] of Object.entries(templates)) {
  sendEmail[name] = {
    ...sendEmail[name],
    senderLocalPart: 'noreply',
    senderDisplayName: 'モノシリ',
    subject: t.subject,
    body: t.body,
    bodyFormat: 'HTML',
    replyTo: 'noreply',
  };
  mask.push(`notification.sendEmail.${name}`);
}
if (!args.includes('--no-action-url')) {
  sendEmail.callbackUri = `https://${SITE}.web.app/auth/action`;
  mask.push('notification.sendEmail.callbackUri');
}

const r = await fetch(`${base}?updateMask=${mask.join(',')}`, { method: 'PATCH', headers: h, body: JSON.stringify({ notification: { sendEmail } }) });
const j = await r.json();
if (!r.ok) throw new Error(JSON.stringify(j.error ?? j).slice(0, 600));
const s = j.notification.sendEmail;
console.log('callbackUri', s.callbackUri);
for (const name of Object.keys(templates)) console.log(name, '→', s[name]?.subject, `(${s[name]?.body?.length ?? 0} chars)`);
