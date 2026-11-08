import { animate, type MotionValue } from 'motion/react';
import { useEffect, useRef, type RefObject } from 'react';

// Pull-down-to-close for sheets and panels. A downward drag that starts while the content is scrolled to the top
// moves the surface with the finger; releasing past the threshold (or with a flick) closes it all the way.
// With `x`, the sideways offset is tracked too, so the surface can follow the finger freely.
export function useSwipeDismiss({ y, x, areas, base = () => 0, onStart, onDismiss, enabled = true }: {
  y: MotionValue<number>;
  x?: MotionValue<number>;
  areas: RefObject<HTMLElement | null>[];
  base?: () => number;
  onStart?: () => void;
  onDismiss: () => void;
  enabled?: boolean;
}) {
  const cb = useRef({ base, onStart, onDismiss });
  useEffect(() => {
    cb.current = { base, onStart, onDismiss };
  });

  useEffect(() => {
    if (!enabled) return;
    const els = areas.map((a) => a.current).filter((e): e is HTMLElement => !!e);
    const offs = els.map((el) => {
      let active = false, dragging = false, startX = 0, startY = 0, lastY = 0, lastT = 0, v = 0;
      const start = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        active = true;
        dragging = false;
        startY = lastY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        lastT = e.timeStamp;
        v = 0;
      };
      const move = (e: TouchEvent) => {
        if (!active) return;
        const cy = e.touches[0].clientY;
        if (!dragging) {
          const dy = cy - startY;
          if (Math.abs(dy) < 2) return;
          if (dy < 0 || el.scrollTop > 0) {
            active = false;
            return;
          }
          dragging = true;
          startY = cy;
          startX = e.touches[0].clientX;
          y.stop();
          x?.stop();
          cb.current.onStart?.();
        }
        if (e.cancelable) e.preventDefault();
        const dt = e.timeStamp - lastT;
        if (dt > 0) v = v * 0.4 + ((cy - lastY) / dt) * 0.6;
        lastY = cy;
        lastT = e.timeStamp;
        y.set(cb.current.base() + Math.max(0, cy - startY));
        x?.set(e.touches[0].clientX - startX);
      };
      const end = () => {
        if (!active) return;
        active = false;
        if (!dragging) return;
        const d = y.get() - cb.current.base();
        if (d > Math.min(150, window.innerHeight * 0.2) || (v > 0.5 && d > 24)) cb.current.onDismiss();
        else {
          animate(y, cb.current.base(), { type: 'spring', stiffness: 420, damping: 38 });
          if (x) animate(x, 0, { type: 'spring', stiffness: 420, damping: 38 });
        }
      };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchmove', move, { passive: false });
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
      return () => {
        el.removeEventListener('touchstart', start);
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', end);
        el.removeEventListener('touchcancel', end);
      };
    });
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, y, x]);
}

// Slides a surface off the bottom edge, then runs the close action, so a swipe never stops halfway.
export async function slideOut(y: MotionValue<number>, then: () => void) {
  await animate(y, window.innerHeight, { type: 'spring', stiffness: 380, damping: 40, restDelta: 20 });
  then();
}
