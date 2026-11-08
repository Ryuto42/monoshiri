// Speech comes back from Gemini either as raw 16-bit PCM or as a whole WAV file (with a C2PA content-credentials chunk
// after the samples). Wrapping a WAV file in another WAV header makes players read the inner header and the C2PA
// bytes as sound: a click at the start and a burst of static at the end of every chunk.

export function wav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const isWav = (b: Buffer) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE';

/** The samples and sample rate inside a WAV file, unwrapping a WAV that was itself stored as the samples. */
export function pcmOf(b: Buffer, fallbackRate = 24000): { pcm: Buffer; rate: number } {
  if (!isWav(b)) return { pcm: b, rate: fallbackRate };
  let rate = fallbackRate, pcm: Buffer | null = null;
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString('latin1', at, at + 4), size = b.readUInt32LE(at + 4), body = at + 8;
    if (id === 'fmt ' && size >= 8) rate = b.readUInt32LE(body + 4);
    if (id === 'data') {
      pcm = b.subarray(body, Math.min(b.length, body + size));
      break;
    }
    at = body + size + (size % 2);
  }
  if (!pcm) return { pcm: Buffer.alloc(0), rate };
  return isWav(pcm) ? pcmOf(pcm, rate) : { pcm, rate };
}

/** A plain WAV of just the samples; returns the input untouched when it already is one. */
export function cleanWav(b: Buffer): Buffer {
  if (!isWav(b)) return b;
  const { pcm, rate } = pcmOf(b);
  return pcm.length + 44 === b.length ? b : wav(pcm, rate);
}
