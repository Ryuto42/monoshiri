import assert from 'node:assert/strict';
import { test } from 'node:test';
import { namesThing, videoQuery } from '../src/media.ts';

test('the search is the name plus a word for the kind of topic, not the question', () => {
  assert.equal(videoQuery('ペットボトル', 'つくりかた'), 'ペットボトル できるまで');
  assert.equal(videoQuery('しょうゆ', 'まめちしき'), 'しょうゆ');
  assert.equal(videoQuery('えんぴつ'), 'えんぴつ');
});

test('only videos whose title names the thing are kept', () => {
  const names = ['ペットボトル', 'PET bottle'];
  assert.ok(namesThing('ペットボトルができるまで【工場見学】', names));
  assert.ok(namesThing('ぺっとぼとる リサイクル', names));
  assert.ok(namesThing('How a PET Bottle is made', names));
  assert.ok(!namesThing('点滴の針を刺したら血まみれに…予防方法解説 #shorts', names));
  assert.ok(!namesThing('バキッ…やってしまった', names));
});
