import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BUCKET, LOCAL, YT_KEY } from './config.ts';
import { getCached, setCached } from './store.ts';

const UA = 'Monoshiri/1.0 (educational hackathon app; https://monoshiri-df26.web.app)';

export const keyOf = (...parts: string[]) =>
  createHash('sha1').update(parts.map((p) => p.normalize('NFKC').trim().toLowerCase()).join('|')).digest('hex').slice(0, 24);

const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export type CommonsImage = { thumb: string; full: string; page: string; title: string; artist: string; license: string; width: number; height: number };

export async function commonsImages(query: string, limit = 8): Promise<CommonsImage[]> {
  const key = keyOf('commons', query);
  const hit = await getCached<{ items: CommonsImage[] }>('cache_media', key);
  if (hit) return hit.items;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: String(limit * 2),
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '640', origin: '*',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const data: any = await res.json();
  const pages = Object.values<any>(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const items = pages
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl) return null;
      const m = ii.extmetadata ?? {};
      return {
        thumb: ii.thumburl, full: ii.url, page: ii.descriptionurl, title: stripHtml(p.title?.replace(/^File:/, '').replace(/\.\w+$/, '')),
        artist: stripHtml(m.Artist?.value).slice(0, 80) || '不明', license: stripHtml(m.LicenseShortName?.value) || '不明',
        width: ii.thumbwidth ?? 640, height: ii.thumbheight ?? 480,
      } satisfies CommonsImage;
    })
    .filter((x): x is CommonsImage => !!x && /\.(jpe?g|png|webp)/i.test(x.full))
    .slice(0, limit);
  await setCached('cache_media', key, { items });
  return items;
}

export async function wikiSummary(title: string) {
  const key = keyOf('wiki', title);
  const hit = await getCached<{ v: any }>('cache_media', key);
  if (hit) return hit.v;
  const res = await fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, {
    headers: { 'User-Agent': UA },
  });
  let v = null;
  if (res.ok) {
    const d: any = await res.json();
    if (d.type !== 'disambiguation' && d.extract)
      v = { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page, thumb: d.thumbnail?.source ?? null };
  }
  await setCached('cache_media', key, { v });
  return v;
}

export type Video = { id: string; title: string; channel: string; thumb: string };

export async function youtubeVideos(query: string, limit = 4): Promise<Video[]> {
  if (!YT_KEY) return [];
  const key = keyOf('yt', query);
  const hit = await getCached<{ items: Video[] }>('cache_media', key);
  if (hit) return hit.items;
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  Object.entries({
    part: 'snippet', q: query, type: 'video', maxResults: String(limit), relevanceLanguage: 'ja', regionCode: 'JP',
    safeSearch: 'strict', videoEmbeddable: 'true', key: YT_KEY,
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: any = await res.json();
  const items: Video[] = (data.items ?? []).map((it: any) => ({
    id: it.id.videoId, title: stripHtml(it.snippet.title), channel: it.snippet.channelTitle,
    thumb: it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url,
  }));
  await setCached('cache_media', key, { items });
  return items;
}

const storage = LOCAL ? null : new Storage();
const LOCAL_DIR = path.resolve('.local-media');

// Generated media stays in a private bucket and is served through /media/* on this API.
export async function saveMedia(name: string, data: Buffer, contentType: string): Promise<string> {
  if (!storage) {
    await fs.mkdir(path.dirname(path.join(LOCAL_DIR, name)), { recursive: true });
    await fs.writeFile(path.join(LOCAL_DIR, name), data);
  } else {
    await storage.bucket(BUCKET).file(name).save(data, { contentType, resumable: false });
  }
  return `/media/${name}`;
}

export async function readMedia(name: string): Promise<{ data: Buffer; type: string } | null> {
  const type = name.endsWith('.webp') ? 'image/webp' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
  try {
    if (!storage) return { data: await fs.readFile(path.join(LOCAL_DIR, name)), type };
    const [data] = await storage.bucket(BUCKET).file(name).download();
    return { data, type };
  } catch {
    return null;
  }
}

export async function toWebp(png: Buffer, width: number) {
  return sharp(png).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}

