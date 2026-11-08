import { onIdTokenChanged, type User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { auth, canSync, currentUser } from './firebase';
import { firestore } from './cards';
import { api } from './api';

export type Stage = 'lower' | 'upper' | 'junior' | 'senior';

export const STAGES: { id: Stage; label: string; short: string; ruby: string; hint: string }[] = [
  { id: 'lower', label: '小学校 低学年', short: '低学年', ruby: '低学年《ていがくねん》', hint: 'ひらがな多めで、みじかく' },
  { id: 'upper', label: '小学校 高学年', short: '高学年', ruby: '高学年《こうがくねん》', hint: '授業で習う言葉で' },
  { id: 'junior', label: '中学生', short: '中学生', ruby: '中学生《ちゅうがくせい》', hint: 'しくみや理由まで' },
  { id: 'senior', label: '高校生以上', short: '高校生〜', ruby: '高校生《こうこうせい》〜', hint: '原理まで詳しく' },
];

export const stageInfo = (s: Stage) => STAGES.find((x) => x.id === s)!;

// Only the stage leaves the age picker; the age itself is never stored or sent anywhere.
export const AGE_MIN = 3;
export const AGE_MAX = 120;
export function stageForAge(age: number): Stage {
  if (age <= 8) return 'lower';
  if (age <= 11) return 'upper';
  if (age <= 14) return 'junior';
  return 'senior';
}

type State = { uid: string | null; stage: Stage | null; loaded: boolean };
let state: State = { uid: null, stage: null, loaded: false };
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  // Lets CSS size the text for the youngest readers (styles.css).
  document.documentElement.dataset.stage = s.stage ?? 'std';
  listeners.forEach((l) => l());
};

const isStage = (v: unknown): v is Stage => STAGES.some((s) => s.id === v);

const localKey = (uid: string) => `monoshiri.stage.${uid}`;
// The answer from the first-run age screen, which can come before the guest account exists (or while offline).
// It shares the "monoshiri.stage." prefix, so logging out clears it with the rest.
const DEVICE_KEY = 'monoshiri.stage.device';
const read = (key: string): Stage | null => {
  try {
    const v = localStorage.getItem(key);
    return isStage(v) ? v : null;
  } catch {
    return null;
  }
};
const write = (key: string, stage: Stage) => {
  try {
    localStorage.setItem(key, stage);
  } catch {
    /* storage unavailable */
  }
};
const readLocal = (uid: string): Stage | null => read(localKey(uid)) ?? read(DEVICE_KEY);
const writeLocal = (uid: string, stage: Stage) => write(localKey(uid), stage);

async function writeRemote(uid: string, stage: Stage) {
  const { fs, doc, setDoc } = await firestore();
  await setDoc(doc(fs, 'users', uid), { stage, updatedAt: Date.now() });
}

// Guests keep the stage on this device only; synced accounts also keep it in users/{uid}.
async function load(user: User | null) {
  if (!user) return set({ uid: null, stage: null, loaded: true });
  const cached = readLocal(user.uid);
  if (user.isAnonymous || !canSync(user)) return set({ uid: user.uid, stage: cached, loaded: true });
  set({ uid: user.uid, stage: cached, loaded: !!cached });
  try {
    const { fs, doc, getDoc } = await firestore();
    const snap = await getDoc(doc(fs, 'users', user.uid));
    const remote = snap.get('stage') as unknown;
    if (auth.currentUser?.uid !== user.uid) return;
    if (isStage(remote)) {
      writeLocal(user.uid, remote);
      return set({ uid: user.uid, stage: remote, loaded: true });
    }
    set({ uid: user.uid, stage: cached, loaded: true });
    // A guest who picked a stage and then registered (same uid): carry it over to the account.
    if (cached) await writeRemote(user.uid, cached).catch(() => {});
  } catch {
    if (auth.currentUser?.uid === user.uid) set({ uid: user.uid, stage: cached, loaded: true });
  }
}

let lastUid: string | null | undefined;
onIdTokenChanged(auth, (u) => {
  // Token refreshes fire this too; reload only when the account (or its verified state) changes.
  const id = u ? `${u.uid}:${u.isAnonymous}:${canSync(u)}` : null;
  if (id === lastUid) return;
  lastUid = id;
  void load(u);
});

// Takes effect on this device right away (before the first await), even if signing in or the account copy fails.
export async function saveStage(stage: Stage) {
  write(DEVICE_KEY, stage);
  const now = auth.currentUser;
  if (now) writeLocal(now.uid, stage);
  set({ uid: now?.uid ?? null, stage, loaded: true });
  const user = await currentUser();
  if (user.uid !== now?.uid) {
    writeLocal(user.uid, stage);
    set({ uid: user.uid, stage, loaded: true });
  }
  void api.events([{ name: 'stage_set' }]);
  if (!user.isAnonymous && canSync(user)) await writeRemote(user.uid, stage);
}

// What the API should write for: the chosen stage (guests included), otherwise the original ('std') explanations.
export function currentLevel(): Stage | 'std' {
  const u = auth.currentUser;
  return u && state.uid === u.uid && state.stage ? state.stage : 'std';
}

export function useStage() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
