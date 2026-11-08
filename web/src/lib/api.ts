import { appCheckToken, idToken } from './firebase';
import { currentLevel } from './level';
import { nudgeForLimit } from './account';
import type { CommonsImage, DeepMeta, DetectedObject, Explore, LearnEvent, Quiz, TtsRef, UnitLink, Video } from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export const mediaUrl = <T extends string | null | undefined>(u: T): T => (u?.startsWith('/media/') ? (`${BASE}${u}` as T) : u);

export class ApiError extends Error {
  code: string;
  status: number;
  tier?: string;
  constructor(status: number, code: string, tier?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.tier = tier;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const [id, ac] = await Promise.all([idToken(), appCheckToken()]);
  return { Authorization: `Bearer ${id}`, ...(ac && { 'X-Firebase-AppCheck': ac }) };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'user_limit' && body.tier === 'guest') nudgeForLimit();
    throw new ApiError(res.status, body.error ?? 'network', body.tier);
  }
  return res.json();
}

const post = <T>(path: string, body: object, signal?: AbortSignal) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body), signal });

export const api = {
  detect: (image: string) => post<{ objects: DetectedObject[] }>('/api/detect', { image, level: currentLevel() }),
  explore: (label: string, image?: string, from?: string) => post<Explore>('/api/explore', { label, image, from, level: currentLevel() }),
  known: (label: string) => call<{ known: boolean }>(`/api/known?${new URLSearchParams({ label })}`),
  quiz: (name: string, context: string) => post<Quiz>('/api/quiz', { name, context, level: currentLevel() }),
  illustrate: (name: string, en: string) => post<{ url: string }>('/api/illustrate', { name, en }),
  diagram: (b: { name: string; en: string; topic: string; outline: string }) => post<{ url: string }>('/api/diagram', { ...b, level: currentLevel() }),
  tts: (text: string, ref?: TtsRef) => post<{ url: string }>('/api/tts', { text, ref: ref && { ...ref, level: currentLevel() } }),
  units: (name: string) => post<{ units: UnitLink[] }>('/api/units', { name, level: currentLevel() }),
  // Fire-and-forget: counting must never get in the way of learning.
  events: (events: { name: LearnEvent; n?: number }[]) =>
    post<{ ok: true }>('/api/events', { events, level: currentLevel() }).catch(() => undefined),
  video: (b: { name: string; en: string; topic: string; outline: string }) =>
    post<{ status: string; id?: string; url?: string }>('/api/video', { ...b, level: currentLevel() }),
  videoStatus: (id: string) => call<{ status: string; url?: string }>(`/api/video/${encodeURIComponent(id)}`),
  media: (name: string, en: string, topic: string) =>
    call<{ images: CommonsImage[]; videos: Video[] }>(
      `/api/media?${new URLSearchParams({ name, en, topic, level: currentLevel() })}`,
    ),
  usage: () =>
    call<{ spentJpy: number; capJpy: number; videoLeft: number; tier: 'guest' | 'member' | 'admin'; mySpentJpy: number; myCapJpy: number }>('/api/usage'),

  async deep(name: string, topic: string, onDelta: (t: string) => void, signal?: AbortSignal): Promise<DeepMeta & { cached?: boolean }> {
    const res = await fetch(`${BASE}/api/deep`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ name, topic, level: currentLevel() }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      if (body.error === 'user_limit' && body.tier === 'guest') nudgeForLimit();
      throw new ApiError(res.status, body.error ?? 'network', body.tier);
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
    if (e.code === 'not_a_thing') return 'その名前では調べられませんでした。モノや生き物の名前で、もう一度ためしてください。';
    if (e.code === 'budget') return 'アプリ全体で使える学びパワーを使い切りました。保存したカードと、みんなが調べたモノは見られます。';
    if (e.code === 'user_limit' && e.tier === 'guest') return 'ゲストで調べられる分を使い切りました。登録すると、もっとたくさん調べられます。';
    if (e.code === 'user_limit') return 'このアカウントで調べられる分を使い切りました。保存したカードと、みんなが調べたモノは見られます。';
    if (e.code === 'unsafe_image') return 'この写真は調べられません。ちがう写真でためしてください。';
    if (e.code === 'rate_limited') return 'ちょっと急ぎすぎかも。少し待ってからもう一度どうぞ。';
    if (e.code === 'busy') return 'いま混み合っています。数十秒おいて、もう一度ためしてください。';
    if (e.code === 'video_limit') return 'AI動画は作れる本数の上限に達しました。';
    if (e.code === 'unknown_subject') return 'このモノの説明が見つかりませんでした。もう一度モノをえらんでください。';
    if (e.code === 'attest_required') return 'アプリを確認できませんでした。ページを再読み込みするか、ログインしてからためしてください。';
    if (e.status === 401) return 'ログイン情報を確認できませんでした。ページを再読み込みしてください。';
  }
  if (e instanceof DOMException && e.name === 'AbortError') return '';
  return 'うまく調べられませんでした。電波を確認して、もう一度ためしてください。';
}
