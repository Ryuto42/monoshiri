// Emails the privacy-policy notice to every account with a verified address, a few hundred per run.
// Steps and the Google Cloud setup it needs: docs/deployment.md「プライバシーポリシーを変えたときのお知らせ」.
//
//   npm run notify:policy -- --id 2026-11-20 --date 2026年11月20日 --changes changes.txt [--reconsent]
//       counts who would get it and writes mail-preview/policy-<id>.html (sends nothing)
//   ... --test-to you@example.com   sends one copy to that address only (nothing recorded)
//   ... --send [--limit 400]        sends to the next accounts that haven't had it and records them
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LOCAL, PROJECT, SMTP } from '../config.ts';
import { auth, db } from '../store.ts';
import { defaultMailDeps } from '../mail/send.ts';
import { policyMail } from '../mail/templates.ts';
import { notifyPolicy, NOTICE_ID, type NoticeDeps, type Recipient } from '../mail/policy.ts';

const { values: a } = parseArgs({
  options: {
    id: { type: 'string' },
    date: { type: 'string' },
    changes: { type: 'string' },
    reconsent: { type: 'boolean', default: false },
    send: { type: 'boolean', default: false },
    limit: { type: 'string', default: '400' },
    'test-to': { type: 'string' },
  },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!a.id || !NOTICE_ID.test(a.id)) fail('--id に、お知らせの名前（例: 2026-11-20、英数字と - _ だけ）を指定してください');
if (!a.date) fail('--date に、変えた日（例: 2026年11月20日）を指定してください');
if (!a.changes) fail('--changes に、おもに変わったところを1行に1つ書いたテキストファイルを指定してください');
const changes = fs.readFileSync(a.changes, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
if (!changes.length) fail(`${a.changes} が空です`);
const limit = Number(a.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 450) fail('--limit は 1〜450（Gmail の1日の上限は約500通）');
if (LOCAL || !db) fail('LOCAL_DEV=1 では動きません。本番の Firebase に、Google Cloud の認証（gcloud auth application-default login）で接続してください');
const id = a.id;
const firestore = db;

const mail = policyMail({ date: a.date, changes, reconsent: a.reconsent });
fs.mkdirSync('mail-preview', { recursive: true });
const preview = path.join('mail-preview', `policy-${id}.html`);
fs.writeFileSync(preview, mail.html);
console.log(`project: ${PROJECT}  from: ${SMTP.fromName} <${SMTP.user || '(SMTP_USER 未設定)'}>`);
console.log(`件名: ${mail.subject}\n見た目: ${preview}`);

if ((a.send || a['test-to']) && !defaultMailDeps.enabled()) fail('SMTP_USER と SMTP_PASSWORD が要ります（docs/deployment.md）');

if (a['test-to']) {
  await defaultMailDeps.send(a['test-to'], mail);
  console.log(`${a['test-to']} に1通だけ送りました（記録はしていません）`);
  process.exit(0);
}

const sentCol = (notice: string) => firestore.collection('policyNotices').doc(notice).collection('sent');
const deps: NoticeDeps = {
  listRecipients: async () => {
    const out: Recipient[] = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const u of page.users) if (u.email && u.emailVerified && !u.disabled) out.push({ uid: u.uid, email: u.email });
      pageToken = page.pageToken;
    } while (pageToken);
    return out;
  },
  alreadySent: async (notice, uids) => {
    const done = new Set<string>();
    for (let i = 0; i < uids.length; i += 300) {
      const refs = uids.slice(i, i + 300).map((uid) => sentCol(notice).doc(uid));
      if (!refs.length) continue;
      for (const s of await firestore.getAll(...refs)) if (s.exists) done.add(s.id);
    }
    return done;
  },
  // Only the time is kept, not the address: the record exists to skip people, not to hold their data.
  markSent: async (notice, r) => void (await sentCol(notice).doc(r.uid).set({ sentAt: new Date() })),
  send: defaultMailDeps.send,
  pause: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const r = await notifyPolicy(id, mail, deps, { send: a.send, limit, log: (l) => console.log(l) });
console.log(`送れる相手 ${r.total}人（うち送信済み ${r.sentBefore}人）`);
if (!a.send) {
  console.log(`まだ送っていない ${r.remaining}人。--send を付けると、そのうち最大 ${limit}人に送ります`);
} else {
  console.log(`今回送った ${r.sent}人、失敗 ${r.failed}人、残り ${r.remaining}人${r.stopped ? '（失敗が続いたので途中で止めました）' : ''}`);
  if (r.remaining > 0) console.log('残りは、明日以降に同じコマンドをもう一度実行してください');
}
process.exit(r.stopped ? 1 : 0);
