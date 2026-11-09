import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepPrompt, explorePrompt, exploreQuickPrompt, exploreRestPrompt } from '../src/ai.ts';
import { LEVELS } from '../src/config.ts';
import { mergeExploreRest } from '../src/routes/explore.ts';

const draft = {
  name: 'しょうゆ', category: 'くらし', oneLiner: '世界一の飲みもの',
  summary: 'しょうゆは飲みものです。1000年前からあります。',
  reading: 'しょうゆ', en: 'soy sauce', icon: 'restaurant',
};
const corrected = {
  category: 'たべもの', oneLiner: '料理の味つけに使う調味料',
  summary: 'しょうゆは料理の味つけに使う調味料です。大豆などを原料に作ります。',
  funFact: 'しょうゆの香りは、発酵の働きで生まれます。',
};

test('rest prompt includes every draft field and balances corrections with preserving rich explanations', () => {
  const prompt = exploreRestPrompt(draft);
  const start = prompt.indexOf('{');
  const end = prompt.indexOf('\n}', start) + 2;
  assert.deepEqual(JSON.parse(prompt.slice(start, end)), {
    name: draft.name, category: draft.category, oneLiner: draft.oneLiner, summary: draft.summary,
  });
  assert.match(prompt, /初稿全体を確認/);
  assert.match(prompt, /資料と矛盾する内容は正しい内容に直す/);
  assert.match(prompt, /同じ文が見つからないという理由だけで内容を削らない/);
  assert.match(prompt, /未確認でも、妥当な一般知識は残し、言いすぎない表現/);
  assert.match(prompt, /削るのは資料で裏付けられない具体的な主張（数字・年号・固有名・記録）に限る/);
  assert.match(prompt, /裏付けのある説明や一般的な説明に置き換え/);
  assert.match(prompt, /初稿と同じくらいの情報量・長さを保つ/);
  assert.match(prompt, /category: 初稿の分類が明らかに誤っている場合だけ訂正/);
  assert.match(prompt, /訂正不要なら初稿をそのまま返す/);
});

for (const level of LEVELS) {
  test(`all explanation prompts prioritize definition, normal use and accuracy (${level})`, () => {
    const quick = exploreQuickPrompt('しょうゆ', level);
    const rest = exploreRestPrompt(draft, level);
    const whole = explorePrompt('しょうゆ', level);
    const deep = deepPrompt('しょうゆ', 'どうやって作る？', level);
    for (const prompt of [quick, rest, whole]) {
      assert.match(prompt, /説明の最初に、何の仲間で、ふだん何に使うものか/);
      assert.match(prompt, /しょうゆは料理の味つけに使う調味料で、飲料ではない/);
      assert.match(prompt, /用途のないものには、無理に用途を作らない/);
    }
    // The deep dives don't each open with the definition again.
    assert.doesNotMatch(deep, /説明の最初に、何の仲間で/);
    for (const prompt of [quick, rest, whole, deep]) {
      assert.match(prompt, /おどろきやおもしろさより正確さを優先/);
      assert.match(prompt, /数字・年号・固有名・記録は裏付けがある場合だけ/);
      assert.match(prompt, /「世界一」「必ず」などの強い断定も根拠なしに使わない/);
      assert.doesNotMatch(prompt, /意外な豆知識|数字や年号を入れる|結論をズバッ|数字・年号・具体例をできるだけ/);
    }
    for (const prompt of [rest, whole]) {
      assert.match(prompt, /裏付けられる別の豆知識を選び、必ず空でない文を返す/);
      assert.match(prompt, /問いと teaser の正確さを優先/);
    }
    const expectedLength = { std: 120, lower: 80, upper: 120, junior: 150, senior: 180 }[level];
    for (const prompt of [quick, whole]) assert.ok(prompt.includes(`${expectedLength}字前後`));
    if (level === 'lower') {
      for (const prompt of [quick, rest, whole, deep]) {
        assert.match(prompt, /毎回その直後に《》で読みがなを付ける/);
        assert.match(prompt, /name・reading・en・keywords・問いの title と、mermaid の図の中には《》を付けない/);
      }
    } else if (level === 'upper') {
      for (const prompt of [quick, rest, whole, deep]) {
        assert.match(prompt, /中学校以上で習う漢字はひらがなにするか、直後に《》で読みがなを付ける/);
        assert.match(prompt, /name・reading・en・keywords・問いの title と、mermaid の図の中には《》を付けない/);
      }
    }
  });
}

test('rest corrections win in the complete explore without changing draft identity or mutating inputs', () => {
  const quick = Object.freeze({ ...draft });
  const rest = Object.freeze({ ...corrected, name: '別の名前', reading: 'べつのなまえ', en: 'other', icon: 'star' });
  const result = mergeExploreRest(quick, rest);
  assert.deepEqual(result, { ...draft, ...corrected });
  assert.equal(result.name, draft.name);
  assert.equal(result.reading, draft.reading);
  assert.equal(result.en, draft.en);
  assert.equal(result.icon, draft.icon);
});

test('empty, omitted or null correction fields preserve the draft; invalid categories are ignored', () => {
  for (const empty of ['', ' \n\t ', undefined, null]) {
    const result = mergeExploreRest(draft, {
      oneLiner: empty, summary: empty, category: empty, funFact: corrected.funFact,
    });
    assert.deepEqual(result, { ...draft, funFact: corrected.funFact });
  }
  assert.equal(mergeExploreRest(draft, { ...corrected, category: '飲料' }).category, draft.category);
});

test('corrections keep ruby and clean whitespace; an empty funFact is kept empty instead of failing the card', () => {
  const oneLiner = '料理《りょうり》の味《あじ》つけに使《つか》う';
  assert.equal(mergeExploreRest(draft, { ...corrected, oneLiner: ` ${oneLiner}\n` }).oneLiner, oneLiner);
  assert.equal(mergeExploreRest(draft, { ...corrected, category: ' たべもの ' }).category, 'たべもの');
  for (const funFact of ['', ' \n\t ', undefined, null]) {
    assert.equal(mergeExploreRest(draft, { ...corrected, funFact }).funFact, '');
  }
});
