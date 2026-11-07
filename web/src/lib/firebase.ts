import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { getAuth, indexedDBLocalPersistence, initializeAuth, signInAnonymously, type User } from 'firebase/auth';

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

let ready: Promise<User> | null = null;

// Anonymous now; a later Google sign-in can link to this same uid so saved cards carry over.
export function currentUser(): Promise<User> {
  ready ??= (async () => {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
    return (await signInAnonymously(auth)).user;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function idToken() {
  return (await currentUser()).getIdToken();
}
