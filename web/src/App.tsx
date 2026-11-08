import { useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Zukan } from './screens/Zukan';
import { Toaster } from './components/Toast';
import { toast } from './lib/toast';
import { goBack, setStatusBar, setupNative } from './lib/native';
import { allCards, loadCards } from './lib/cards';
import { resumeIllust } from './lib/illust';
import { currentUser } from './lib/firebase';

export function App() {
  const { pathname } = useLocation();
  const zukan = pathname.startsWith('/zukan');
  useEffect(() => {
    currentUser().catch(() => {});
    void loadCards().then(() => resumeIllust(allCards()));
    // Network status can blip to "offline" while the app starts or switches networks, so only report lasting changes.
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void setupNative((offline) => {
      clearTimeout(timer);
      if (offline === shown) return;
      timer = setTimeout(() => {
        shown = offline;
        if (offline) toast('オフラインです。図鑑は見られますが、調べるには通信が必要です', 'wifi_off');
        else toast('オンラインにもどりました', 'wifi');
      }, 1500);
    });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => void setStatusBar(zukan), [zukan]);
  return (
    <>
      <div aria-hidden={zukan} className={zukan ? 'pointer-events-none' : ''}>
        <Home paused={zukan} />
      </div>
      <AnimatePresence>
        {zukan && (
          <motion.div
            key="zukan"
            className="fixed inset-0 z-[45]"
            initial={{ y: '100%', borderRadius: 40 }}
            animate={{ y: 0, borderRadius: 0 }}
            exit={{ y: '100%', borderRadius: 40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            style={{ overflow: 'hidden' }}
          >
            <Zukan />
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster />
    </>
  );
}
