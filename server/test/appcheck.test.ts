import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, fakeDeps } from './helpers.ts';

// APPCHECK_ENFORCE is read at startup, so this file runs in its own process with it on.
process.env.APPCHECK_ENFORCE = '1';
const { createApp } = await import('../src/app.ts');
const { setCached } = await import('../src/store.ts');
const { atLevel } = await import('../src/http.ts');
const { keyOf } = await import('../src/media.ts');
const app = createApp(fakeDeps);

await setCached('cache_explore', atLevel(keyOf('explore', 'りんご'), 'std'), { name: 'りんご', topics: [{ title: 'りんごはなぜ赤い？' }] });
const deep = (token: string, ac?: string) =>
  app.request('/api/deep', {
    method: 'POST',
    headers: auth(token, ac ? { 'X-Firebase-AppCheck': ac } : {}),
    body: JSON.stringify({ name: 'りんご', topic: 'りんごはなぜ赤い？' }),
  });

test('guests without App Check cannot start new generation', async () => {
  const r = await deep('g1:anonymous');
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'attest_required');
  assert.equal((await deep('g1:anonymous', 'forged')).status, 403);
});

test('cached content stays open to everyone', async () => {
  await setCached('cache_deep', keyOf('deep', 'りんご', 'りんごはなぜ赤い？'), { text: 'x'.repeat(120), meta: {} });
  assert.equal((await deep('g2:anonymous')).status, 200);
});
