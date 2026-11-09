import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { closeWelcome, setHelpHint, showWelcome, skipTutorial, trySample, useHelpHint, type TourTarget } from '../lib/welcome';
import { PASTE_KEY, useDesktop } from '../lib/useDesktop';
import { STEPS, TOUR_PAGES } from '../lib/tour';
import { haptic, onBack } from '../lib/native';
import { Button } from './ui';
import { KidText } from './RubyText';
import { spring } from './theme';

// The lit area: the button's box plus a margin, drawn as a pill (a circle for round buttons).
type Spot = { x: number; y: number; w: number; h: number };
const PAD = 6;
// The welcome card's photo, so the try-out matches what the tutorial showed.
const SAMPLE = '/samples/desk.webp';

export function Tour() {
  // Everyone sees the same steps, signed in or not.
  const steps = STEPS;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const spot = useSpot(steps[step].target);
  const still = useReducedMotion();
  const desktop = useDesktop();
  const primary = useRef<HTMLButtonElement>(null);
  const last = step === steps.length - 1;

  const next = () => {
    haptic('select');
    if (last) return closeWelcome();
    setDir(1);
    setStep((s) => s + 1);
  };
  const back = () => {
    haptic('select');
    if (step === 0) return showWelcome();
    setDir(-1);
    setStep((s) => s - 1);
  };
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => onBack(skipTutorial, { history: false }), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && skipTutorial();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const move = still ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 30 };
  const s = steps[step];
  const below = spot ? spot.y < window.innerHeight / 2 : false;
  const width = Math.min(340, window.innerWidth - 32);
  const left = spot ? Math.min(Math.max(spot.x - width / 2, 16), window.innerWidth - width - 16) : (window.innerWidth - width) / 2;
  const tail = spot ? Math.min(Math.max(spot.x - left, 28), width - 28) : null;
  const place = !spot
    ? { top: '50%', transform: 'translateY(-50%)' }
    : below
      ? { top: spot.y + spot.h / 2 + 18 }
      : { bottom: window.innerHeight - (spot.y - spot.h / 2) + 18 };

  return (
    <motion.div
      className="fixed inset-0 z-[55]"
      role="dialog"
      aria-modal
      aria-labelledby="tour-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {spot ? (
        // The dark layer is the hole's own shadow, so the lit button shows through untouched, with a soft glow at the edge.
        // Tapping the lit button itself also moves on.
        <motion.button
          aria-label={last ? 'はじめる' : 'つぎへ'}
          tabIndex={-1}
          onClick={next}
          className="absolute shadow-[0_0_28px_4px_rgb(255_244_232/0.22),0_0_0_200vmax_rgb(18_14_11/0.6)]"
          initial={false}
          animate={{ left: spot.x - spot.w / 2, top: spot.y - spot.h / 2, width: spot.w, height: spot.h, borderRadius: Math.min(spot.w, spot.h) / 2 }}
          transition={move}
        >
          {!still && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-[inherit] border-2 border-white/60"
              animate={{ scale: [1, 1.18], opacity: [0.7, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
        </motion.button>
      ) : (
        <div className="absolute inset-0 bg-[rgb(18_14_11/0.6)]" />
      )}

      <motion.section
        key={below ? 'below' : 'above'}
        className="absolute rounded-3xl bg-paper p-4 text-ink shadow-[var(--shadow-float)]"
        style={{ left, width, ...place }}
        initial={still ? false : { opacity: 0, y: below ? -10 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        {tail != null && (
          <span
            aria-hidden
            className={`absolute h-4 w-4 rotate-45 bg-paper ${below ? '-top-2' : '-bottom-2'}`}
            style={{ left: tail - 8 }}
          />
        )}
        <div className="relative">
          <div className="flex h-6 items-center justify-between">
            <ol aria-label={`${TOUR_PAGES}つ中 ${step + 2}つめ`} className="flex gap-1.5">
              {Array.from({ length: TOUR_PAGES }, (_, i) => (
                <li key={i} className={`h-1.5 rounded-full transition-all ${i === step + 1 ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20'}`} />
              ))}
            </ol>
            {!last && (
              // Small to look at, but the tap area stays 44pt.
              <button
                onClick={skipTutorial}
                className="-mr-2 flex h-11 items-center rounded-full px-2 text-[13px] font-bold text-ink-3 hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-accent"
              >
                スキップ
              </button>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              aria-live="polite"
              initial={still ? false : { opacity: 0, x: 12 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={still ? undefined : { opacity: 0, x: -12 * dir }}
              transition={{ duration: 0.18 }}
            >
              <h2 id="tour-title" className="phrase-wrap mt-2 text-[20px] font-black leading-snug">
                <KidText text={s.title} />
              </h2>
              <p className="phrase-wrap mt-2 text-[14px] leading-relaxed text-ink-2">
                <KidText text={s.body} />
              </p>
              {/* Only a PC can drop or paste an image, so only a PC is told. */}
              {s.target === 'gallery' && desktop && (
                <p className="phrase-wrap mt-1.5 text-[13px] leading-relaxed text-ink-3">
                  <KidText text={`パソコンでは、画像《がぞう》をドロップしたり、${PASTE_KEY}で貼《は》り付《つ》けたりもできます。`} />
                </p>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex items-center justify-between gap-2">
            {/* On the first lit step this goes back to the welcome card, the tutorial's first page. */}
            <Button tone="subtle" icon="arrow_back" onClick={back} className="-ml-3 pl-3 pr-4">
              もどる
            </Button>
            <Button ref={primary} icon={last ? 'photo_camera' : undefined} iconFill onClick={next} className="outline-offset-4">
              {last ? 'はじめる' : 'つぎへ'}
            </Button>
          </div>
          {/* Trying the app without anything to photograph (a PC's webcam, a judge with nothing at hand): the same flow on
              the welcome card's photo. It is offered only here (and again from "?"), not on the camera screen. */}
          {last && (
            <button
              type="button"
              onClick={() => {
                haptic('select');
                void trySample(SAMPLE);
              }}
              className="mx-auto mt-1 flex min-h-11 items-center px-3 text-[14px] font-bold text-ink-2 underline decoration-ink/20 underline-offset-4"
            >
              <KidText text="見本《みほん》の写真《しゃしん》でためす" />
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

// A bubble growing out of the "?" button; it leaves by itself, or when tapped.
export function HelpHint() {
  const on = useHelpHint();
  const still = useReducedMotion();
  const [at, setAt] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!on) return;
    const el = [...document.querySelectorAll<HTMLElement>('[data-tour="help"]')].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return setHelpHint(false);
    // Measured on the next frame: the "?" button is laid out by then, and state isn't set synchronously in the effect.
    const raf = requestAnimationFrame(() => setAt(el.getBoundingClientRect()));
    const t = setTimeout(() => setHelpHint(false), 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [on]);
  // The bubble sizes itself to its text and hangs from the right edge, under "?" (which sits near the top-right corner).
  const right = 12;
  const tail = at ? window.innerWidth - right - (at.left + at.width / 2) : 0;
  return (
    <AnimatePresence>
      {on && at && (
        <motion.button
          key="help-hint"
          onClick={() => setHelpHint(false)}
          className="fixed z-[55] w-max max-w-[calc(100vw-24px)] rounded-2xl bg-accent px-4 py-2.5 text-center text-[14px] font-black leading-snug text-accent-ink shadow-[var(--shadow-float)]"
          style={{ top: at.bottom + 12, right, transformOrigin: `calc(100% - ${tail}px) -8px` }}
          initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: still ? 1 : 0.8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
          <span aria-hidden className="absolute -top-1.5 h-3.5 w-3.5 rotate-45 bg-accent" style={{ right: tail - 7 }} />
          <span className="phrase-wrap relative">
            <KidText text="使《つか》い方《かた》は、ここからいつでも見《み》られます" />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// Follows the lit button: the web controls slide in when the tour starts, and the window may be resized or rotated.
function useSpot(target: TourTarget) {
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = measure(target);
      setSpot((prev) =>
        prev && next && (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(prev[k] - next[k]) < 0.5) ? prev : next,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return spot;
}

function measure(target: TourTarget): Spot | null {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find((e) => e.getBoundingClientRect().width > 0);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width + PAD * 2, h: b.height + PAD * 2 };
}
