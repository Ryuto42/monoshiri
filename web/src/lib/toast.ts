import { useSyncExternalStore } from 'react';

type T = { id: number; text: string; icon: string };
let items: T[] = [];
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
let seq = 0;

export function toast(text: string, icon = 'info') {
  const id = ++seq;
  items = [...items, { id, text, icon }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 3800);
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => items,
  );
}
