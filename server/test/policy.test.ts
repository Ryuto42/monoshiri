import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyMail } from '../src/mail/templates.ts';
import { notifyPolicy, type NoticeDeps, type Recipient } from '../src/mail/policy.ts';

const mail = policyMail({ date: '2026年11月20日', changes: ['名前の<使い方>を書き足しました'], reconsent: true });

test('policy mail: links to the policy, lists the changes escaped, and says consent is asked again', () => {
  assert.match(mail.subject, /プライバシーポリシーを変えました/);
  assert.match(mail.html, /href="https:\/\/[^"]+\/privacy"/);
  assert.match(mail.html, /名前の&lt;使い方&gt;を書き足しました/);
  assert.doesNotMatch(mail.html, /<使い方>/);
  assert.match(mail.text, /・名前の<使い方>を書き足しました/);
  assert.match(mail.text, /同意の画面がもう一度出ます/);
  assert.doesNotMatch(policyMail({ date: 'x', changes: ['y'], reconsent: false }).text, /同意の画面/);
});

function world(n: number, sentBefore: string[] = [], failOn: (to: string) => boolean = () => false) {
  const people: Recipient[] = Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, email: `p${i}@example.com` }));
  const records = new Set(sentBefore);
  const outbox: string[] = [];
  const deps: NoticeDeps = {
    listRecipients: async () => people,
    alreadySent: async (_id, uids) => new Set(uids.filter((u) => records.has(u))),
    markSent: async (_id, r) => void records.add(r.uid),
    send: async (to) => {
      if (failOn(to)) throw new Error('quota');
      outbox.push(to);
    },
    pause: async () => {},
  };
  return { deps, outbox, records };
}

test('without send it only counts', async () => {
  const w = world(5, ['u1']);
  const r = await notifyPolicy('2026-11-20', mail, w.deps, { send: false, limit: 400 });
  assert.deepEqual(r, { total: 5, sentBefore: 1, remaining: 4, sent: 0, failed: 0, stopped: false });
  assert.equal(w.outbox.length, 0);
});

test('sends at most limit, skips people already reached, and the next run picks up the rest', async () => {
  const w = world(5, ['u0']);
  const first = await notifyPolicy('2026-11-20', mail, w.deps, { send: true, limit: 3 });
  assert.equal(first.sent, 3);
  assert.equal(first.remaining, 1);
  assert.deepEqual(w.outbox, ['p1@example.com', 'p2@example.com', 'p3@example.com']);
  const second = await notifyPolicy('2026-11-20', mail, w.deps, { send: true, limit: 3 });
  assert.equal(second.sent, 1);
  assert.equal(second.remaining, 0);
  assert.deepEqual(w.outbox.slice(3), ['p4@example.com']);
});

test('stops after several failures in a row and does not record failed sends', async () => {
  const w = world(10, [], (to) => to !== 'p0@example.com');
  const r = await notifyPolicy('2026-11-20', mail, w.deps, { send: true, limit: 10, maxFailures: 3 });
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 3);
  assert.equal(r.stopped, true);
  assert.deepEqual([...w.records], ['u0']);
});

test('rejects an id that cannot be a document name', async () => {
  await assert.rejects(notifyPolicy('a/b', mail, world(1).deps, { send: false, limit: 1 }), /bad notice id/);
});
