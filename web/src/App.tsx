import { useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Zukan } from './screens/Zukan';
import { Account } from './screens/Account';
import { Privacy } from './screens/Privacy';
import { AuthAction } from './screens/AuthAction';
import { SignupNudge } from './components/SignupNudge';
import { Welcome } from './components/Welcome';
import { Onboarding } from './components/Onboarding';
import { settleWelcome, useWelcome } from './lib/welcome';
import { useNudge } from './lib/account';
import { Toaster } from './components/Toast';
import { toast } from './lib/toast';
import { goBack, setStatusBar, setupNative } from './lib/native';
import { allCards, loadCards } from './lib/cards';
import { resumeIllust } from './lib/illust';
import { currentUser } from './lib/firebase';
import { setOffline } from './lib/online';

export function App() {
  const { pathname } = useLocation();
  const zukan = pathname.startsWith('/zukan');
  const account = pathname === '/account';
  const privacy = pathname === '/privacy';
  const emailLink = pathname === '/auth/action';
  const nudge = useNudge();
  const welcome = useWelcome();
  const covered = zukan || account || privacy || emailLink || !!nudge || welcome !== 'closed';
  useEffect(() => {
    currentUser().catch(() => {});
    // The welcome waits for the zukan so people who already have cards skip it; even a failed load must release the camera.
    void loadCards()
      .then(() => resumeIllust(allCards()))
      .finally(() => settleWelcome(allCards().length > 0));
    // Network status can blip to "offline" while the app starts or switches networks, so only report lasting changes.
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onNetwork = (offline: boolean) => {
      setOffline(offline);
      clearTimeout(timer);
      if (offline === shown) return;
      timer = setTimeout(() => {
        shown = offline;
        if (offline) toast('オフラインです。図鑑《ずかん》は見《み》られますが、調《しら》べるには通信《つうしん》が必要《ひつよう》です', 'wifi_off');
        else toast('オンラインにもどりました', 'wifi');
      }, 1500);
    };
    void setupNative(onNetwork);
    const onOnline = () => onNetwork(false);
    const onOffline = () => onNetwork(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  useEffect(() => void setStatusBar(zukan), [zukan]);
  return (
    <>
      <div aria-hidden={covered} className={covered ? 'pointer-events-none' : ''}>
        <Home paused={covered} />
      </div>
      <AnimatePresence>
        {zukan && (
          <motion.div
            key="zukan"
            className="fixed inset-0 z-[45]"
            // A transform string (not `y`) runs on the compositor, so the slide stays smooth while the zukan mounts.
            initial={{ transform: 'translateY(100%)', borderRadius: 40 }}
            animate={{ transform: 'translateY(0%)', borderRadius: 0 }}
            exit={{ transform: 'translateY(100%)', borderRadius: 40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            style={{ overflow: 'hidden', willChange: 'transform' }}
          >
            <Zukan />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{account && <Account key="account" />}</AnimatePresence>
      <AnimatePresence>{privacy && <Privacy key="privacy" />}</AnimatePresence>
      <AnimatePresence>{emailLink && <AuthAction key="auth-action" />}</AnimatePresence>
      {!zukan && !account && !privacy && !emailLink && <SignupNudge />}
      {!zukan && !account && !privacy && !emailLink && <Welcome />}
      {/* Age and consent come first wherever the app was opened, except over the policy itself. */}
      {!privacy && !emailLink && <Onboarding />}
      <Toaster />
    </>
  );
}
