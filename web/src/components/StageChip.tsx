import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { currentLevel, saveStage, stageInfo, useStage, type Stage } from '../lib/level';
import { haptic, onBack } from '../lib/native';
import { toast } from '../lib/toast';
import { stripRuby } from '../lib/ruby';
import { RubyText } from './RubyText';
import { StagePicker } from './StagePicker';
import { Icon, IconButton } from './ui';
import { spring } from './theme';

const tones = {
  glass: 'glass border border-white/15 bg-black/35 text-white backdrop-blur-xl',
  paper: 'bg-paper-2 text-ink hover:bg-paper-3',
};

// "いま：高学年むけ ▼" — shows the current stage and switches it in a small sheet.
export function StageChip({ tone = 'paper', onChange, className = '' }: { tone?: keyof typeof tones; onChange?: (s: Stage) => void; className?: string }) {
  const { stage } = useStage();
  const [open, setOpen] = useState(false);
  const label = stage ? `${stageInfo(stage).ruby}むけ` : '学年《がくねん》をえらぶ';
  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        transition={spring}
        onClick={() => {
          haptic('tap');
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`せつめいの むずかしさ：${stage ? `${stripRuby(stageInfo(stage).ruby)}むけ` : 'ふつう'}（かえる）`}
        className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-full pl-3.5 pr-2.5 text-[13px] font-bold leading-none ${tones[tone]} ${className}`}
      >
        <Icon name="school" size={18} fill />
        {stage && <span className="opacity-75">いま：</span>}
        <span className="whitespace-nowrap">
          <RubyText text={label} />
        </span>
        <Icon name="chevron_right" size={18} className="rotate-90 opacity-75" />
      </motion.button>
      {createPortal(
        <AnimatePresence>{open && <StageSheet key="stage-sheet" stage={stage} onClose={() => setOpen(false)} onChange={onChange} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function StageSheet({ stage, onClose, onChange }: { stage: Stage | null; onClose: () => void; onChange?: (s: Stage) => void }) {
  const [saving, setSaving] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => onBack(() => close.current(), { history: false }), []);

  async function save(s: Stage) {
    setSaving(true);
    try {
      await saveStage(s);
      haptic('success');
      toast(`「${stripRuby(stageInfo(s).ruby)}むけ」の せつめいに したよ`, 'school');
    } catch {
      // The stage is already in use on this device; only the copy in the account failed.
      toast('アカウントに ほぞんできませんでした。この端末では かわっているよ', 'error');
    } finally {
      setSaving(false);
    }
    onClose();
    if (s !== stage && currentLevel() === s) onChange?.(s);
  }

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center text-ink lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="とじる" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="stage-chip-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[32px] bg-paper px-6 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-[var(--shadow-float)] paper-grain no-scrollbar lg:max-w-[440px] lg:rounded-[32px]"
      >
        <div className="relative flex h-10 justify-center">
          <span className="mt-1 h-1.5 w-10 rounded-full bg-ink/15 lg:hidden" />
          <IconButton icon="close" label="とじる" onClick={onClose} className="absolute -right-3 -top-1" />
        </div>
        <StagePicker initial={stage} saving={saving} onSave={(s) => void save(s)} titleId="stage-chip-title" compact saveLabel="これに する" />
      </motion.section>
    </motion.div>
  );
}
