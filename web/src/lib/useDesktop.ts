import { useSyncExternalStore } from 'react';

const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;

export function useDesktop() {
  return useSyncExternalStore(
    (l) => {
      mq?.addEventListener('change', l);
      return () => mq?.removeEventListener('change', l);
    },
    () => !!mq?.matches,
  );
}

/** The paste shortcut as people know it on this computer. */
export const PASTE_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘+V' : 'Ctrl+V';
