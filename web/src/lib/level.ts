import { onIdTokenChanged, type User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { auth, canSync } from './firebase';
import { firestore } from './cards';

export type Stage = 'lower' | 'upper' | 'junior' | 'senior';

export const STAGES: { id: Stage; label: string; short: string; hint: string }[] = [
  { id: 'lower', label: '小学校 低学年', short: '低学年', hint: 'ひらがな多めで、みじかく' },
  { id: 'upper', label: '小学校 高学年', short: '高学年', hint: '授業で習う言葉で' },
  { id: 'junior', label: '中学生', short: '中学生', hint: 'しくみや理由まで' },
  { id: 'senior', label: '高校生以上', short: '高校生〜', hint: '原理まで詳しく' },
];

// Only the stage leaves this function; the age itself is never stored or sent anywhere.
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
  listeners.forEach((l) => l());
};

const localKey = (uid: string) => `monoshiri.stage.${uid}`;
const readLocal = (uid: string): Stage | null => {
  try {
    const v = localStorage.getItem(localKey(uid));
    return STAGES.some((s) => s.id === v) ? (v as Stage) : null;
  } catch {
    return null;
  }
};
const writeLocal = (uid: string, stage: Stage) => {
  try {
    localStorage.setItem(localKey(uid), stage);
  } catch {
    /* storage unavailable */
  }
};

async function load(user: User | null) {
  if (!user || user.isAnonymous) return set({ uid: user?.uid ?? null, stage: null, loaded: true });
  const cached = readLocal(user.uid);
  set({ uid: user.uid, stage: cached, loaded: !!cached });
  if (!canSync(user)) return set({ uid: user.uid, stage: cached, loaded: true });
  try {
    const { fs, doc, getDoc } = await firestore();
    const snap = await getDoc(doc(fs, 'users', user.uid));
    const remote = snap.get('stage') as Stage | undefined;
    if (auth.currentUser?.uid !== user.uid) return;
    const stage = STAGES.some((s) => s.id === remote) ? remote! : cached;
    if (stage) writeLocal(user.uid, stage);
    set({ uid: user.uid, stage: stage ?? null, loaded: true });
  } catch {
    set({ uid: user.uid, stage: cached, loaded: true });
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

export async function saveStage(stage: Stage) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  writeLocal(user.uid, stage);
  set({ uid: user.uid, stage, loaded: true });
  const { fs, doc, setDoc } = await firestore();
  await setDoc(doc(fs, 'users', user.uid), { stage, updatedAt: Date.now() });
}

// What the API should write for: the chosen stage for signed-in accounts, otherwise the original ('std') explanations.
export function currentLevel(): Stage | 'std' {
  const u = auth.currentUser;
  return u && !u.isAnonymous && state.uid === u.uid && state.stage ? state.stage : 'std';
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
