import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { GRADES, stageInfo, type Grade, type Stage } from '../lib/level';
import { haptic } from '../lib/native';
import { RubyText } from './RubyText';
import { Icon } from './ui';
import { spring } from './theme';

// Asks for the school year only to pick a stage; the year stays in this component's memory and is never saved or sent.
export function StagePicker({ initial, saving, onSave, onSkip, titleId = 'account-title', compact = false, saveLabel, skipLabel }: {
  initial: Stage | null;
  saving: boolean;
  onSave: (s: Stage) => void;
  onSkip?: () => void;
  titleId?: string;
  compact?: boolean;
  saveLabel?: string;
  skipLabel?: string;
}) {
  const [grade, setGrade] = useState<Grade | null>(null);
  const stage = grade?.stage ?? null;

  const pick = (g: Grade) => {
    haptic('select');
    setGrade(g);
  };

  return (
    <div className="pb-2">
      {!compact && (
        <motion.div
          initial={{ scale: 0.6, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          className="mx-auto mt-2 grid h-16 w-16 place-items-center rounded-[22px] bg-accent-soft text-accent"
        >
          <Icon name="school" size={36} fill />
        </motion.div>
      )}
      <h2 id={titleId} className={`${compact ? 'mt-1' : 'mt-4'} text-center text-[24px] font-black leading-snug`}>
        なんねんせい？
      </h2>
      <p className="mt-2 text-center text-[14px] leading-relaxed text-ink-2">
        <RubyText text="学年《がくねん》に あわせて、ことばや くわしさを かえるよ。" />
        <span className="mt-1 block text-[12px] text-ink-3">
          <RubyText text="学年《がくねん》は おぼえないで、「低学年《ていがくねん》むけ」などの だんかいだけ ほぞんするよ。" />
        </span>
      </p>
      {initial && (
        <p className="mt-3 text-center text-[13px] font-bold text-ink-2">
          いま：<RubyText text={stageInfo(initial).ruby} />むけ
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {GRADES.map((g) => (
          <div key={g.group} role="group" aria-label={g.group.replace(/《[^》]*》/g, '')}>
            <p className="mb-1.5 px-1 text-[12px] font-bold text-ink-2">
              <RubyText text={g.group} />
            </p>
            <div className={`grid gap-2 ${g.grades.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {g.grades.map((x) => {
                const on = grade?.id === x.id;
                return (
                  <motion.button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    whileTap={{ scale: 0.92 }}
                    transition={spring}
                    onClick={() => pick(x)}
                    className={`h-12 rounded-2xl text-[17px] font-black ${on ? 'bg-ink text-paper' : 'bg-paper-2 text-ink'}`}
                  >
                    {x.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 min-h-[48px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {stage && (
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
          )}
        </AnimatePresence>
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={spring}
        disabled={!stage || saving}
        onClick={() => stage && onSave(stage)}
        className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink shadow-[0_8px_22px_-8px_color-mix(in_oklab,var(--accent)_75%,transparent)] disabled:opacity-50"
      >
        {saving ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="check" size={22} />}
        {saveLabel ?? 'これで はじめる'}
      </motion.button>
      {onSkip && (
        <button type="button" onClick={onSkip} className="mx-auto mt-2 flex h-11 items-center px-4 text-[14px] font-bold text-ink-2 underline decoration-ink/20 underline-offset-4">
          {skipLabel ?? 'あとで（ふつうの せつめいの まま）'}
        </button>
      )}
    </div>
  );
}
