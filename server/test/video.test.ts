import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kindQuery, namesThing, videoQuery } from '../src/media.ts';

test('the search is the name plus what the question asks, without the question words', () => {
  assert.equal(videoQuery('ティッシュ', 'トイレに流してはいけない理由は？', 'からだとけんこう'), 'ティッシュ トイレに流してはいけない');
  assert.equal(videoQuery('ペットボトル', 'なぜリサイクルする？', 'かんきょう'), 'ペットボトル リサイクルする');
  assert.equal(videoQuery('ティッシュ', 'ポケットティッシュはどこで生まれた？', 'れきし'), 'ティッシュ ポケットティッシュ 生まれた');
});

test('when too little of the question is left, the kind of topic is used instead', () => {
  assert.equal(videoQuery('ペットボトル', 'どうやってできる？', 'つくりかた'), 'ペットボトル できるまで');
  assert.equal(kindQuery('しょうゆ', 'まめちしき'), 'しょうゆ');
  assert.equal(kindQuery('えんぴつ'), 'えんぴつ');
});

test('only videos whose title names the thing are kept', () => {
  const names = ['ペットボトル', 'PET bottle'];
  assert.ok(namesThing('ペットボトルができるまで【工場見学】', names));
  assert.ok(namesThing('ぺっとぼとる リサイクル', names));
  assert.ok(namesThing('How a PET Bottle is made', names));
  assert.ok(!namesThing('点滴の針を刺したら血まみれに…予防方法解説 #shorts', names));
  assert.ok(!namesThing('バキッ…やってしまった', names));
});
