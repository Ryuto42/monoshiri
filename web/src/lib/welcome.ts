import { useSyncExternalStore } from 'react';

// First run. "onboard" asks for the age and the consent to the privacy policy, before anything else.
// "pending" holds the camera back until we know whether this person is new,
// so the camera permission prompt never appears on top of (or before) the welcome.
// "tour" walks through the camera screen's buttons; the camera (and its permission prompt) waits until it ends.
// "signin" is someone with an account logging in from the first screen instead of answering the age.
type State = 'onboard' | 'signin' | 'pending' | 'open' | 'tour' | 'closed';

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

const CONSENT_KEY = 'monoshiri.consent';
// Bump when the privacy policy changes in a way everyone has to agree to again.
const CONSENT_VERSION = 1;

function consented() {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null') as { v?: unknown } | null;
    return v?.v === CONSENT_VERSION;
  } catch {
    return false;
  }
}

function rememberConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, at: Date.now() }));
  } catch {
    /* without storage the age and consent screens simply show again next time */
  }
}

/** True when the welcome card may still come up on this device (so its photo is worth loading early). */
export const welcomeAhead = () => !seen();

// People who saw the welcome before consent was asked for still get the age and consent screens, and only those.
let state: State = consented() ? (seen() ? 'closed' : 'pending') : 'onboard';
let hasCards: boolean | null = null;
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

function afterConsent() {
  if (seen()) return set('closed');
  if (hasCards === null) return set('pending');
  remember();
  set(hasCards ? 'closed' : 'open');
}

/** Called once the zukan has loaded: people who already have cards skip the welcome. */
export function settleWelcome(cards: boolean) {
  hasCards = cards;
  if (state === 'pending') afterConsent();
}

// Logging out or deleting the account hands the device to whoever uses it next: they are asked their age and consent again.
export function forgetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* without storage nothing was kept */
  }
  set('onboard');
}

export function finishOnboarding() {
  rememberConsent();
  afterConsent();
}

/** From the age screen: someone who already has an account logs in instead (the account sheet opens over the camera). */
export function startSignIn() {
  set('signin');
}

/**
 * The login from the first screen is over. Signed in with a stage kept in the account: they agreed to the policy when
 * they registered, so the age, consent and welcome are all skipped. Otherwise (closed, or no stage saved) back to the age.
 */
export function endSignIn(signedIn: boolean, hasStage: boolean) {
  if (state !== 'signin') return;
  if (!signedIn || !hasStage) return set('onboard');
  rememberConsent();
  remember();
  set('closed');
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

/** True while the first-run screens, the welcome or its tour are showing (read outside React, e.g. in native tap handlers). */
export const welcomeShowing = () => state === 'onboard' || state === 'signin' || state === 'open' || state === 'tour';

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
