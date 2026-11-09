import { appCheckToken, idToken } from './firebase';
import { currentLevel } from './level';
import { nudgeForLimit } from './account';
import { isNative } from './native';
import { isOffline } from './online';
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
  explore: (label: string, image?: string, from?: string, level = currentLevel()) => post<Explore>('/api/explore', { label, image, from, level }),
  known: (label: string) => call<{ known: boolean }>(`/api/known?${new URLSearchParams({ label })}`),
  quiz: (name: string, topic: string) => post<Quiz>('/api/quiz', { name, topic, level: currentLevel() }),
  illustrate: (name: string) => post<{ url: string }>('/api/illustrate', { name }),
  diagram: (b: { name: string; en: string; topic: string }) => post<{ url: string }>('/api/diagram', { ...b, level: currentLevel() }),
  tts: (text: string, ref?: TtsRef) => post<{ url: string }>('/api/tts', { text, ref: ref && { ...ref, level: currentLevel() } }),
  // Sign-up and password emails sent by the API with the app's look (falls back to Firebase's standard email on failure).
  mailVerify: () => post<{ ok: true }>('/api/mail/verify', {}),
  mailReset: (email: string) => post<{ ok: true }>('/api/mail/reset', { email }),
  units: (name: string) => post<{ units: UnitLink[] }>('/api/units', { name, level: currentLevel() }),
  // Fire-and-forget: counting must never get in the way of learning.
  events: (events: { name: LearnEvent; n?: number }[]) =>
    post<{ ok: true }>('/api/events', { events, level: currentLevel() }).catch(() => undefined),
  video: (b: { name: string; en: string; topic: string }) =>
    post<{ status: string; id?: string; url?: string }>('/api/video', { ...b, level: currentLevel() }),
  videoStatus: (id: string) => call<{ status: string; url?: string }>(`/api/video/${encodeURIComponent(id)}`),
  media: (name: string, en: string, topic: string) =>
    call<{ images: CommonsImage[]; videos: Video[]; query?: string }>(
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

// Messages carry 漢字《かんじ》 marks for the youngest readers; show them with <KidText> (toasts already do).
export function errorMessage(e: unknown) {
  if (e instanceof DOMException && e.name === 'AbortError') return '';
  if (!(e instanceof ApiError) && isOffline()) return OFFLINE_MESSAGE;
  if (e instanceof ApiError) {
    if (e.code === 'not_a_thing') return 'その名前《なまえ》では調《しら》べられませんでした。モノや生《い》き物《もの》の名前《なまえ》で、もう一度《いちど》ためしてね。';
    if (e.code === 'budget') return 'アプリ全体《ぜんたい》で使《つか》える学《まな》びパワーを使《つか》い切《き》りました。保存《ほぞん》したカードと、みんなが調《しら》べたモノは見《み》られます。';
    if (e.code === 'user_limit' && e.tier === 'guest') return 'ゲストで調《しら》べられる分《ぶん》を使《つか》い切《き》りました。登録《とうろく》すると、もっとたくさん調《しら》べられます。';
    if (e.code === 'user_limit') return 'このアカウントで調《しら》べられる分《ぶん》を使《つか》い切《き》りました。保存《ほぞん》したカードと、みんなが調《しら》べたモノは見《み》られます。';
    if (e.code === 'unsafe_image') return 'この写真《しゃしん》は調《しら》べられません。ちがう写真《しゃしん》でためしてね。';
    if (e.code === 'rate_limited') return 'ちょっと急《いそ》ぎすぎかも。少《すこ》し待《ま》ってから、もう一度《いちど》どうぞ。';
    if (e.code === 'busy') return 'いま混《こ》み合《あ》っています。少《すこ》しおいて、もう一度《いちど》ためしてね。';
    if (e.code === 'video_limit') return 'AI動画《どうが》は、作《つく》れる本数《ほんすう》の上限《じょうげん》に達《たっ》しました。';
    if (e.code === 'unknown_subject') return 'このモノの説明《せつめい》が見《み》つかりませんでした。もう一度《いちど》モノをえらんでね。';
    // Native guests have no App Check token, so only things somebody already explored can be read without an account.
    if (e.code === 'attest_required') {
      return isNative
        ? 'ゲストのままでは、まだだれも調《しら》べていないモノは調《しら》べられません。ログインすると調《しら》べられます。'
        : 'アプリを確認《かくにん》できませんでした。ページを再読《さいよ》み込《こ》みするか、ログインしてからためしてね。';
    }
    if (e.status === 401) return 'ログイン情報《じょうほう》を確認《かくにん》できませんでした。ページを再読《さいよ》み込《こ》みしてね。';
  }
  return 'うまく調《しら》べられませんでした。電波《でんぱ》を確《たし》かめて、もう一度《いちど》ためしてね。';
}

export const OFFLINE_MESSAGE = 'オフラインです。調《しら》べるには、インターネットにつながっている必要《ひつよう》があります。';

/** The API's error code ('offline' when the device has no connection), for screens that offer a different way out. */
export function errorCode(e: unknown): string | null {
  if (e instanceof ApiError) return e.code;
  return isOffline() ? 'offline' : null;
}
