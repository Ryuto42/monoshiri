import { motion } from 'motion/react';
import { useEffect } from 'react';
import { haptic, onBack } from '../lib/native';
import { Button, HeroIcon } from './ui';
import { dialogMotion, ui } from './theme';

// Leaving a result that isn't a card yet loses it (the photo isn't kept), so the way back asks first.
export function LeaveConfirm({ name, onMakeCard, onLeave, onStay }: {
  name: string; onMakeCard: () => void; onLeave: () => void; onStay: () => void;
}) {
  useEffect(() => {
    haptic('select');
    return onBack(onStay);
  }, [onStay]);

  return (
    <motion.div className={`${ui.overlay} z-[60] items-end sm:items-center`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="このまま見る" tabIndex={-1} className={ui.scrim} onClick={onStay} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="leave-title"
        {...dialogMotion}
        className={`${ui.dialog} px-6 pb-4 pt-6 text-center`}
      >
        <HeroIcon icon="style" />
        <h2 id="leave-title" className={`mt-4 ${ui.title}`}>
          カードにしないで
          <br />
          もどる？
        </h2>
        <p className={ui.lead}>
          「{name}」は、まだ図鑑に入っていないよ。カードにしておくと、あとでいつでも見られるよ。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" icon="style" iconFill onClick={onMakeCard}>
            カードにする
          </Button>
          <Button tone="subtle" onClick={onLeave}>
            カードにしないでもどる
          </Button>
        </div>
      </motion.section>
    </motion.div>
  );
}
