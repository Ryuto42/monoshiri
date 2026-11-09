import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { addCached, addSpent, getCached, requester, reserveCounter, resetMemory, setCached } from '../src/store.ts';
import { memStats, resetStats } from '../src/stats.ts';
import { tierOf, RATE_LIMIT } from '../src/auth.ts';
import { allowedText, letters } from '../src/routes/speech.ts';
import { atLevel } from '../src/http.ts';
import { keyOf } from '../src/media.ts';
import { auth, fakeDeps } from './helpers.ts';

const app = createApp(fakeDeps);
const post = (path: string, body: object, token = 'u1:anonymous') => app.request(path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

const seedExplore = (name: string, level: 'std' | 'lower' = 'std', topics = ['ペットボトルはどうやってできる？']) =>
  setCached('cache_explore', atLevel(keyOf('explore', name), level), {
    name, en: 'plastic bottle', summary: 'ペットボトルは石油《せきゆ》からできた**プラスチック**の入れ物です。', oneLiner: '軽くてじょうぶ',
    funFact: '日本では1977年に登場した', topics: topics.map((title) => ({ title, teaser: 'とかした材料をふくらませる' })),
  });

beforeEach(() => {
  resetMemory();
  resetStats();
});

test('health needs no token', async () => {
  const r = await app.request('/api/health');
  assert.equal(r.status, 200);
});

test('rejects missing and invalid ID tokens', async () => {
  assert.equal((await app.request('/api/usage')).status, 401);
  assert.equal((await app.request('/api/usage', { headers: auth('bad') })).status, 401);
});

test('usage reports tier and App Check status', async () => {
  const guest = await (await app.request('/api/usage', { headers: auth('g1:anonymous') })).json();
  assert.equal(guest.tier, 'guest');
  assert.equal(guest.attested, false);
  const member = await (await app.request('/api/usage', { headers: auth('m1:google.com', { 'X-Firebase-AppCheck': 'ok' }) })).json();
  assert.equal(member.tier, 'member');
  assert.equal(member.attested, true);
});

test('tiers: unverified email stays a guest', () => {
  const t = (provider: string, verified = false) => tierOf({ uid: 'x', exp: 0, email_verified: verified, firebase: { sign_in_provider: provider } });
  assert.equal(t('anonymous'), 'guest');
  assert.equal(t('password'), 'guest');
  assert.equal(t('password', true), 'member');
  assert.equal(t('google.com'), 'member');
});

test('deep dive only for explored things and their topics', async () => {
  const r = await post('/api/deep', { name: 'ペットボトル', topic: 'なにか' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'unknown_subject');
  await seedExplore('ペットボトル');
  const r2 = await post('/api/deep', { name: 'ペットボトル', topic: '関係ない問い' });
  assert.equal(r2.status, 400);
});

test('cached deep dive streams without spending', async () => {
  const text = 'ペットボトルは、とかしたプラスチックを型の中でふくらませて作ります。'.repeat(3);
  await setCached('cache_deep', keyOf('deep', 'ペットボトル', 'どうやってできる？'), { text, meta: { sources: [], queries: [] } });
  const r = await post('/api/deep', { name: 'ペットボトル', topic: 'どうやってできる？' });
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /event: delta/);
  assert.match(body, /"cached":true/);
  assert.equal(memStats().values().next().value?.['e.topic_open'], 1);
});

test('app-wide budget stops new generation', async () => {
  await seedExplore('ペットボトル');
  await addSpent(1000, 'test');
  const r = await post('/api/deep', { name: 'ペットボトル', topic: 'ペットボトルはどうやってできる？' });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).error, 'budget');
});

test('per-account cap stops a guest but not cached content', async () => {
  await seedExplore('ペットボトル');
  await requester.run({ uid: 'g2', tier: 'guest', attested: true }, () => addSpent(1, 'test'));
  const r = await post('/api/deep', { name: 'ペットボトル', topic: 'ペットボトルはどうやってできる？' }, 'g2:anonymous');
  assert.equal(r.status, 402);
  assert.deepEqual(await r.json(), { error: 'user_limit', tier: 'guest', capJpy: 50 });
  await setCached('cache_quiz', keyOf('quiz2', 'ペットボトル', 'ペットボトルはどうやってできる？'), { questions: [] });
  const q = await post('/api/quiz', { name: 'ペットボトル', topic: 'ペットボトルはどうやってできる？' }, 'g2:anonymous');
  assert.equal(q.status, 200);
});

test('read-aloud only voices text from the stored explanation', async () => {
  await seedExplore('ペットボトル', 'lower');
  await setCached('cache_deep', atLevel(keyOf('deep', 'ペットボトル', 'ペットボトルはどうやってできる？'), 'lower'), {
    text: '### つくりかた\n- 小《ちい》さな**試験管**のような形をあたためて、空気でふくらませます。',
  });
  // Markdown, spacing and furigana differ from what the screen shows, but the words match.
  assert.equal(await allowedText('ペットボトルは石油からできたプラスチックの入れ物です。', { name: 'ペットボトル', level: 'lower' }), true);
  assert.equal(await allowedText('小さな試験管のような形をあたためて、空気でふくらませます。', { name: 'ペットボトル', topic: 'ペットボトルはどうやってできる？', level: 'lower' }), true);
  // Cards keep the stage they were saved at, so other stages are tried too.
  assert.equal(await allowedText('ペットボトルは石油からできたプラスチックの入れ物です。', { name: 'ペットボトル', level: 'senior' }), true);
  assert.equal(await allowedText('これは関係のない長い文章で、好きなことを読み上げさせようとしています。', { name: 'ペットボトル' }), false);
  assert.equal(await allowedText('これは関係のない長い文章で、好きなことを読み上げさせようとしています。', undefined), false);
  assert.equal(await allowedText('まめちしき', undefined), true);
  assert.equal(await allowedText('知ってた？日本では1977年に登場した', { name: 'ペットボトル', level: 'lower' }), true);
  const r = await post('/api/tts', { text: 'これは関係のない長い文章で、好きなことを読み上げさせようとしています。', ref: { name: 'ペットボトル' } });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'unknown_text');
  assert.equal(letters('水《みず》 は\n**大切**'), '水は大切');
});

test('cached read-aloud is served without a ref (older app versions)', async () => {
  const t = 'これは前から作ってある読み上げで、キャッシュにあるので誰でも聞けます。';
  await setCached('cache_tts', keyOf('tts2', t), { url: '/media/tts/x.wav' });
  const r = await post('/api/tts', { text: t });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, '/media/tts/x.wav');
});

test('units: unknown things are refused, cached picks are shared', async () => {
  const r = await post('/api/units', { name: 'ペットボトル' });
  assert.equal(r.status, 400);
  await setCached('cache_units', keyOf('units', 'ペットボトル'), { units: [{ id: 'e4-sci-x', why: 'ためしに' }] });
  const r2 = await post('/api/units', { name: 'ペットボトル' });
  assert.deepEqual(await r2.json(), { units: [{ id: 'e4-sci-x', why: 'ためしに' }] });
});

test('events: only known app events, capped, no uid stored', async () => {
  await post('/api/events', { events: [{ name: 'quiz_answer' }, { name: 'quiz_correct', n: 99 }, { name: 'explore_new' }, { name: 'hack' }], level: 'upper' });
  const row = [...memStats().values()][0];
  assert.equal(row['e.quiz_answer'], 1);
  assert.equal(row['e.quiz_correct'], 10);
  assert.equal(row['el.quiz_answer@upper'], 1);
  assert.equal(row['e.explore_new'], undefined);
  assert.equal(row['e.hack'], undefined);
  assert.equal(row.users, 1);
  assert.ok(!JSON.stringify(row).includes('u1'));
});

test('rate limit per account', async () => {
  for (let i = 0; i < RATE_LIMIT; i++) assert.equal((await post('/api/events', { events: [] }, 'r1:anonymous')).status, 200);
  assert.equal((await post('/api/events', { events: [] }, 'r1:anonymous')).status, 429);
  assert.equal((await post('/api/events', { events: [] }, 'r2:anonymous')).status, 200);
});

test('video slots are taken atomically', async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => reserveCounter('video', 2)));
  assert.equal(results.filter(Boolean).length, 2);
});

test('media paths are validated', async () => {
  assert.equal((await app.request('/media/../secret')).status, 404);
  assert.equal((await app.request('/media/illust/../../x.webp')).status, 404);
  assert.equal((await app.request('/media/illust/missing.webp')).status, 404);
});

test('stages with furigana use their own cache keys', () => {
  assert.equal(atLevel('k', 'std'), 'k');
  assert.equal(atLevel('k', 'lower'), 'k-lower-r1');
  assert.equal(atLevel('k', 'junior'), 'k-junior');
});

test('shared explanations are never overwritten', async () => {
  assert.equal(await addCached('cache_explore', 'k1', { summary: 'first' }), true);
  assert.equal(await addCached('cache_explore', 'k1', { summary: 'crafted' }), false);
  assert.equal((await getCached<{ summary: string }>('cache_explore', 'k1'))?.summary, 'first');
});

test('curriculum list is valid and the same file the web app ships', async () => {
  const { curriculum } = await import('../src/routes/learn.ts');
  const fs = await import('node:fs');
  const list = curriculum();
  assert.ok(list.length >= 150);
  const ids = new Set(list.map((u) => u.id));
  assert.equal(ids.size, list.length);
  for (const u of list) {
    assert.match(u.id, /^[a-z0-9-]{1,20}$/);
    assert.ok(u.unit.length <= 20 && u.examples.length >= 1);
  }
  const web = fs.readFileSync(new URL('../../web/src/data/curriculum.json', import.meta.url), 'utf8');
  const srv = fs.readFileSync(new URL('../src/curriculum.json', import.meta.url), 'utf8');
  assert.equal(srv, web, 'server/src/curriculum.json and web/src/data/curriculum.json must match');
});

test('card illustrations accept things explored at any stage', async () => {
  const { exploredAtAnyLevel } = await import('../src/http.ts');
  await seedExplore('ペットボトル', 'lower');
  assert.equal(await exploredAtAnyLevel('ペットボトル'), true);
  assert.equal(await exploredAtAnyLevel('りんご'), false);
});
