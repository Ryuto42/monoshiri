import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { STAGES, stageForAge, type Stage } from '../lib/level';
import { haptic } from '../lib/native';
import { Icon } from './ui';
import { spring } from './theme';

const AGES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

// Asks for an age only to suggest a stage; the age stays in this component's memory and is never saved or sent.
export function StagePicker({ initial, saving, onSave, onSkip }: {
  initial: Stage | null; saving: boolean; onSave: (s: Stage) => void; onSkip?: () => void;
}) {
  const [age, setAge] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(initial);

  const pickAge = (a: number) => {
    haptic('select');
    setAge(a);
    setStage(stageForAge(a));
  };

  return (
    <div className="pb-2">
      <motion.div
        initial={{ scale: 0.6, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 16 }}
        className="mx-auto mt-2 grid h-16 w-16 place-items-center rounded-[22px] bg-accent-soft text-accent"
      >
        <Icon name="school" size={36} fill />
      </motion.div>
      <h2 id="account-title" className="mt-4 text-center text-[22px] font-black leading-snug">なんさいですか？</h2>
      <p className="mt-2 text-center text-[13px] leading-relaxed text-ink-2">
        年齢に合わせて、説明のことばやくわしさを変えます。
        <br />
        年齢そのものは保存せず、「中学生」などの段階だけを保存します。
      </p>

      <div role="group" aria-label="年齢" className="mt-5 grid grid-cols-5 gap-2">
        {AGES.map((a) => (
          <AgeChip key={a} on={age === a} onClick={() => pickAge(a)}>
            {a}
          </AgeChip>
        ))}
        <AgeChip on={age === 19} onClick={() => pickAge(19)} wide>
          19〜
        </AgeChip>
      </div>

      <p className="mt-6 px-1 text-[12px] font-bold text-ink-2">学びの段階（ちがうときは選びなおせます）</p>
      <div role="radiogroup" aria-label="学びの段階" className="mt-2 grid grid-cols-2 gap-2">
        {STAGES.map((s) => {
          const on = stage === s.id;
          return (
            <motion.button
              key={s.id}
              role="radio"
              aria-checked={on}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => {
                haptic('select');
                setStage(s.id);
              }}
              className={`relative overflow-hidden rounded-2xl border px-3 py-2.5 text-left ${on ? 'border-accent bg-accent-soft' : 'border-line bg-paper'}`}
            >
              <span className="block text-[14px] font-black text-ink">{s.label}</span>
              <span className="block text-[11px] font-bold text-ink-2">{s.hint}</span>
              <AnimatePresence>
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring} className="absolute right-2 top-2 text-accent">
                    <Icon name="check_circle" size={18} fill />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={spring}
        disabled={!stage || saving}
        onClick={() => stage && onSave(stage)}
        className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink disabled:opacity-50"
      >
        <Icon name="check" size={22} />
        この段階で始める
      </motion.button>
      {onSkip && (
        <button onClick={onSkip} className="mx-auto mt-3 block text-[13px] font-bold text-ink-2 underline decoration-ink/20 underline-offset-4">
          あとで決める（いまの標準の説明のまま）
        </button>
      )}
    </div>
  );
}

function AgeChip({ on, wide, onClick, children }: { on: boolean; wide?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={spring}
      aria-pressed={on}
      onClick={onClick}
      className={`h-11 rounded-2xl text-[15px] font-black tabular-nums ${wide ? 'col-span-2' : ''} ${on ? 'bg-ink text-paper' : 'bg-paper-2 text-ink'}`}
    >
      {children}
    </motion.button>
  );
}
