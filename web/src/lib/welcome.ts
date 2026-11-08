import { useSyncExternalStore } from 'react';

// First-run welcome. "pending" holds the camera back until we know whether this person is new,
// so the camera permission prompt never appears on top of (or before) the welcome.
// "tour" walks through the camera screen's buttons; the camera (and its permission prompt) waits until it ends.
type State = 'pending' | 'open' | 'tour' | 'closed';

const KEY = 'monoshiri.welcome';

function seen() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* without storage the welcome may simply show again next time */
  }
}

let state: State = seen() ? 'closed' : 'pending';
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Called once the zukan has loaded: people who already have cards skip the welcome. */
export function settleWelcome(hasCards: boolean) {
  if (state !== 'pending') return;
  remember();
  set(hasCards ? 'closed' : 'open');
}

export function showWelcome() {
  remember();
  set('open');
}

export function closeWelcome() {
  set('closed');
}

export function startTour() {
  set('tour');
}

/** True while the welcome or its tour is showing (read outside React, e.g. in native tap handlers). */
export const welcomeShowing = () => state === 'open' || state === 'tour';

export type TourTarget = 'gallery' | 'zukan' | 'shutter' | 'account' | 'help';

// After skipping the tour, a small bubble under "?" points out where it can be opened again.
let helpHint = false;
export function setHelpHint(v: boolean) {
  helpHint = v;
  listeners.forEach((l) => l());
}
// Skipping misses the step that points at "?", so point at it once on the way out.
export function skipTutorial() {
  closeWelcome();
  setHelpHint(true);
}

export function useHelpHint() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => helpHint,
  );
}

export function useWelcome() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// The welcome sits above Home, so a sample photo chosen there is handed to Home through this.
type SampleHandler = (src: string) => Promise<void>;
let sampleHandler: SampleHandler | null = null;

export function onSampleRequest(h: SampleHandler) {
  sampleHandler = h;
  return () => {
    if (sampleHandler === h) sampleHandler = null;
  };
}

// Close only once the photo is on screen: closing first would wake the camera (and its permission prompt) for a moment.
export async function trySample(src: string) {
  try {
    await sampleHandler?.(src);
  } finally {
    closeWelcome();
  }
}
