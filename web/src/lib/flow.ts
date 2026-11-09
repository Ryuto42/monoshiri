import { useSyncExternalStore } from 'react';
import type { DeepNote, DetectedObject, Explore } from './types';
import type { Shot } from './image';

export type Flow = {
  stage: 'camera' | 'detecting' | 'picked' | 'exploring' | 'explore' | 'error';
  shot: Shot | null;
  objects: DetectedObject[];
  selected: number | null;
  crop: string | null;
  explore: Explore | null;
  notes: Record<string, DeepNote>;
  error: string | null;
  /** The API's error code behind `error` ('offline' without a connection), so the error can offer the right way out. */
  errorCode: string | null;
  topicId: string | null;
  /** While exploring: false when nobody has explored this name yet, null until known. */
  known: boolean | null;
  /** The name being explored right now (a picked marker, a typed name, or a correction). */
  label: string | null;
};

const initial: Flow = { stage: 'camera', shot: null, objects: [], selected: null, crop: null, explore: null, notes: {}, error: null, errorCode: null, topicId: null, known: null, label: null };

let state: Flow = initial;
const listeners = new Set<() => void>();

export function setFlow(patch: Partial<Flow> | ((s: Flow) => Partial<Flow>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function resetFlow() {
  if (state.shot) URL.revokeObjectURL(state.shot.url);
  setFlow(initial);
}

export const getFlow = () => state;

export function useFlow() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
