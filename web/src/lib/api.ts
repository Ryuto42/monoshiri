import { idToken } from './firebase';
import type { CommonsImage, DeepMeta, DetectedObject, Explore, Quiz, Video } from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export const mediaUrl = <T extends string | null | undefined>(u: T): T => (u?.startsWith('/media/') ? (`${BASE}${u}` as T) : u);

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}`, ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'network');
  }
  return res.json();
}

const post = <T>(path: string, body: object, signal?: AbortSignal) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body), signal });

export const api = {
  detect: (image: string) => post<{ objects: DetectedObject[] }>('/api/detect', { image }),
  explore: (label: string, image?: string) => post<Explore>('/api/explore', { label, image }),
  quiz: (name: string, context: string) => post<Quiz>('/api/quiz', { name, context }),
  illustrate: (name: string, en: string) => post<{ url: string }>('/api/illustrate', { name, en }),
  diagram: (b: { name: string; en: string; topic: string; outline: string }) => post<{ url: string }>('/api/diagram', b),
  tts: (text: string) => post<{ url: string }>('/api/tts', { text }),
  video: (b: { name: string; en: string; topic: string; outline: string }) =>
    post<{ status: string; id?: string; url?: string }>('/api/video', b),
  videoStatus: (id: string) => call<{ status: string; url?: string }>(`/api/video/${encodeURIComponent(id)}`),
  media: (name: string, en: string, topic: string) =>
    call<{ images: CommonsImage[]; videos: Video[] }>(
      `/api/media?${new URLSearchParams({ name, en, topic })}`,
    ),
  usage: () => call<{ spentJpy: number; capJpy: number; videoLeft: number }>('/api/usage'),

  async deep(name: string, topic: string, onDelta: (t: string) => void, signal?: AbortSignal): Promise<DeepMeta & { cached?: boolean }> {
    const res = await fetch(`${BASE}/api/deep`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
      body: JSON.stringify({ name, topic }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? 'network');
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (!data) continue;
        if (event === 'delta') onDelta(JSON.parse(data));
        else if (event === 'done') return JSON.parse(data);
        else if (event === 'error') throw new ApiError(500, JSON.parse(data));
      }
    }
    throw new ApiError(500, 'stream_closed');
  },
};

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === 'budget') return '今月の学びパワーを使い切りました。保存したカードは見られます。';
    if (e.code === 'rate_limited') return 'ちょっと急ぎすぎかも。少し待ってからもう一度どうぞ。';
    if (e.code === 'busy') return 'いま混み合っています。数十秒おいて、もう一度ためしてください。';
    if (e.code === 'video_limit') return 'AI動画は作れる本数の上限に達しました。';
    if (e.status === 401) return 'ログイン情報を確認できませんでした。ページを再読み込みしてください。';
  }
  if (e instanceof DOMException && e.name === 'AbortError') return '';
  return 'うまく調べられませんでした。電波を確認して、もう一度ためしてください。';
}
