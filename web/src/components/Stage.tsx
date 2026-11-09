import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DetectedObject } from '../lib/types';
import { layoutLabels, type Size } from '../lib/labelLayout';

type Fit = { w: number; h: number; x: number; y: number };
type View = { k: number; tx: number; ty: number };

const MAX_ZOOM = 4;
const HOME: View = { k: 1, tx: 0, ty: 0 };
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Keep the zoomed photo covering the frame: no empty edge shows while panning.
function clampView(v: View, w: number, h: number): View {
  const k = clampNum(v.k, 1, MAX_ZOOM);
  return { k, tx: clampNum(v.tx, w - w * k, 0), ty: clampNum(v.ty, h - h * k, 0) };
}

// Pinch to zoom the photo around the fingers and drag to move it, like the Photos app. Without this, a pinch zoomed
// the whole page, and the iOS app (whose page doesn't scroll) could only grow it from the top-left corner.
// The dots and labels are placed on the zoomed photo but keep their size, so they stay readable.
function usePinchZoom(w: number, h: number, reset: unknown) {
  // A new photo starts unzoomed: the view is kept together with the photo it belongs to.
  const [held, setHeld] = useState<{ for: unknown; v: View }>({ for: reset, v: HOME });
  const view = held.for === reset ? held.v : HOME;
  const setView = (v: View) => setHeld({ for: reset, v });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ view: View; mid: { x: number; y: number }; dist: number; p0: { x: number; y: number } } | null>(null);
  const moved = useRef(false);

  const local = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const begin = (v: View) => {
    const ps = [...pts.current.values()];
    const mid = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    start.current = { view: v, mid, dist, p0: ps[0] };
  };

  function end(e: ReactPointerEvent<HTMLElement>) {
    pts.current.delete(e.pointerId);
    const snapped = view.k < 1.05 ? HOME : view;
    if (snapped !== view) setView(snapped);
    // One finger left after a pinch: carry on as a drag from where the photo is now.
    const rest = [...pts.current.values()];
    start.current = rest.length ? { view: snapped, mid: rest[0], dist: 0, p0: rest[0] } : null;
  }

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      pts.current.set(e.pointerId, local(e));
      if (pts.current.size === 1) moved.current = false;
      if (pts.current.size === 2) {
        moved.current = true;
        // Two fingers: the gesture is ours, so taps on the dots under them must not fire.
        for (const id of pts.current.keys()) e.currentTarget.setPointerCapture?.(id);
      }
      begin(view);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (!pts.current.has(e.pointerId) || !start.current) return;
      pts.current.set(e.pointerId, local(e));
      const s0 = start.current;
      const ps = [...pts.current.values()];
      if (ps.length >= 2) {
        const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
        const k = clampNum((s0.view.k * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)) / (s0.dist || 1), 1, MAX_ZOOM);
        // The photo point that was under the fingers stays under them.
        const px = (s0.mid.x - s0.view.tx) / s0.view.k, py = (s0.mid.y - s0.view.ty) / s0.view.k;
        setView(clampView({ k, tx: mid.x - px * k, ty: mid.y - py * k }, w, h));
      } else if (s0.view.k > 1) {
        const dx = ps[0].x - s0.p0.x, dy = ps[0].y - s0.p0.y;
        if (!moved.current && Math.hypot(dx, dy) < 6) return;
        if (!moved.current) e.currentTarget.setPointerCapture?.(e.pointerId);
        moved.current = true;
        setView(clampView({ k: s0.view.k, tx: s0.view.tx + dx, ty: s0.view.ty + dy }, w, h));
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
    // A drag or pinch that ends over a dot is not a tap on it.
    onClickCapture: (e: ReactMouseEvent) => {
      if (moved.current) {
        e.stopPropagation();
        e.preventDefault();
        moved.current = false;
      }
    },
  };
  return [view, handlers] as const;
}

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
  const [view, gesture] = usePinchZoom(fit.w, fit.h, src);
  const sel = selected != null ? objects[selected] : null;
  const rect = (b: DetectedObject['box']) => ({
    left: (b[1] / 1000) * fit.w * view.k + view.tx,
    top: (b[0] / 1000) * fit.h * view.k + view.ty,
    width: ((b[3] - b[1]) / 1000) * fit.w * view.k,
    height: ((b[2] - b[0]) / 1000) * fit.h * view.k,
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

  const centers = objects.map((o) => ({
    x: ((o.box[1] + o.box[3]) / 2000) * fit.w * view.k + view.tx,
    y: ((o.box[0] + o.box[2]) / 2000) * fit.h * view.k + view.ty,
  }));
  // Zoomed in, things outside the frame get no dot or label (a label pinned to the edge would point at nothing).
  const inside = centers.map((c) => c.x >= 0 && c.x <= fit.w && c.y >= 0 && c.y <= fit.h);
  const shownIdx = objects.map((_, i) => i).filter((i) => inside[i]);
  const placed = layoutLabels(
    shownIdx.map((i) => centers[i]),
    shownIdx.map((i) => (sizes[i]?.w ? sizes[i] : { w: objects[i].label.length * 12 + 20, h: 24 })),
    fit.w,
    fit.h,
  );
  const spots: Record<number, { x: number; y: number }> = {};
  shownIdx.forEach((i, j) => (spots[i] = placed[j]));

  return (
    <div ref={ref} className="absolute inset-x-0 top-0 transition-[bottom] duration-500" style={{ bottom: bottomInset }}>
      <motion.div
        className="absolute touch-none overflow-hidden rounded-[28px]"
        style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}
        {...gesture}
        initial={{ scale: 1.06, filter: 'brightness(1.8)' }}
        animate={{ scale: 1, filter: 'brightness(1)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <img
          src={src}
          alt="撮影した写真"
          className="h-full w-full origin-top-left object-cover select-none"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})` }}
          draggable={false}
        />

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
            if (!inside[i]) return null;
            const c = centers[i];
            const isSel = i === selected;
            return (
              <motion.button
                key={`${o.label}-${i}`}
                onClick={() => onSelect(i)}
                aria-label={`${o.label}をしらべる`}
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
                  className="absolute whitespace-nowrap rounded-full bg-black/55 px-2.5 text-[12px] font-bold leading-6 text-white backdrop-blur-md"
                  style={{ left: spots[i].x - (c.x - 28), top: spots[i].y - (c.y - 28) }}
                >
                  {o.label}
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
        initial={{ transform: 'translateY(-40%)' }}
        animate={{ transform: 'translateY(320%)' }}
        transition={{ duration: 1.6, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
      />
      {dots.map((d) => (
        <motion.span
          key={d.i}
          className="absolute rounded-full"
          style={{ left: d.x, top: d.y, width: d.s, height: d.s, background: colors[d.i % colors.length], boxShadow: '0 0 12px rgb(255 255 255 / 0.8)' }}
          animate={{
            transform: ['translateY(0px) scale(0)', 'translateY(-10px) scale(1)', 'translateY(4px) scale(0.6)', 'translateY(-6px) scale(1)', 'translateY(0px) scale(0)'],
            opacity: [0, 1, 0.7, 1, 0],
          }}
          transition={{ duration: 2.2, repeat: Infinity, delay: d.d, ease: 'easeInOut' }}
        />
      ))}
    </motion.div>
  );
}
