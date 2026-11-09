import { motion, useMotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import { slideOut, useSwipeDismiss } from '../lib/useSwipeDismiss';
import { useMe } from '../lib/firebase';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { IconButton } from '../components/ui';
import { sheetMotion, ui } from '../components/theme';
import { GuestView } from './account/GuestView';
import { MemberView } from './account/MemberView';
import { Spinner } from './account/parts';

export function Account() {
  const me = useMe();
  const backTo = useBackTo();
  const close = () => backTo('/');
  useEffect(() => onBack(close, { history: false }));
  // Pull down from the handle (or from the top of the scrolled content) to close, like the other sheets.
  const y = useMotionValue(0);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useSwipeDismiss({ y, areas: [head, body], onDismiss: () => slideOut(y, close) });

  return (
    <motion.div className="fixed inset-0 z-[50] flex items-end justify-center lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="とじる" tabIndex={-1} className={ui.scrim} onClick={close} />
      {/* Slides up only as far as the focused field needs to clear the keyboard (--kb-lift, set in lib/native.ts). */}
      <div data-kb-lift className="flex w-full justify-center transition-transform duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] [transform:translate3d(0,calc(var(--kb-lift,0px)*-1),0)]">
      <motion.div style={{ y }} className="flex w-full justify-center">
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="account-title"
        data-kb-sheet
        {...sheetMotion}
        className={`${ui.sheet} max-h-[94dvh] lg:max-h-[min(860px,92dvh)] lg:max-w-[440px]`}
      >
        <div ref={head} className={ui.sheetHeader}>
          <span className={ui.handle} />
          <IconButton icon="close" label="とじる" onClick={close} className={ui.sheetClose} />
        </div>
        <div ref={body} data-kb-scroll className="overflow-y-auto overscroll-contain px-6 pb-[calc(max(env(safe-area-inset-bottom),24px)+var(--kb-pad,0px))] no-scrollbar">
          {!me ? <Spinner big /> : me.guest ? <GuestView /> : <MemberView me={me} onDone={close} />}
        </div>
      </motion.section>
      </motion.div>
      </div>
    </motion.div>
  );
}
