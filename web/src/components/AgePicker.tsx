import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AGE_MAX, AGE_MIN, stageForAge, stageInfo, type Stage } from '../lib/level';
import { haptic } from '../lib/native';
import { RubyText } from './RubyText';
import { Button, HeroIcon, Icon } from './ui';
import { press, pressIcon, ui } from './theme';

const clamp = (v: number) => Math.min(AGE_MAX, Math.max(AGE_MIN, v));

// Asks for the age only to pick a stage; the age stays in this component's memory and is never saved or sent.
export function AgePicker({ initial, initialAge, saving = false, onSave, onSkip, titleId = 'account-title', compact = false, saveLabel, skipLabel }: {
  initial: Stage | null;
  initialAge?: number;
  saving?: boolean;
  onSave: (stage: Stage, age: number) => void;
  onSkip?: () => void;
  titleId?: string;
  compact?: boolean;
  saveLabel?: string;
  skipLabel?: string;
}) {
  const [digits, setDigits] = useState(initialAge ? String(initialAge) : '');
  const age = digits ? Number(digits) : null;
  const valid = age != null && age >= AGE_MIN && age <= AGE_MAX;
  const stage = valid ? stageForAge(age) : null;

  const press = (d: number) => {
    const next = digits + d;
    // Up to three digits; anything out of 3〜120 stays on screen with the range message instead of turning into another age.
    if ((!digits && d === 0) || next.length > 3) return void haptic('error');
    haptic('select');
    setDigits(next);
  };
  const erase = () => {
    haptic('select');
    setDigits((s) => s.slice(0, -1));
  };
  const step = (delta: number) => {
    haptic('select');
    setDigits(String(age == null ? 6 : clamp(age + delta)));
  };

  // A hardware keyboard works too: digits, Backspace, and the up / down arrows.
  const keys = useRef({ press, erase, step });
  useEffect(() => {
    keys.current = { press, erase, step };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea')) return;
      const k = keys.current;
      if (/^\d$/.test(e.key)) k.press(Number(e.key));
      else if (e.key === 'Backspace') k.erase();
      else if (e.key === 'ArrowUp') k.step(1);
      else if (e.key === 'ArrowDown') k.step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="age-picker phrase-wrap pb-2">
      {/* Short screens (a small phone in landscape-ish split view) drop the badge so the keypad still fits. */}
      {!compact && (
        <div className="[@media(max-height:760px)]:hidden">
          <HeroIcon icon="school" />
        </div>
      )}
      <h2 id={titleId} className={`${compact ? 'mt-0' : 'mt-4'} text-center ${ui.title}`}>
        なんさい？
      </h2>
      <p className={`${ui.lead} text-center`}>
        <RubyText text="年齢《ねんれい》に あわせて、ことばや くわしさを かえるよ。" />
        <span className="mt-1 block text-[12px] text-ink-3">
          <RubyText text="年齢《ねんれい》は おぼえないで、「低学年《ていがくねん》むけ」などの だんかいだけ ほぞんするよ。" />
        </span>
      </p>
      {initial && (
        <p className="mt-3 text-center text-[13px] font-bold text-ink-2">
          いま：<RubyText text={stageInfo(initial).ruby} />むけ
        </p>
      )}

      {/* On a short screen (Safari on an iPhone, with its toolbars) the keypad and gaps tighten so the button below
          fits without scrolling. */}
      <div className="mt-4 flex items-center gap-3 [@media(max-height:760px)]:mt-3">
        <Key round label="1さい へらす" disabled={age == null || age <= AGE_MIN} onClick={() => step(-1)} className="h-16 w-16 shrink-0 rounded-full [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:w-14">
          <span aria-hidden className="text-[32px] leading-none">−</span>
        </Key>
        <output
          aria-live="polite"
          aria-label={age == null ? 'まだ いれていないよ' : `${age}さい`}
          className="flex h-20 min-w-0 flex-1 items-baseline justify-center gap-1 rounded-3xl bg-paper-2 pt-3 [@media(max-height:760px)]:h-16 [@media(max-height:760px)]:pt-1.5"
        >
          <span className={`text-[52px] font-black leading-none tabular-nums ${age == null ? 'text-ink-3' : 'text-ink'}`}>{digits || '?'}</span>
          <span className="text-[18px] font-black text-ink-2">さい</span>
        </output>
        <Key round label="1さい ふやす" disabled={age != null && age >= AGE_MAX} onClick={() => step(1)} className="h-16 w-16 shrink-0 rounded-full [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:w-14">
          <span aria-hidden className="text-[32px] leading-none">+</span>
        </Key>
      </div>

      <div role="group" aria-label="数字をいれる" className="mt-3 grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <Key key={d} label={String(d)} onClick={() => press(d)} className="h-12 rounded-2xl text-[22px] [@media(max-height:760px)]:h-11">
            {d}
          </Key>
        ))}
        <span aria-hidden />
        <Key label="0" onClick={() => press(0)} className="h-12 rounded-2xl text-[22px] [@media(max-height:760px)]:h-11">
          0
        </Key>
        <Key label="1つ けす" disabled={!digits} onClick={erase} className="h-12 rounded-2xl text-[15px] [@media(max-height:760px)]:h-11">
          けす
        </Key>
      </div>

      <div className="mt-4 min-h-[48px] [@media(max-height:760px)]:mt-3" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {stage ? (
            <motion.p
              key={stage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-[14px] font-bold text-ink"
            >
              <Icon name="check_circle" size={20} fill className="text-accent" />
              <span>
                「<RubyText text={stageInfo(stage).ruby} />むけ」の せつめいに するよ
              </span>
            </motion.p>
          ) : (
            age != null && (
              <motion.p
                key="range"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-3 text-center text-[13px] font-bold text-ink-3"
              >
                <RubyText text={`${AGE_MIN}〜${AGE_MAX}の 数字《すうじ》を いれてね`} />
              </motion.p>
            )
          )}
        </AnimatePresence>
      </div>

      <Button
        type="button"
        size="lg"
        disabled={!valid || saving}
        onClick={() => stage && age != null && onSave(stage, age)}
        className="mt-4 w-full [@media(max-height:760px)]:mt-3"
      >
        {saving ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="check" size={22} />}
        {saveLabel ?? 'これで はじめる'}
      </Button>
      {onSkip && (
        <button type="button" onClick={onSkip} className="mx-auto mt-2 flex h-11 items-center px-4 text-[14px] font-bold text-ink-2 underline decoration-ink/20 underline-offset-4">
          {skipLabel ?? 'あとで（ふつうの せつめいの まま）'}
        </button>
      )}
    </div>
  );
}

function Key({ label, round, disabled, onClick, className, children }: { label: string; round?: boolean; disabled?: boolean; onClick: () => void; className: string; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...(round ? pressIcon : press)}
      onClick={onClick}
      className={`grid place-items-center bg-paper-2 font-black text-ink tabular-nums hover:bg-paper-3 disabled:opacity-40 ${className}`}
    >
      {children}
    </motion.button>
  );
}
