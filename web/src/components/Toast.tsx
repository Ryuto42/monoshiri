import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './ui';
import { useToasts } from '../lib/toast';
import { KidText } from './RubyText';

export function Toaster() {
  const list = useToasts();
  return (
    // Below the screens' top bars (44px buttons under the safe area), so a notice never hides the way back or the account.
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),14px)+56px)] z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-[24px] bg-ink px-5 py-3 text-[14px] font-bold leading-snug text-paper shadow-[var(--shadow-float)]"
            role="status"
          >
            <Icon name={t.icon} size={20} fill className="shrink-0" />
            <span className="phrase-wrap">
              <KidText text={t.text} />
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
