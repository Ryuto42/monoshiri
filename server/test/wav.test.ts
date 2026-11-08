import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanWav, pcmOf, wav } from '../src/wav.ts';

// What Gemini sends: a WAV file whose samples are followed by a C2PA chunk.
function geminiWav(pcm: Buffer, rate = 24000) {
  const c2pa = Buffer.concat([Buffer.from('C2PA', 'latin1'), Buffer.alloc(4), Buffer.from('jumbc2pa-manifest-bytes')]);
  c2pa.writeUInt32LE(c2pa.length - 8, 4);
  const plain = wav(pcm, rate);
  const out = Buffer.concat([plain, c2pa]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

const samples = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);

test('raw PCM passes through with the rate it came with', () => {
  assert.deepEqual(pcmOf(samples, 16000), { pcm: samples, rate: 16000 });
});

test('a WAV file from the model gives just its samples, without the C2PA chunk', () => {
  const { pcm, rate } = pcmOf(geminiWav(samples, 22050));
  assert.deepEqual(pcm, samples);
  assert.equal(rate, 22050);
});

test('speech saved before the fix (a WAV inside a WAV) is unwrapped to a plain WAV', () => {
  const old = wav(geminiWav(samples), 24000);
  const fixed = cleanWav(old);
  assert.equal(fixed.length, 44 + samples.length);
  assert.deepEqual(fixed.subarray(44), samples);
});

test('a plain WAV is served as it is', () => {
  const plain = wav(samples);
  assert.equal(cleanWav(plain), plain);
});
