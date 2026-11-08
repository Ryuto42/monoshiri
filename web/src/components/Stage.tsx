import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DetectedObject } from '../lib/types';
import { duplicateNumbers, layoutLabels, type Size } from '../lib/labelLayout';

type Fit = { w: number; h: number; x: number; y: number };

function useFit(ratio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ w: 0, h: 0, x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth, H = el.clientHeight;
      const w = Math.min(W, H * ratio), h = w / ratio;
      setFit({ w, h, x: (W - w) / 2, y: (H - h) / 2 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return [ref, fit] as const;
}

export function Stage({ src, ratio, objects, selected, scanning, onSelect, bottomInset }: {
  src: string; ratio: number; objects: DetectedObject[]; selected: number | null; scanning: boolean;
  onSelect: (i: number) => void; bottomInset: number;
}) {
  const [ref, fit] = useFit(ratio);
  const sel = selected != null ? objects[selected] : null;
  const rect = (b: DetectedObject['box']) => ({
    left: (b[1] / 1000) * fit.w, top: (b[0] / 1000) * fit.h, width: ((b[3] - b[1]) / 1000) * fit.w, height: ((b[2] - b[0]) / 1000) * fit.h,
  });

  // Measure each label, then place them so they neither overlap nor get clipped at the photo edge.
  const labelEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  useLayoutEffect(() => {
    if (scanning) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const next = objects.map((_, i) => ({ w: labelEls.current[i]?.offsetWidth ?? 0, h: labelEls.current[i]?.offsetHeight ?? 0 }));
      setSizes((prev) => (prev.length === next.length && prev.every((p, i) => p.w === next[i].w && p.h === next[i].h) ? prev : next));
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      alive = false;
    };
  }, [objects, scanning]);

  const centers = objects.map((o) => ({ x: ((o.box[1] + o.box[3]) / 2000) * fit.w, y: ((o.box[0] + o.box[2]) / 2000) * fit.h }));
  const nums = duplicateNumbers(
    objects.map((o) => o.label),
    centers.map((c) => c.x),
  );
  const spots = layoutLabels(
    centers,
    objects.map((o, i) => (sizes[i]?.w ? sizes[i] : { w: o.label.length * 12 + (nums[i] ? 30 : 20), h: 24 })),
    fit.w,
    fit.h,
  );

  return (
    <div ref={ref} className="absolute inset-x-0 top-0 transition-[bottom] duration-500" style={{ bottom: bottomInset }}>
      <motion.div
        className="absolute overflow-hidden rounded-[28px]"
        style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}
        initial={{ scale: 1.06, filter: 'brightness(1.8)' }}
        animate={{ scale: 1, filter: 'brightness(1)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <img src={src} alt="撮影した写真" className="h-full w-full object-cover select-none" draggable={false} />

        <AnimatePresence>{scanning && <ScanOverlay key="scan" w={fit.w} h={fit.h} />}</AnimatePresence>

        <AnimatePresence>
          {sel && (
            <motion.div
              key="dim"
              className="pointer-events-none absolute rounded-[22px]"
              style={{ boxShadow: '0 0 0 9999px rgb(10 6 3 / 0.55)' }}
              initial={{ opacity: 0, ...rect(sel.box) }}
              animate={{ opacity: 1, ...rect(sel.box) }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            />
          )}
        </AnimatePresence>

        {sel && <FocusBrackets r={rect(sel.box)} />}

        {!scanning &&
          objects.map((o, i) => {
            const c = centers[i];
            const isSel = i === selected;
            const name = nums[i] ? `${o.label} ${nums[i]}` : o.label;
            return (
              <motion.button
                key={`${o.label}-${i}`}
                onClick={() => onSelect(i)}
                aria-label={`${name}をしらべる`}
                className="absolute grid place-items-center"
                style={{ left: c.x - 28, top: c.y - 28, width: 56, height: 56 }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: isSel ? 0 : 1, opacity: isSel ? 0 : 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22, delay: selected == null ? 0.08 * i : 0 }}
                whileTap={{ scale: 0.85 }}
              >
                <span className="absolute h-9 w-9 rounded-full bg-white/30 animate-ping" style={{ animationDuration: '1.8s', animationDelay: `${i * 0.2}s` }} />
                <span className="relative h-[18px] w-[18px] rounded-full border-[3px] border-white bg-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)]" />
                <span
                  ref={(el) => {
                    labelEls.current[i] = el;
                  }}
                  className="absolute flex items-center gap-1 whitespace-nowrap rounded-full bg-black/55 px-2.5 text-[12px] font-bold leading-6 text-white backdrop-blur-md"
                  style={{ left: spots[i].x - (c.x - 28), top: spots[i].y - (c.y - 28) }}
                >
                  {o.label}
                  {nums[i] != null && (
                    <span aria-hidden className="grid h-4 min-w-4 place-items-center rounded-full bg-white/90 px-1 text-[10px] leading-none text-black/80 tabular-nums">
                      {nums[i]}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
      </motion.div>
    </div>
  );
}

function FocusBrackets({ r }: { r: { left: number; top: number; width: number; height: number } }) {
  const c = 'absolute h-7 w-7 border-white';
  return (
    <motion.div
      className="pointer-events-none absolute"
      initial={{ opacity: 0, scale: 1.25 }}
      animate={{ opacity: 1, scale: 1, left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      <span className={`${c} left-0 top-0 border-l-[4px] border-t-[4px] rounded-tl-[22px]`} />
      <span className={`${c} right-0 top-0 border-r-[4px] border-t-[4px] rounded-tr-[22px]`} />
      <span className={`${c} left-0 bottom-0 border-l-[4px] border-b-[4px] rounded-bl-[22px]`} />
      <span className={`${c} right-0 bottom-0 border-r-[4px] border-b-[4px] rounded-br-[22px]`} />
    </motion.div>
  );
}

const rnd = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function ScanOverlay({ w, h }: { w: number; h: number }) {
  const dots = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({ x: rnd(i, 1) * w, y: rnd(i, 2) * h, d: rnd(i, 3) * 1.6, s: 6 + rnd(i, 4) * 8, i })),
    [w, h],
  );
  const colors = ['#ffffff', '#ffd3b8', '#ffe7a3', '#cde8d2'];
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <div className="absolute inset-0 bg-black/20" />
      <motion.div
        className="absolute inset-x-0 h-1/3"
        style={{ background: 'linear-gradient(180deg, transparent, rgb(255 230 200 / 0.28) 55%, rgb(255 255 255 / 0.55) 60%, transparent 62%)' }}
        initial={{ y: '-40%' }}
        animate={{ y: '320%' }}
        transition={{ duration: 1.6, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
      />
      {dots.map((d) => (
        <motion.span
          key={d.i}
          className="absolute rounded-full"
          style={{ left: d.x, top: d.y, width: d.s, height: d.s, background: colors[d.i % colors.length], boxShadow: '0 0 12px rgb(255 255 255 / 0.8)' }}
          animate={{ scale: [0, 1, 0.6, 1, 0], opacity: [0, 1, 0.7, 1, 0], y: [0, -10, 4, -6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: d.d, ease: 'easeInOut' }}
        />
      ))}
    </motion.div>
  );
}
