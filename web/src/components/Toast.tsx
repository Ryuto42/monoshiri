import { AnimatePresence, motion } from 'motion/react';
import { useSyncExternalStore } from 'react';
import { Icon } from './ui';

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

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => items,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),16px)] z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[14px] font-bold text-paper shadow-[var(--shadow-float)]"
            role="status"
          >
            <Icon name={t.icon} size={20} fill />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
