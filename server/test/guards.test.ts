import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createApp } from '../src/app.ts';
import { ai } from '../src/ai.ts';
import { vision } from '../src/vision.ts';
import { interactions } from '../src/routes/video.ts';
import { GET_RATE_LIMIT } from '../src/auth.ts';
import {
  addSpent, ensureBudget, getCached, getCounter, getSpent, inflightOf, MAX_RUNNING_PER_USER, requester, resetMemory, runAs,
  setCached, UserLimitError,
} from '../src/store.ts';
import { resetStats } from '../src/stats.ts';
import { atLevel } from '../src/http.ts';
import { keyOf } from '../src/media.ts';
import { auth, fakeDeps } from './helpers.ts';

// Generation is stubbed: these tests never reach Google Cloud.
const app = createApp(fakeDeps);
const post = (path: string, body: object, token = 'u1:anonymous') => app.request(path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

const TOPIC = 'ペットボトルはどうやってできる？';
const seedExplore = (name: string, level: 'std' | 'lower' = 'std', topics = [TOPIC]) =>
  setCached('cache_explore', atLevel(keyOf('explore', name), level), {
    name, en: 'plastic bottle', summary: 'ペットボトルは石油《せきゆ》からできた入れ物です。', funFact: '日本では1977年に登場した',
    topics: topics.map((title) => ({ title, teaser: 'とかした材料をふくらませる', kind: 'つくりかた' })),
  });
const DEEP = '### つくりかた\n小《ちい》さな試験管のような形をあたためて、空気でふくらませます。\n```mermaid\nflowchart LR\n A["X"] --> B["Y"]\n```\n'.repeat(3);

type Call = { model: string; contents: any };
let calls: Call[] = [];
const text = (contents: any) => JSON.stringify(contents);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 1000 && !cond(); i++) await new Promise((r) => setImmediate(r));
  assert.ok(cond(), 'timed out');
};

beforeEach(() => {
  resetMemory();
  resetStats();
  calls = [];
  vision.safeSearch = async (imgs) => imgs.map(() => true);
  (ai.models as any).generateContent = async (p: Call) => {
    calls.push(p);
    throw new Error('stub: no generation in tests');
  };
});

const quizOut = { questions: [{ q: 'ペットボトルの原料は？', choices: ['石油', '木', '鉄'], answer: 0, explain: '石油からできる' }] };

test('deep: a topic listed at another stage can be read at this one', async () => {
  await seedExplore('ペットボトル', 'lower');
  (ai.models as any).generateContentStream = async () =>
    (async function* () {
      yield { text: 'ペットボトルは石油からできたプラスチックを、型の中であたためてふくらませて作ります。'.repeat(3), usageMetadata: {} };
    })();
  const r = await post('/api/deep', { name: 'ペットボトル', topic: TOPIC, level: 'senior' });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /event: done/);
  assert.ok(await getCached('cache_deep', atLevel(keyOf('deep', 'ペットボトル', TOPIC), 'senior')));
  // The reservation went away when the stream ended.
  assert.deepEqual(inflightOf('u1'), { usd: 0, running: 0 });
  assert.equal((await post('/api/deep', { name: 'ペットボトル', topic: 'ほかの問い', level: 'senior' })).status, 400);
});

test('quiz: { name, topic, level } from the stored deep dive (any stage); a client context is ignored', async () => {
  await seedExplore('ペットボトル', 'lower');
  await setCached('cache_deep', atLevel(keyOf('deep', 'ペットボトル', TOPIC), 'lower'), { text: DEEP });
  (ai.models as any).generateContent = async (p: Call) => (calls.push(p), { text: JSON.stringify(quizOut), usageMetadata: {} });
  const r = await post('/api/quiz', { name: 'ペットボトル', topic: TOPIC, level: 'junior', context: 'クライアントが書いた好きな文章' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), quizOut);
  const prompt = text(calls[0].contents);
  assert.match(prompt, /試験管のような形/);
  assert.ok(!prompt.includes('クライアントが書いた') && !prompt.includes('《') && !prompt.includes('mermaid'));
  assert.deepEqual(await getCached('cache_quiz', atLevel(keyOf('quiz2', 'ペットボトル', TOPIC), 'junior')), quizOut);
  assert.equal((await post('/api/quiz', { name: 'ペットボトル', topic: 'リストに無い問い' })).status, 400);
  assert.equal((await post('/api/quiz', { name: 'りんご', topic: TOPIC })).status, 400);
});

test('quiz: without a deep dive the explanation is used', async () => {
  await seedExplore('ペットボトル');
  (ai.models as any).generateContent = async (p: Call) => (calls.push(p), { text: JSON.stringify(quizOut), usageMetadata: {} });
  assert.equal((await post('/api/quiz', { name: 'ペットボトル', topic: TOPIC })).status, 200);
  assert.match(text(calls[0].contents), /石油からできた入れ物[\s\S]*1977年/);
});

test('quiz: malformed output is refused and never cached', async () => {
  await seedExplore('ペットボトル');
  const bad = [
    { questions: [] },
    { questions: Array(6).fill(quizOut.questions[0]) },
    { questions: [{ ...quizOut.questions[0], choices: ['a', 'b'] }] },
    { questions: [{ ...quizOut.questions[0], answer: 3 }] },
    { questions: [{ ...quizOut.questions[0], answer: 1.5 }] },
    { questions: [{ ...quizOut.questions[0], q: 'x'.repeat(201) }] },
    'not json',
  ];
  for (const out of bad) {
    (ai.models as any).generateContent = async () => ({ text: typeof out === 'string' ? out : JSON.stringify(out), usageMetadata: {} });
    const r = await post('/api/quiz', { name: 'ペットボトル', topic: TOPIC });
    assert.equal(r.status, 502, JSON.stringify(out).slice(0, 60));
    assert.equal((await r.json()).error, 'quiz_failed');
  }
  assert.equal(await getCached('cache_quiz', keyOf('quiz2', 'ペットボトル', TOPIC)), null);
});

test('illustrate and diagram use the stored en and outline, not the client values', async () => {
  await seedExplore('ペットボトル', 'lower');
  await setCached('cache_deep', atLevel(keyOf('deep', 'ペットボトル', TOPIC), 'lower'), { text: DEEP });
  await post('/api/illustrate', { name: 'ペットボトル', en: 'EVIL' });
  await post('/api/diagram', { name: 'ペットボトル', en: 'EVIL', topic: TOPIC, outline: 'EVIL OUTLINE', level: 'senior' });
  assert.equal(calls.length, 2);
  const [illust, diagram] = calls.map((c) => text(c.contents));
  assert.match(illust, /plastic bottle/);
  assert.match(diagram, /plastic bottle/);
  assert.match(diagram, /試験管のような形/);
  for (const p of [illust, diagram]) assert.ok(!p.includes('EVIL'));
  assert.ok(!diagram.includes('mermaid') && !diagram.includes('《'));
});

test('video: stored outline; a failed start gives the slot back and charges nothing', async () => {
  await seedExplore('ペットボトル');
  await setCached('cache_deep', keyOf('deep', 'ペットボトル', TOPIC), { text: DEEP });
  let body: any = null;
  interactions.start = async (b) => ((body = b), { ok: false, data: { error: 'quota' } });
  const r = await post('/api/video', { name: 'ペットボトル', en: 'EVIL', topic: TOPIC, outline: 'EVIL OUTLINE' }, 'm1:google.com');
  assert.equal(r.status, 502);
  assert.equal(await getCounter('video'), 0);
  assert.equal(await getSpent(), 0);
  assert.deepEqual(inflightOf('m1'), { usd: 0, running: 0 });
  const prompt = body.input[0].text;
  assert.match(prompt, /plastic bottle/);
  assert.match(prompt, /試験管のような形/);
  assert.ok(!prompt.includes('EVIL'));

  interactions.start = async () => ({ ok: true, data: { id: 'job-1' } });
  const ok = await post('/api/video', { name: 'ペットボトル', topic: TOPIC }, 'm1:google.com');
  assert.deepEqual(await ok.json(), { status: 'in_progress', id: 'job-1' });
  assert.equal(await getCounter('video'), 1);
  assert.ok((await getSpent()) > 0);

  interactions.get = async () => ({ ok: false, data: { error: { code: 404 } } });
  const st = await app.request('/api/video/job-1', { headers: auth('m1:google.com') });
  assert.deepEqual(await st.json(), { status: 'failed' });
});

test('parallel requests cannot pass the per-account cap together', async () => {
  const hold = deferred();
  // Guest cap is ¥50 (about $0.31): with $0.12 reserved each, only two fit at once.
  const tries = [1, 2, 3, 4].map(() =>
    runAs({ uid: 'p1', tier: 'guest', attested: true }, async () => {
      await ensureBudget(0.12);
      await hold.promise;
    }),
  );
  const settled = Promise.allSettled(tries);
  await until(() => inflightOf('p1').running === 2);
  hold.resolve();
  const results = await settled;
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 2);
  assert.ok(results.filter((x) => x.status === 'rejected').every((x) => (x as PromiseRejectedResult).reason instanceof UserLimitError));
  assert.deepEqual(inflightOf('p1'), { usd: 0, running: 0 });
});

test('reserved amounts turn into recorded spend, not both', async () => {
  await runAs({ uid: 'p2', tier: 'member', attested: true }, async () => {
    await ensureBudget(0.06);
    await addSpent(0.02, 'test');
    assert.ok(Math.abs(inflightOf('p2').usd - 0.04) < 1e-9);
  });
  assert.deepEqual(inflightOf('p2'), { usd: 0, running: 0 });
});

test(`at most ${MAX_RUNNING_PER_USER} generations per account at once`, async () => {
  const names = ['a', 'b', 'c', 'd'];
  for (const n of names) await seedExplore(n);
  const hold = deferred();
  (ai.models as any).generateContent = async (p: Call) => {
    calls.push(p);
    await hold.promise;
    throw new Error('stub');
  };
  const running = names.slice(0, MAX_RUNNING_PER_USER).map((n) => post('/api/illustrate', { name: n }, 'c1:google.com'));
  await until(() => calls.length === MAX_RUNNING_PER_USER);
  const r = await post('/api/illustrate', { name: 'd' }, 'c1:google.com');
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, 'busy');
  // Someone else isn't held up.
  const other = post('/api/illustrate', { name: 'd' }, 'c2:google.com');
  await until(() => calls.length === MAX_RUNNING_PER_USER + 1);
  hold.resolve();
  await Promise.all([...running, other]);
  assert.deepEqual(inflightOf('c1'), { usd: 0, running: 0 });
});

test('explore: the photo only picks the name; the shared explanation is written without it', async () => {
  await setCached('cache_media', keyOf('wiki', 'ペットボトル'), { v: null });
  (ai.models as any).generateContent = async (p: Call) => {
    calls.push(p);
    if (calls.length === 1) return { text: JSON.stringify({ name: 'ペットボトル' }), usageMetadata: {} };
    return {
      text: JSON.stringify({
        name: 'ペットボトル', reading: 'ぺっとぼとる', en: 'plastic bottle', category: 'くらし', icon: 'recycling', oneLiner: 'x', summary: 'y',
        funFact: 'z', topics: [{ title: TOPIC, teaser: 't', kind: 'つくりかた', icon: 'factory' }], keywords: [], ok: true,
      }),
      usageMetadata: {},
    };
  };
  const r = await post('/api/explore', { label: 'ボトル', image: 'AAAA' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).name, 'ペットボトル');
  assert.equal(calls.length, 2);
  assert.match(text(calls[0].contents), /inlineData/);
  assert.ok(!text(calls[1].contents).includes('inlineData'), 'the explanation prompt carries no image');
  assert.match(text(calls[1].contents), /ペットボトル/);
});

test('GET requests have their own, looser rate limit', async () => {
  for (let i = 0; i < GET_RATE_LIMIT; i++) assert.equal((await app.request('/api/usage', { headers: auth('g9:anonymous') })).status, 200);
  assert.equal((await app.request('/api/usage', { headers: auth('g9:anonymous') })).status, 429);
  assert.equal((await post('/api/events', { events: [] }, 'g9:anonymous')).status, 200);
});

test('a body that is not JSON is a 400 bad_json', async () => {
  const r = await app.request('/api/deep', { method: 'POST', headers: auth('u1:anonymous'), body: '{not json' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'bad_json');
});

test('media ranges, including the last N bytes', async () => {
  const file = '.local-media/video/range-test.mp4';
  await fs.mkdir('.local-media/video', { recursive: true });
  await fs.writeFile(file, Buffer.from(Array.from({ length: 100 }, (_, i) => i)));
  try {
    const get = (range: string) => app.request('/media/video/range-test.mp4', { headers: { Range: range } });
    const tail = await get('bytes=-10');
    assert.equal(tail.status, 206);
    assert.equal(tail.headers.get('Content-Range'), 'bytes 90-99/100');
    assert.deepEqual([...new Uint8Array(await tail.arrayBuffer())], [90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    assert.equal((await get('bytes=-500')).headers.get('Content-Range'), 'bytes 0-99/100');
    assert.equal((await get('bytes=10-19')).headers.get('Content-Range'), 'bytes 10-19/100');
    assert.equal((await get('bytes=95-')).headers.get('Content-Range'), 'bytes 95-99/100');
    assert.equal((await get('bytes=-0')).status, 416);
    assert.equal((await get('bytes=200-')).status, 416);
  } finally {
    await fs.rm(file, { force: true });
  }
});

test('search queries are only charged past the free monthly allowance', async () => {
  const { billableSearches } = await import('../src/store.ts');
  const { GROUNDING_FREE_PER_MONTH } = await import('../src/config.ts');
  assert.equal(await billableSearches(GROUNDING_FREE_PER_MONTH - 2), 0);
  assert.equal(await billableSearches(5), 3);
  assert.equal(await billableSearches(4), 4);
});

test('a stage not written yet is rewritten from another stage: no search, same topics, no App Check needed', async () => {
  await seedExplore('ペットボトル', 'std');
  (ai.models as any).generateContent = async (p: Call) => {
    calls.push(p);
    return { text: JSON.stringify({ oneLiner: 'かるい いれもの', summary: '石油《せきゆ》から 作《つく》った いれものだよ。', funFact: '1977年に 出《で》てきたよ', teasers: ['ふくらませて 作《つく》る'] }), usageMetadata: {} };
  };
  const r = await post('/api/explore', { label: 'ペットボトル', level: 'lower' }, 'n9:anonymous');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.summary, '石油《せきゆ》から 作《つく》った いれものだよ。');
  assert.equal(body.topics[0].title, TOPIC, 'topic titles stay the same so cards from any stage open them');
  assert.ok(!body.firstFind);
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(calls[0]).includes('googleSearch'), 'no Google Search for a rewrite');
  const again = await post('/api/explore', { label: 'ペットボトル', level: 'lower' }, 'n9:anonymous');
  assert.equal((await again.json()).cached, true);
  assert.equal(calls.length, 1, 'stored for everyone after the first rewrite');
});

test('a deep dive written for another stage is rewritten, not searched again', async () => {
  await seedExplore('ペットボトル', 'std');
  await setCached('cache_deep', keyOf('deep', 'ペットボトル', TOPIC), { text: DEEP, meta: { sources: [{ title: 's', uri: 'https://example.com' }], queries: [] } });
  (ai.models as any).generateContent = async (p: Call) => (calls.push(p), { text: 'ペットボトルは '.repeat(30), usageMetadata: {} });
  (ai.models as any).generateContentStream = async () => {
    throw new Error('no grounded generation expected');
  };
  const r = await post('/api/deep', { name: 'ペットボトル', topic: TOPIC, level: 'junior' }, 'n8:anonymous');
  const sse = await r.text();
  assert.match(sse, /event: done/);
  assert.match(sse, /example\.com/, 'sources come from the stage it was rewritten from');
  assert.equal(calls.length, 1);
});

// Server-sent events in the order they came: [event, data].
const events = (sse: string) =>
  sse
    .split('\n\n')
    .filter(Boolean)
    .map((b) => [/^event: (.*)$/m.exec(b)?.[1] ?? '', JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? 'null')] as [string, any]);

const QUICK = { name: 'ホチキスの針', reading: 'ほちきすのはり', en: 'staple', category: 'どうぐ', icon: 'construction', oneLiner: 'x', summary: '1900年にできた。', ok: true };
const REST = {
  summary: '1900年ごろに広まった。', funFact: 'f',
  topics: Array.from({ length: 7 }, (_, i) => ({ title: `問い${i}《とい》？`, teaser: 't', kind: 'しくみ', icon: 'science' })), keywords: ['k'],
};
const twoStep = (quick: object = QUICK, rest: object | (() => never) = REST) => {
  (ai.models as any).generateContent = async (p: Call & { config?: any }) => {
    calls.push(p);
    const grounded = !!p.config?.tools;
    if (grounded && typeof rest === 'function') rest();
    return { text: JSON.stringify(grounded ? rest : quick), usageMetadata: {} };
  };
};

test('explore stream: quick first, then done with the whole card, which is cached for everyone', async () => {
  await setCached('cache_media', keyOf('wiki', 'ホチキスの針'), { v: null });
  twoStep();
  const r = await post('/api/explore/stream', { label: 'ホッチキスのはり', level: 'lower' });
  assert.equal(r.status, 200);
  const ev = events(await r.text());
  assert.deepEqual(ev.map(([e]) => e), ['quick', 'done']);
  const [[, quick], [, done]] = ev;
  assert.equal(quick.id, keyOf('explore', 'ホチキスの針'));
  assert.equal(quick.summary, '1900年にできた。');
  assert.equal(quick.topics, undefined);
  assert.equal(done.id, quick.id);
  assert.equal(done.summary, '1900年ごろに広まった。', 'the summary checked with search replaces the quick one');
  assert.equal(done.topics.length, 6);
  assert.deepEqual([done.topics[0].id, done.topics[0].title], ['t0', '問い0？']);
  assert.equal(done.firstFind, true);
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(calls[0]).includes('googleSearch'), 'the quick step runs without search');
  assert.match(text(calls[1].contents), /1900年にできた。/);
  const saved = await getCached<any>('cache_explore', atLevel(quick.id, 'lower'));
  assert.equal(saved.summary, done.summary);
  assert.equal(saved.label, 'ホッチキスのはり');
  assert.deepEqual(await getCached('explore_alias', keyOf('alias', 'ホッチキスのはり')), { target: quick.id, name: 'ホッチキスのはり' });
  assert.deepEqual(inflightOf('u1'), { usd: 0, running: 0 });

  const again = events(await (await post('/api/explore/stream', { label: 'ホッチキスのはり', level: 'lower' })).text());
  assert.deepEqual(again.map(([e]) => e), ['done']);
  assert.equal(again[0][1].cached, true);
  assert.equal(calls.length, 2);
});

test('explore stream: a cached explanation is a single done, without generation', async () => {
  await seedExplore('ペットボトル');
  const ev = events(await (await post('/api/explore/stream', { label: 'ペットボトル' })).text());
  assert.deepEqual(ev.map(([e]) => e), ['done']);
  assert.equal(ev[0][1].id, keyOf('explore', 'ペットボトル'));
  assert.equal(ev[0][1].cached, true);
  assert.equal(calls.length, 0);
});

test('explore stream: a name that is already explained skips the search', async () => {
  await seedExplore('ホチキスの針');
  twoStep();
  const ev = events(await (await post('/api/explore/stream', { label: 'ステープル' })).text());
  assert.deepEqual(ev.map(([e]) => e), ['done']);
  assert.equal(ev[0][1].id, keyOf('explore', 'ホチキスの針'));
  assert.equal(calls.length, 1);
  assert.equal((await getCached<any>('explore_alias', keyOf('alias', 'ステープル')))?.target, keyOf('explore', 'ホチキスの針'));
});

test('explore stream: unfit names, unsafe photos and failures come as error events and leave nothing cached', async () => {
  twoStep({ ...QUICK, ok: false });
  let ev = events(await (await post('/api/explore/stream', { label: 'だれかの名前' })).text());
  assert.deepEqual(ev, [['error', { error: 'not_a_thing' }]]);
  assert.equal(calls.length, 1);

  vision.safeSearch = async (imgs) => imgs.map(() => false);
  twoStep();
  ev = events(await (await post('/api/explore/stream', { label: 'ボトル', image: 'AAAA' })).text());
  assert.deepEqual(ev, [['error', { error: 'unsafe_image' }]]);

  vision.safeSearch = async (imgs) => imgs.map(() => true);
  twoStep(QUICK, () => {
    throw new Error('search failed');
  });
  ev = events(await (await post('/api/explore/stream', { label: 'ホッチキスのはり' })).text());
  assert.deepEqual(ev.map(([e, d]) => [e, d.error]), [['quick', undefined], ['error', 'internal']]);
  assert.equal(await getCached('cache_explore', keyOf('explore', 'ホチキスの針')), null);
  assert.deepEqual(inflightOf('u1'), { usd: 0, running: 0 });

  await requester.run({ uid: 'l1', tier: 'guest', attested: true }, () => addSpent(1, 'test'));
  ev = events(await (await post('/api/explore/stream', { label: 'ホッチキスのはり' }, 'l1:anonymous')).text());
  assert.equal(ev[0][0], 'error');
  assert.equal(ev[0][1].error, 'user_limit');
  assert.equal(ev[0][1].tier, 'guest');
});
