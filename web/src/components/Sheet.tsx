import { animate, motion, useMotionValue, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDesktop } from '../lib/useDesktop';
import { useSwipeDismiss } from '../lib/useSwipeDismiss';

export function Sheet({ open, expanded, onExpandedChange, onDismiss, peek = 300, children }: {
  open: boolean; expanded: boolean; onExpandedChange: (v: boolean) => void; onDismiss: () => void; peek?: number; children: ReactNode;
}) {
  const desktop = useDesktop();
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const height = Math.round(vh * 0.92);
  const target = !open ? height + 40 : expanded ? 0 : height - Math.min(peek, height * 0.6);
  const y = useMotionValue(height + 40);
  const scroller = useRef<HTMLDivElement>(null);
  useSwipeDismiss({ y, areas: [scroller], base: () => target, onDismiss, enabled: open && !desktop });

  useEffect(() => {
    if (desktop) return;
    const c = animate(y, target, { type: 'spring', stiffness: 320, damping: 34 });
    return () => c.stop();
  }, [target, desktop, y]);

  if (desktop) {
    return (
      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : 520, opacity: open ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        className="fixed right-4 top-4 bottom-4 z-30 w-[min(480px,42vw)] overflow-hidden rounded-[32px] bg-paper shadow-[var(--shadow-float)]"
        aria-hidden={!open}
      >
        <div className="h-full overflow-y-auto overscroll-contain pt-6 no-scrollbar">{children}</div>
      </motion.aside>
    );
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.velocity.y < -300 || info.offset.y < -60) onExpandedChange(true);
    else if (info.velocity.y > 300 || info.offset.y > Math.min(150, vh * 0.2)) onDismiss();
    else animate(y, target, { type: 'spring', stiffness: 320, damping: 34 });
  };

  return (
    <motion.section
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[32px] bg-paper shadow-[0_-10px_40px_-10px_rgb(0_0_0/0.35)]"
      style={{ height, y, willChange: 'transform' }}
      aria-hidden={!open}
    >
      <motion.div
        className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0}
        onDrag={(_, info) => y.set(Math.max(0, target + info.offset.y))}
        onDragEnd={onDragEnd}
        onTap={() => onExpandedChange(!expanded)}
      >
        <span className="h-1.5 w-11 rounded-full bg-ink/20" />
      </motion.div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onScroll={(e) => !expanded && e.currentTarget.scrollTop > 8 && onExpandedChange(true)}
      >
        {children}
      </div>
    </motion.section>
  );
}
