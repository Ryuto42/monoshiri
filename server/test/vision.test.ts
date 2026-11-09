import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagged } from '../src/vision.ts';

test('SafeSearch names what made a photo fail, and nothing for a fine one', () => {
  assert.equal(flagged({ adult: 'VERY_UNLIKELY', violence: 'UNLIKELY', racy: 'POSSIBLE', medical: 'LIKELY' }), '');
  assert.equal(flagged({ adult: 'POSSIBLE', racy: 'LIKELY' }), 'adult=POSSIBLE,racy=LIKELY');
  assert.equal(flagged({ medical: 'VERY_LIKELY' }), 'medical=VERY_LIKELY');
  assert.equal(flagged(undefined), 'no_annotation');
});
