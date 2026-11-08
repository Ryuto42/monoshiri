import { initializeApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, onIdTokenChanged, signInAnonymously, type User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';

export const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
});

// In the native shells getAuth() waits on a popup/redirect iframe that never loads from capacitor://, so set persistence explicitly.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence })
  : getAuth(firebaseApp);
auth.languageCode = 'ja';

// App Check (reCAPTCHA Enterprise) proves API calls come from this web app, since anonymous accounts are free to create.
// The native shells can't run reCAPTCHA on capacitor:// and send no token; signed-in accounts don't need one.
const RECAPTCHA_KEY = import.meta.env.VITE_RECAPTCHA_KEY as string | undefined;
let appCheck: AppCheck | null = null;
if (!Capacitor.isNativePlatform() && RECAPTCHA_KEY) {
  if (import.meta.env.DEV) (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  appCheck = initializeAppCheck(firebaseApp, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true });
}

export async function appCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    return (await getToken(appCheck, false)).token;
  } catch {
    return null;
  }
}

// Local development against the Firebase emulators (npm run emulators): no real accounts or cloud data are touched.
export const onEmulators = import.meta.env.DEV && import.meta.env.VITE_FB_EMULATORS === '1';
if (onEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

let anon: Promise<User> | null = null;

// Always resolves to whoever is signed in right now (the account can switch on login/logout); guests get an anonymous user.
export async function currentUser(): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  anon ??= signInAnonymously(auth)
    .then((r) => r.user)
    .finally(() => {
      anon = null;
    });
  return anon;
}

export async function idToken() {
  return (await currentUser()).getIdToken();
}

export type Me = { uid: string; guest: boolean; email: string | null; name: string | null; photo: string | null; verified: boolean; provider: 'password' | 'google' | 'anonymous' };

let me: Me | null = null;
const listeners = new Set<() => void>();

function snapshot(u: User | null): Me | null {
  if (!u) return null;
  const ids = u.providerData.map((p) => p.providerId);
  return {
    uid: u.uid,
    guest: u.isAnonymous,
    email: u.email,
    name: u.displayName,
    photo: u.photoURL,
    verified: u.emailVerified,
    provider: ids.includes('google.com') ? 'google' : ids.includes('password') ? 'password' : 'anonymous',
  };
}

// Token changes cover sign-in, linking and email verification (after reload + token refresh), so the UI never shows a stale state.
onIdTokenChanged(auth, (u) => {
  me = snapshot(u);
  listeners.forEach((l) => l());
});

export function refreshMe() {
  me = snapshot(auth.currentUser);
  listeners.forEach((l) => l());
}

export function useMe() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => me,
  );
}

// Mirrors firestore.rules: an email/password account can't touch cloud cards until its address is confirmed.
export const canSync = (u: User) => u.isAnonymous || u.emailVerified || u.providerData.some((p) => p.providerId === 'google.com');
