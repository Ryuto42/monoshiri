import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, fakeDeps } from './helpers.ts';

// APPCHECK_ENFORCE is read at startup, so this file runs in its own process with it on.
process.env.APPCHECK_ENFORCE = '1';
// A pool smaller than one deep dive: guests without App Check are turned away once it can't cover the request.
process.env.UNATTESTED_POOL_JPY = '5';
const { createApp } = await import('../src/app.ts');
const { setCached } = await import('../src/store.ts');
const { atLevel } = await import('../src/http.ts');
const { keyOf } = await import('../src/media.ts');
const app = createApp(fakeDeps);
(await import('../src/routes/mail.ts')).MAIL_TIMING.resetMs = 0;

await setCached('cache_explore', atLevel(keyOf('explore', 'りんご'), 'std'), { name: 'りんご', topics: [{ title: 'りんごはなぜ赤い？' }] });
const deep = (token: string, ac?: string) =>
  app.request('/api/deep', {
    method: 'POST',
    headers: auth(token, ac ? { 'X-Firebase-AppCheck': ac } : {}),
    body: JSON.stringify({ name: 'りんご', topic: 'りんごはなぜ赤い？' }),
  });

test('guests without App Check are turned away when the shared pool cannot cover new generation', async () => {
  const r = await deep('g1:anonymous');
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'attest_required');
  assert.equal((await deep('g1:anonymous', 'forged')).status, 403);
});

test('guests without App Check generate from a shared daily pool until it runs out', async () => {
  const { ensureBudget, addSpent, runAs, AttestError } = await import('../src/store.ts');
  const { JPY_PER_USD } = await import('../src/config.ts');
  const pool = 5 / JPY_PER_USD;
  // One native guest uses most of today's pool...
  await runAs({ uid: 'p1', tier: 'guest', attested: false }, async () => {
    await ensureBudget(pool * 0.6);
    await addSpent(pool * 0.6, 'test');
  });
  // ...another fits in what is left, a third does not; an attested guest is not affected.
  await runAs({ uid: 'p2', tier: 'guest', attested: false }, () => ensureBudget(pool * 0.3));
  await assert.rejects(runAs({ uid: 'p3', tier: 'guest', attested: false }, () => ensureBudget(pool * 0.5)), AttestError);
  await runAs({ uid: 'p4', tier: 'guest', attested: true }, () => ensureBudget(pool * 0.5));
});

test('cached content stays open to everyone', async () => {
  await setCached('cache_deep', keyOf('deep', 'りんご', 'りんごはなぜ赤い？'), { text: 'x'.repeat(120), meta: {} });
  assert.equal((await deep('g2:anonymous')).status, 200);
});

test('password-reset emails also need App Check for guests', async () => {
  const { setMailDeps } = await import('../src/mail/send.ts');
  let sent = 0;
  setMailDeps({
    enabled: () => true,
    getUser: async () => ({ emailVerified: false, providers: [] }),
    verifyLink: async () => '',
    resetLink: async () => 'https://x.firebaseapp.com/__/auth/action?oobCode=C',
    send: async () => void sent++,
  });
  const reset = (token: string, ac?: string) =>
    app.request('/api/mail/reset', { method: 'POST', headers: auth(token, ac ? { 'X-Firebase-AppCheck': ac } : {}), body: JSON.stringify({ email: 'k@example.com' }) });
  assert.equal((await reset('g3:anonymous')).status, 403);
  assert.equal((await reset('g3:anonymous', 'ok')).status, 200);
  assert.equal(sent, 1);
});

test('detection needs no App Check, but the per-account cap still applies', async () => {
  const { ai } = await import('../src/ai.ts');
  const { vision } = await import('../src/vision.ts');
  const { addSpent, requester } = await import('../src/store.ts');
  vision.safeSearch = async (imgs) => imgs.map(() => true);
  (ai.models as any).generateContent = async () => ({ text: JSON.stringify([{ label: 'りんご', en: 'apple', box_2d: [1, 2, 3, 4] }]), usageMetadata: {} });
  const detect = (token: string) => app.request('/api/detect', { method: 'POST', headers: auth(token), body: JSON.stringify({ image: 'AAAA' }) });
  const r = await detect('n1:anonymous');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).objects[0].label, 'りんご');
  await requester.run({ uid: 'n2', tier: 'guest', attested: false }, () => addSpent(1, 'test'));
  const capped = await detect('n2:anonymous');
  assert.equal(capped.status, 402);
  assert.equal((await capped.json()).error, 'user_limit');
});

test('confirmation emails also need App Check for unconfirmed accounts', async () => {
  const { setMailDeps } = await import('../src/mail/send.ts');
  let sent = 0;
  setMailDeps({
    enabled: () => true,
    getUser: async () => ({ email: 'v@example.com', emailVerified: false, providers: ['password'] }),
    verifyLink: async () => 'https://x.firebaseapp.com/__/auth/action?oobCode=V',
    resetLink: async () => null,
    send: async () => void sent++,
  });
  const verify = (ac?: string) =>
    app.request('/api/mail/verify', { method: 'POST', headers: auth('v1:password', ac ? { 'X-Firebase-AppCheck': ac } : {}), body: '{}' });
  const r = await verify();
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'attest_required');
  assert.equal((await verify('ok')).status, 200);
  assert.equal(sent, 1);
});

test('the explore stream sends attest_required as an error event; cached explanations stay open', async () => {
  const stream = async (label: string) =>
    (await app.request('/api/explore/stream', { method: 'POST', headers: auth('g5:anonymous'), body: JSON.stringify({ label }) })).text();
  const fresh = await stream('ホチキスの針');
  assert.match(fresh, /event: error\ndata: \{"error":"attest_required"\}/);
  assert.ok(!fresh.includes('event: quick'));
  assert.match(await stream('りんご'), /event: done/);
});
