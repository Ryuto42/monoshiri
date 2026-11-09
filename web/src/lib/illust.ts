import { useSyncExternalStore } from 'react';
import { api, errorMessage } from './api';
import { getCard, saveCard } from './cards';
import { toast } from './toast';

// Illustration jobs live outside the card maker so a card can be saved before its art is ready.
// When a job finishes for a card that is already in the zukan, the card is patched and a "ready" notice is queued.
export type Ready = { id: string; name: string; url: string };

const jobs = new Map<string, Promise<string | null>>();
const done = new Map<string, string>();
const notify = new Set<string>();
let pending: ReadonlySet<string> = new Set();
let queue: Ready[] = [];
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
const sub = (l: () => void) => {
  ls.add(l);
  return () => ls.delete(l);
};

function setPending(id: string, on: boolean) {
  const next = new Set(pending);
  if (on) next.add(id);
  else next.delete(id);
  pending = next;
  emit();
}

export function startIllust(id: string, name: string, { quiet = false } = {}) {
  const running = jobs.get(id);
  if (running) return running;
  setPending(id, true);
  const job = api
    .illustrate(name)
    .then(({ url }) => {
      done.set(id, url);
      const card = getCard(id);
      if (card && !card.illustration) {
        void saveCard({ ...card, illustration: url, updatedAt: Date.now() }).catch(() => toast('イラストをしまえませんでした。もう一度《いちど》ためしてね'));
        if (notify.has(id)) queue = [...queue, { id, name: card.name, url }];
      }
      return url;
    })
    .catch((e) => {
      const m = errorMessage(e, 'illustration');
      if (m && !quiet) toast(m);
      return null;
    })
    .finally(() => {
      jobs.delete(id);
      notify.delete(id);
      setPending(id, false);
    });
  jobs.set(id, job);
  return job;
}

// Called when the card is put away before its art is ready, so the zukan button announces it later.
export function notifyWhenReady(id: string) {
  if (jobs.has(id)) notify.add(id);
}

export const illustFor = (id: string) => done.get(id) ?? null;

// Cards saved in an earlier session whose art never arrived (app closed mid-generation) get it now, one at a time.
export async function resumeIllust(list: { id: string; name: string; en: string; illustration: string | null }[]) {
  for (const c of list.filter((x) => !x.illustration)) {
    const job = startIllust(c.id, c.name, { quiet: true });
    notifyWhenReady(c.id);
    await job;
  }
}

export function usePendingIllust() {
  return useSyncExternalStore(sub, () => pending);
}

export function useIllustReady() {
  return useSyncExternalStore(sub, () => queue)[0] ?? null;
}

export function dismissReady(id: string) {
  queue = queue.filter((r) => r.id !== id);
  emit();
}

export function clearReady() {
  if (!queue.length) return;
  queue = [];
  emit();
}
