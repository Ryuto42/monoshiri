import { animate, motion, useMotionValue, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDesktop } from '../lib/useDesktop';
import { useSwipeDismiss } from '../lib/useSwipeDismiss';

const HANDLE = 32;

// Pulling the sheet down only lowers it to the peek; it never closes it. What it shows (a photo and its result) is
// gone once closed, so closing is left to the explicit close button, which can ask first.
// With `fit`, the peek is as tall as the content (e.g. a short error), so its buttons always sit above the home indicator.
export function Sheet({ open, expanded, onExpandedChange, peek = 300, fit = false, children }: {
  open: boolean; expanded: boolean; onExpandedChange: (v: boolean) => void; peek?: number; fit?: boolean; children: ReactNode;
}) {
  const desktop = useDesktop();
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current, box = scroller.current;
    if (!fit || !el || !box) return setFitted(null);
    const measure = () => setFitted(HANDLE + el.offsetHeight + (parseFloat(getComputedStyle(box).paddingBottom) || 0));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const height = Math.round(vh * 0.92);
  const shown = fit && fitted ? Math.min(fitted, height) : Math.min(peek, height * 0.6);
  const target = !open ? height + 40 : expanded ? 0 : height - shown;
  const y = useMotionValue(height + 40);
  const settle = () => (expanded ? onExpandedChange(false) : void animate(y, target, { type: 'spring', stiffness: 420, damping: 38 }));
  useSwipeDismiss({ y, areas: [scroller], base: () => target, onDismiss: settle, enabled: open && !desktop });

  // While only the peek shows, the content may still fit the full sheet, so it never scrolls and the rest stays hidden
  // below the screen. Pulling the content up (or scrolling the wheel down) opens the sheet all the way instead.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !open || expanded || desktop) return;
    let startY: number | null = null;
    const start = (e: TouchEvent) => {
      startY = e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (startY != null && startY - e.touches[0].clientY > 12) {
        startY = null;
        onExpandedChange(true);
      }
    };
    const wheel = (e: WheelEvent) => {
      if (e.deltaY > 4) onExpandedChange(true);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('wheel', wheel);
    };
  }, [open, expanded, desktop, onExpandedChange]);

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
        inert={!open}
      >
        <div className="h-full overflow-y-auto overscroll-contain pt-6 no-scrollbar">{children}</div>
      </motion.aside>
    );
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.velocity.y < -300 || info.offset.y < -60) onExpandedChange(true);
    else if (expanded && (info.velocity.y > 300 || info.offset.y > Math.min(150, vh * 0.2))) onExpandedChange(false);
    else animate(y, target, { type: 'spring', stiffness: 320, damping: 34 });
  };

  return (
    <motion.section
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[32px] bg-paper shadow-[0_-10px_40px_-10px_rgb(0_0_0/0.35)]"
      style={{ height, y, willChange: 'transform' }}
      aria-hidden={!open}
      inert={!open}
    >
      <motion.button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? '結果を小さくする' : '結果を広げる'}
        className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0}
        onDrag={(_, info) => y.set(Math.max(0, target + info.offset.y))}
        onDragEnd={onDragEnd}
        onTap={() => onExpandedChange(!expanded)}
      >
        <span className="h-1.5 w-11 rounded-full bg-ink/20" />
      </motion.button>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onScroll={(e) => !expanded && e.currentTarget.scrollTop > 8 && onExpandedChange(true)}
      >
        <div ref={inner}>{children}</div>
      </div>
    </motion.section>
  );
}
