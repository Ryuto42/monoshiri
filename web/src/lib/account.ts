import { linkWithCredential, signInWithCredential, type AuthCredential, type AuthError } from 'firebase/auth';
import { auth, currentUser } from './firebase';
import { syncCloud } from './cards';

// Entry point for the future login feature (Google / Apple, on web or via native sign-in plugins that hand back a credential).
// 1. Link the credential to the current anonymous user: the uid stays the same, so every saved card simply carries over.
// 2. If that account already exists (e.g. used on another phone), sign in to it and merge this device's cards into it.
export async function connectAccount(credential: AuthCredential) {
  const user = await currentUser();
  try {
    await linkWithCredential(user, credential);
  } catch (e) {
    const code = (e as AuthError).code;
    if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') throw e;
    await signInWithCredential(auth, credential);
  }
  await syncCloud();
}

export function isGuest() {
  return auth.currentUser?.isAnonymous ?? true;
}
