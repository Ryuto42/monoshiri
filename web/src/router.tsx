import { createRootRoute, createRoute, createRouter, useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Zukan } from './screens/Zukan';
import { Toaster, toast } from './components/Toast';
import { goBack, setupNative } from './lib/native';
import { loadCards } from './lib/cards';
import { currentUser } from './lib/firebase';

function Root() {
  const { pathname } = useLocation();
  const zukan = pathname.startsWith('/zukan');
  useEffect(() => {
    currentUser().catch(() => {});
    void loadCards();
    let wasOffline = false;
    void setupNative((offline) => {
      if (offline) toast('オフラインです。図鑑は見られますが、調べるには通信が必要です', 'wifi_off');
      else if (wasOffline) toast('オンラインにもどりました', 'wifi');
      wasOffline = offline;
    });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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

const rootRoute = createRootRoute({ component: Root });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
const zukanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan', component: () => null });
const cardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan/$cardId', component: () => null });

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, zukanRoute, cardRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
