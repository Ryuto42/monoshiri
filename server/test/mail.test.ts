import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { setMailDeps, type MailDeps, type MailUser } from '../src/mail/send.ts';
import { MAIL_LIMITS, MAIL_TIMING, mailbox, resetMailLimits } from '../src/routes/mail.ts';
import { auth, fakeDeps } from './helpers.ts';

const app = createApp(fakeDeps);
MAIL_TIMING.resetMs = 0;
const post = (path: string, body: object, token = 'm1:password') => app.request(path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

type Sent = { to: string; subject: string; html: string; text: string };
let outbox: Sent[] = [];
let users: Record<string, MailUser> = {};
const FIREBASE_LINK = (code: string) => `https://monoshiri-df26.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=${code}&apiKey=x&continueUrl=https%3A%2F%2Fmonoshiri.web.app%2Faccount&lang=ja`;

function use(over: Partial<MailDeps> = {}) {
  setMailDeps({
    enabled: () => true,
    getUser: async (uid) => users[uid] ?? { emailVerified: false, providers: ['anonymous'] },
    verifyLink: async () => FIREBASE_LINK('VERIFY123'),
    resetLink: async (email) => (email === 'known@example.com' ? FIREBASE_LINK('RESET456') : null),
    send: async (to, m) => void outbox.push({ to, ...m }),
    ...over,
  });
}

beforeEach(() => {
  outbox = [];
  users = { m1: { email: 'kid@example.com', emailVerified: false, providers: ['password'] } };
  resetMailLimits();
  use();
});

test('verify: sends an app-styled email whose link opens /auth/action', async () => {
  const r = await post('/api/mail/verify', {});
  assert.equal(r.status, 200);
  assert.equal(outbox.length, 1);
  const m = outbox[0];
  assert.equal(m.to, 'kid@example.com');
  assert.equal(m.subject, 'モノシリ メールアドレスの確認');
  assert.match(m.html, /https:\/\/monoshiri\.web\.app\/auth\/action\?mode=verifyEmail&amp;oobCode=VERIFY123/);
  assert.match(m.html, /メールアドレスを確認する/);
  assert.match(m.text, /oobCode=VERIFY123/);
  assert.ok(!m.html.includes('firebaseapp.com'), "Firebase's own page is not linked");
});

test('verify: nothing to send for confirmed, Google-only or guest accounts', async () => {
  users.m1.emailVerified = true;
  assert.equal((await post('/api/mail/verify', {})).status, 400);
  users.g1 = { email: 'g@example.com', emailVerified: false, providers: ['google.com'] };
  assert.equal((await post('/api/mail/verify', {}, 'g1:google.com')).status, 400);
  assert.equal((await post('/api/mail/verify', {}, 'a1:anonymous')).status, 400);
  assert.equal(outbox.length, 0);
});

test('reset: same answer for known and unknown addresses, email only to the known one', async () => {
  const known = await post('/api/mail/reset', { email: 'known@example.com' }, 'a1:anonymous');
  const unknown = await post('/api/mail/reset', { email: 'nobody@example.com' }, 'a1:anonymous');
  assert.deepEqual([known.status, await known.json()], [200, { ok: true }]);
  assert.deepEqual([unknown.status, await unknown.json()], [200, { ok: true }]);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].html, /\/auth\/action\?mode=resetPassword&amp;oobCode=RESET456/);
  assert.equal((await post('/api/mail/reset', { email: 'not-an-address' }, 'a1:anonymous')).status, 400);
});

test('limits per account and per address', async () => {
  for (let i = 0; i < MAIL_LIMITS.perAddress; i++) assert.equal((await post('/api/mail/reset', { email: 'known@example.com' }, `u${i}:anonymous`)).status, 200);
  assert.equal((await post('/api/mail/reset', { email: 'known@example.com' }, 'u9:anonymous')).status, 429);
  resetMailLimits();
  for (let i = 0; i < MAIL_LIMITS.perAccount; i++) assert.equal((await post('/api/mail/reset', { email: `x${i}@example.com` }, 'same:anonymous')).status, 200);
  assert.equal((await post('/api/mail/reset', { email: 'y@example.com' }, 'same:anonymous')).status, 429);
});

test('without SMTP settings the app is told to use Firebase\'s standard email', async () => {
  use({ enabled: () => false });
  assert.equal((await post('/api/mail/verify', {})).status, 503);
  assert.equal((await post('/api/mail/reset', { email: 'known@example.com' })).status, 503);
});

test('addresses are escaped in the HTML', async () => {
  users.m1.email = 'a<b>@example.com';
  await post('/api/mail/verify', {});
  assert.ok(outbox[0].html.includes('a&lt;b&gt;@example.com'));
  assert.ok(!outbox[0].html.includes('a<b>@'));
});

test('mail is plain enough not to look like spam: no hidden preheader, no emoji, a full text part', async () => {
  await post('/api/mail/verify', {});
  const m = outbox[0];
  assert.ok(!/display:none/.test(m.html));
  assert.ok(!/&#x1F|[\u{1F300}-\u{1FAFF}]/u.test(m.html + m.subject));
  assert.ok(!/[｜|【】!！]/.test(m.subject));
  assert.match(m.text, /どの端末でログインしても/);
  assert.match(m.text, /monoshiri\.app@gmail\.com/);
});

test('the per-address limit counts the mailbox, not the spelling', async () => {
  assert.equal(mailbox('Kid+news@Gmail.com'), 'kid@gmail.com');
  assert.equal(mailbox('k.i.d@googlemail.com'), 'kid@gmail.com');
  assert.equal(mailbox('k.i.d+x@example.com'), 'k.i.d@example.com');
  const spellings = ['kid@gmail.com', 'K.id+1@gmail.com', 'k.i.d@googlemail.com'];
  for (const [i, email] of spellings.entries()) assert.equal((await post('/api/mail/reset', { email }, `p${i}:anonymous`)).status, 200);
  assert.equal((await post('/api/mail/reset', { email: 'kid+2@gmail.com' }, 'p9:anonymous')).status, 429);
});

test('reset answers after the same wait whether or not the address is known', async () => {
  MAIL_TIMING.resetMs = 80;
  try {
    // Sending to the known address is slow-ish and the unknown one returns at once; both wait out the same time.
    use({ send: async (to, m) => void (await new Promise((r) => setTimeout(r, 20)), outbox.push({ to, ...m })) });
    for (const email of ['known@example.com', 'nobody@example.com']) {
      const t0 = Date.now();
      const r = await post('/api/mail/reset', { email }, `t-${email}:anonymous`);
      assert.deepEqual(await r.json(), { ok: true });
      assert.ok(Date.now() - t0 >= 75, `${email} answered too early`);
    }
    // A failed send looks the same from outside.
    use({ send: async () => { throw new Error('smtp down'); } });
    const r = await post('/api/mail/reset', { email: 'known@example.com' }, 'f1:anonymous');
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
  } finally {
    MAIL_TIMING.resetMs = 0;
  }
});
