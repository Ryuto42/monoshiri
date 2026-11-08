import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { currentLevel, saveStage, stageInfo, useStage, type Stage } from '../lib/level';
import { haptic, onBack } from '../lib/native';
import { toast } from '../lib/toast';
import { stripRuby } from '../lib/ruby';
import { RubyText } from './RubyText';
import { AgePicker } from './AgePicker';
import { Icon, IconButton } from './ui';
import { press, sheetMotion, ui } from './theme';

const tones = {
  glass: 'glass border border-white/15 bg-black/35 text-white backdrop-blur-xl',
  paper: 'bg-paper-2 text-ink hover:bg-paper-3',
};

// "いま：高学年むけ ▼" — shows the current stage and changes it from the age, in a small sheet.
export function StageChip({ tone = 'paper', onChange, className = '' }: { tone?: keyof typeof tones; onChange?: (s: Stage) => void; className?: string }) {
  const { stage } = useStage();
  const [open, setOpen] = useState(false);
  const label = stage ? `${stageInfo(stage).ruby}むけ` : 'ふつうの せつめい';
  return (
    <>
      <motion.button
        type="button"
        {...press}
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
      <motion.button aria-label="とじる" tabIndex={-1} className={ui.scrim} onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="stage-chip-title"
        {...sheetMotion}
        className={`${ui.sheet} max-h-[94dvh] lg:max-h-[min(860px,92dvh)] lg:max-w-[440px]`}
      >
        <div className={ui.sheetHeader}>
          <span className={ui.handle} />
          <IconButton icon="close" label="とじる" onClick={onClose} className={ui.sheetClose} />
        </div>
        <div className={ui.sheetBody}>
          <AgePicker initial={stage} saving={saving} onSave={(s) => void save(s)} titleId="stage-chip-title" compact saveLabel="これに する" />
        </div>
      </motion.section>
    </motion.div>
  );
}
