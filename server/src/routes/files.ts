import { Hono } from 'hono';
import { readMedia } from '../media.ts';
import { cleanWav } from '../wav.ts';

// Generated media from the private bucket, with Range support for audio and video.
export const files = new Hono();
const mediaCache = new Map<string, { data: Buffer; type: string }>();

files.get('/media/*', async (c) => {
  const name = c.req.path.slice('/media/'.length);
  if (!/^(illust|diagram|tts|video)\/[\w-]+\.(webp|wav|mp4)$/.test(name)) return c.notFound();
  let m = mediaCache.get(name);
  if (!m) {
    const got = await readMedia(name);
    if (!got) return c.notFound();
    // Speech saved before the WAV fix still has a whole WAV file inside it; serve just the samples.
    m = name.startsWith('tts/') ? { ...got, data: cleanWav(got.data) } : got;
    if (m.data.length < 2_000_000) mediaCache.set(name, m);
    if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value!);
  }
  const range = c.req.header('Range');
  const headers: Record<string, string> = { 'Content-Type': m.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' };
  const r = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (r && (r[1] || r[2])) {
    const size = m.data.length;
    // "bytes=-N" is the last N bytes (Safari asks for the end of a video this way).
    const start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
    const end = r[1] && r[2] ? Math.min(size - 1, Number(r[2])) : size - 1;
    if (start > end || (!r[1] && Number(r[2]) === 0)) return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
    return c.body(new Uint8Array(m.data.subarray(start, end + 1)), 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${m.data.length}` });
  }
  return c.body(new Uint8Array(m.data), 200, headers);
});
