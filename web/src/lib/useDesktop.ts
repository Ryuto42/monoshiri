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
