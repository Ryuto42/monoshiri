import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Icon } from './ui';
import { BrandMark } from './BrandMark';

// The API gives no real progress, so progress eases toward 95% on an expected-duration curve (≈85% at `expected` seconds).
// A dashed empty card fills from the bottom up and becomes a real card as it nears completion.
export function LoadingCard({ expected = 12, icon, img, bg = '#F9D9C4', ink = '#8A3B12', steps, className = '', children }: {
  expected?: number; icon?: string; img?: string | null; bg?: string; ink?: string; steps: string[]; className?: string; children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const p = useMotionValue(0);
  const [step, setStep] = useState(0);
  const tau = expected / 2.25;

  useAnimationFrame((t) => {
    const v = 0.95 * (1 - Math.exp(-t / 1000 / tau));
    p.set(v);
    const s = Math.min(steps.length - 1, Math.floor((v / 0.95) * steps.length));
    if (s !== step) setStep(s);
  });

  const fill = useTransform(p, (v) => `${(1 - v) * 100}%`);
  const pct = useTransform(p, (v) => `${Math.round(v * 100)}%`);
  const clip = useTransform(p, (v) => `inset(${(1 - v) * 100}% 0 0 0)`);
  const solid = useTransform(p, [0.6, 0.95], [0, 1]);

  return (
    <div className={`flex items-center ${children ? 'gap-5' : 'flex-col'} ${className}`} role="status" aria-live="polite">
      <div className="relative h-[168px] w-[126px] shrink-0">
        <div className="absolute inset-0 rounded-[20px] border-[3px] border-dashed border-ink/25" />
        <motion.div className="absolute inset-0 overflow-hidden rounded-[20px]" style={{ clipPath: clip }}>
          <div className="absolute inset-0 grid place-items-center" style={{ background: bg, color: ink }}>
            {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : icon ? <Icon name={icon} size={52} fill /> : <BrandMark size={52} />}
          </div>
          <motion.div className="absolute inset-0 rounded-[20px] border-[3px] border-white" style={{ opacity: solid }} />
        </motion.div>
        <motion.div className="pointer-events-none absolute inset-x-0 h-3 overflow-hidden" style={{ top: fill, translateY: '-50%' }} aria-hidden>
          <motion.svg
            viewBox="0 0 240 12"
            className="h-3 w-[240px]"
            style={{ color: bg }}
            animate={reduced ? undefined : { x: [0, -120] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          >
            <path d="M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 T150 6 T180 6 T210 6 T240 6 V12 H0 Z" fill="currentColor" />
          </motion.svg>
        </motion.div>
        <motion.div className="absolute inset-0 rounded-[20px] shadow-[var(--shadow-card)]" style={{ opacity: solid }} />
      </div>
      <div className={children ? 'min-w-0' : 'mt-3'}>
        {children}
        <div className={`flex items-center gap-2 text-[14px] font-bold text-ink-2 ${children ? 'mt-3 flex-wrap' : ''}`}>
          <motion.span className="tabular-nums text-accent">{pct}</motion.span>
          <span key={step} className="animate-[fade-in_0.4s_ease-out]">{steps[step]}</span>
        </div>
      </div>
    </div>
  );
}

// Static row of empty card slots for the empty collection.
export function EmptySlots() {
  return (
    <div className="flex justify-center gap-3 pt-8 pb-4" aria-hidden>
      {[-6, 0, 6].map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.08 } }}
          className="grid h-[132px] w-[99px] place-items-center rounded-[18px] border-[3px] border-dashed border-ink/20 text-ink/25"
          style={{ rotate: r }}
        >
          <Icon name={i === 1 ? 'add' : 'style'} size={34} />
        </motion.div>
      ))}
    </div>
  );
}
