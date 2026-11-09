import {
  EmailAuthProvider,
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  GoogleAuthProvider,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type AuthCredential,
  type AuthError,
  type User,
} from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { auth, currentUser, refreshMe } from './firebase';
import { clearLocalCards, deleteCloudCards, syncCloud } from './cards';
import { isNative, platform } from './native';
import { api } from './api';
import { forgetConsent } from './welcome';

// The WebViews can't open Firebase's popup, so the native apps get an ID token from the OS sign-in sheet
// (@capgo/capacitor-social-login) and hand it to the JS SDK as a credential. Each needs its OAuth client ID.
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '';
export const googleAvailable = !isNative || (platform === 'ios' ? !!IOS_CLIENT_ID : !!WEB_CLIENT_ID);

const verifyLink = () => (isNative ? undefined : { url: `${location.origin}/account` });

// The API sends the app-styled email whose link opens /auth/action. If it can't (SMTP not set up, a native guest without
// App Check, sending limits), Firebase's standard email still goes out.
async function sendVerify(user: User) {
  try {
    await user.getIdToken(true);
    await api.mailVerify();
  } catch {
    await sendEmailVerification(user, verifyLink());
  }
}

export class AccountError extends Error {}

const code = (e: unknown) => (e as AuthError)?.code ?? '';

// Messages never say whether an address is registered, so the form can't be used to look up other people's accounts.
export function accountMessage(e: unknown): string | null {
  if (e instanceof AccountError) return e.message;
  switch (code(e)) {
    case 'auth/popup-closed-by-user':
    case 'auth/native-cancelled':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'メールアドレスかパスワードがちがいます';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return '登録できませんでした。登録ずみの場合はログインしてください';
    case 'auth/account-exists-with-different-credential':
      return 'このメールアドレスは別の方法で登録されています。メールアドレスとパスワードでログインしてください';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'パスワードは10文字以上で、英字と数字を両方まぜてください';
    case 'auth/too-many-requests':
      return '試した回数が多すぎます。しばらく時間をおいてからお試しください';
    case 'auth/network-request-failed':
      return '通信できませんでした。電波のよいところでお試しください';
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。ブラウザの設定で許可してください';
    case 'auth/requires-recent-login':
    case 'auth/user-mismatch':
      return 'もう一度ログインしなおしてから操作してください';
    case 'auth/operation-not-allowed':
      return 'このログイン方法はいま使えません';
    case 'auth/expired-action-code':
      return 'このリンクは有効期限が切れています。アプリからもう一度メールを送ってください';
    case 'auth/invalid-action-code':
      return 'このリンクはもう使えません。すでに使ったか、新しいメールが届いているかもしれません';
    case 'auth/user-disabled':
    case 'auth/user-token-expired':
      return 'このアカウントはいま使えません';
    default:
      return 'うまくいきませんでした。もう一度お試しください';
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailProblem(email: string) {
  if (!email) return 'メールアドレスを入力してください';
  if (email.length > 254 || !EMAIL.test(email)) return 'メールアドレスの形が正しくありません';
  return null;
}

const COMMON = ['password', 'qwerty', 'monoshiri', 'abc123', '123456', '111111', 'iloveyou', 'letmein'];

export function passwordProblem(pw: string, email = '') {
  if (pw.length < 10) return '10文字以上にしてください';
  if (pw.length > 128) return '128文字以内にしてください';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '英字と数字を両方まぜてください';
  const lower = pw.toLowerCase();
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'メールアドレスと似ていないものにしてください';
  if (COMMON.some((w) => lower.includes(w)) || /^(.)\1+$/.test(pw)) return 'もっと推測されにくいものにしてください';
  return null;
}

async function afterLogin() {
  refreshMe();
  await syncCloud();
}

// Sign-up links the email to the current guest account, so the uid (and every card already collected) stays the same.
export async function signUpEmail(email: string, password: string) {
  const user = await currentUser();
  const cred = EmailAuthProvider.credential(email.trim(), password);
  if (user.isAnonymous) await linkWithCredential(user, cred);
  else throw new AccountError('すでにログインしています');
  await sendVerify(user).catch(() => {});
  await afterLogin();
}

// Logging in to an existing account switches the uid; this device's cards are merged into that account by the sync.
export async function signInEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
  await afterLogin();
}

let socialReady: Promise<typeof import('@capgo/capacitor-social-login').SocialLogin> | null = null;

function social() {
  socialReady ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    await SocialLogin.initialize({
      google: { webClientId: WEB_CLIENT_ID || undefined, iOSClientId: IOS_CLIENT_ID || undefined, mode: 'online' },
    });
    return SocialLogin;
  });
  socialReady.catch(() => (socialReady = null));
  return socialReady;
}

const CANCELLED = /cancel/i;

// The ID token from the OS sheet becomes a Firebase credential, so linking works the same way as on the web.
async function nativeCredential(): Promise<AuthCredential> {
  const sl = await social();
  try {
    const { result } = await sl.login({ provider: 'google', options: { forcePrompt: true } });
    if (result.responseType !== 'online' || !result.idToken) throw new AccountError('Google から情報を受け取れませんでした');
    return GoogleAuthProvider.credential(result.idToken);
  } catch (e) {
    if (e instanceof AccountError) throw e;
    if (CANCELLED.test(String((e as Error)?.message ?? e))) throw Object.assign(new Error('cancelled'), { code: 'auth/native-cancelled' });
    throw e;
  }
}

const inUse = (e: unknown) => code(e) === 'auth/credential-already-in-use' || code(e) === 'auth/email-already-in-use';

// Guests link Google so the uid (and the zukan) stays; if that Google account is already registered, switch to it instead.
export async function signInGoogle() {
  const user = await currentUser();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = isNative ? await nativeCredential() : null;
  if (!user.isAnonymous) {
    await (cred ? signInWithCredential(auth, cred) : signInWithPopup(auth, provider));
  } else {
    try {
      await (cred ? linkWithCredential(user, cred) : linkWithPopup(user, provider));
    } catch (e) {
      if (!inUse(e)) throw e;
      const again = GoogleAuthProvider.credentialFromError(e as AuthError) ?? cred;
      if (!again) throw e;
      await signInWithCredential(auth, again);
    }
  }
  await afterLogin();
}

// Always reports success: whether a reset mail was really sent must not reveal if the address is registered.
export async function resetPassword(email: string) {
  try {
    await api.mailReset(email.trim()).catch(() => sendPasswordResetEmail(auth, email.trim(), verifyLink()));
  } catch (e) {
    if (['auth/too-many-requests', 'auth/network-request-failed'].includes(code(e))) throw e;
  }
}

export async function resendVerification() {
  const user = auth.currentUser;
  if (user && !user.emailVerified) await sendVerify(user);
}

// The ID token only carries email_verified after a reload + forced refresh, and Firestore rules read the token.
export async function checkVerified() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return false;
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  await afterLogin();
  return true;
}

// Links in Firebase's emails (verify, reset password, undo an email change) open /auth/action in this app.
export type EmailAction = 'verifyEmail' | 'resetPassword' | 'recoverEmail' | 'verifyAndChangeEmail';

/** Confirms an address (or undoes an email change). Returns the address the link was for. */
export async function applyEmailLink(oobCode: string): Promise<string | null> {
  const info = await checkActionCode(auth, oobCode);
  await applyActionCode(auth, oobCode);
  const email = info.data.email ?? null;
  // When the link is opened where that account is signed in, the token now says "verified" and the zukan starts syncing.
  const user = auth.currentUser;
  if (user && !user.isAnonymous && email && user.email?.toLowerCase() === email.toLowerCase()) await checkVerified().catch(() => false);
  return email;
}

/** Checks a reset link before showing the form; returns the account's address. */
export const resetLinkEmail = (oobCode: string) => verifyPasswordResetCode(auth, oobCode);

export async function setNewPassword(oobCode: string, password: string) {
  await confirmPasswordReset(auth, oobCode, password);
}

async function startOver() {
  await clearLocalCards();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('monoshiri.sync.') || k.startsWith('monoshiri.nudge.') || k.startsWith('monoshiri.stage.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  forgetConsent();
  await currentUser().catch(() => {});
  refreshMe();
}

// Logging out also removes this device's copy of the zukan; it comes back from the cloud on the next login.
// Callers check cardsAtRisk() first (it syncs), so cards that never reached the cloud aren't lost without a warning.
export async function logOut() {
  await signOut(auth);
  await startOver();
}

async function reauth(user: User, password?: string) {
  if (user.providerData.some((p) => p.providerId === 'google.com')) {
    if (!isNative) await reauthenticateWithPopup(user, new GoogleAuthProvider());
    else if (googleAvailable) await reauthenticateWithCredential(user, await nativeCredential());
    else throw new AccountError('Google のアカウントは Web 版から削除してください');
  } else {
    if (!password) throw new AccountError('パスワードを入力してください');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password));
  }
}

// Requires a fresh sign-in first, then removes the cloud cards and the account itself.
export async function deleteAccount(password?: string) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  await reauth(user, password);
  await deleteCloudCards();
  await deleteUser(user);
  await startOver();
}

// --- Gentle prompt to create an account once the zukan has something worth keeping ---

type Nudge = 'first' | 'more' | 'limit' | null;
let nudge: Nudge = null;
const nudgeListeners = new Set<() => void>();
const MILESTONES: [number, Exclude<Nudge, null>][] = [
  [1, 'first'],
  [5, 'more'],
];

export function maybeNudge(count: number) {
  if (!auth.currentUser?.isAnonymous) return;
  const hit = MILESTONES.find(([n]) => n === count);
  if (!hit) return;
  const key = `monoshiri.nudge.${hit[1]}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    /* without storage the prompt may simply show again later */
  }
  setTimeout(() => {
    if (!auth.currentUser?.isAnonymous) return;
    nudge = hit[1];
    nudgeListeners.forEach((l) => l());
  }, 1400);
}

// A guest used up the guest allowance: offer the bigger allowance that comes with an account (at most once a session).
let limitShown = false;
export function nudgeForLimit() {
  if (!auth.currentUser?.isAnonymous || limitShown) return;
  limitShown = true;
  nudge = 'limit';
  nudgeListeners.forEach((l) => l());
}

export function dismissNudge() {
  nudge = null;
  nudgeListeners.forEach((l) => l());
}

export function useNudge() {
  return useSyncExternalStore(
    (l) => {
      nudgeListeners.add(l);
      return () => nudgeListeners.delete(l);
    },
    () => nudge,
  );
}
