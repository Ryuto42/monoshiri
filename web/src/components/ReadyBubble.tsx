import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { dismissReady, useIllustReady } from '../lib/illust';
import { getCard } from '../lib/cards';
import { mediaUrl } from '../lib/api';
import { haptic } from '../lib/native';
import { catStyle } from './theme';
import { Icon } from './ui';

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const;

// Speech bubble that grows out of the zukan button when a card's illustration finishes in the background.
// `above` points down at a button near the bottom of the screen, `below` points up at one in the header.
export function ReadyBubble({ placement, radius = 16, tail = 29 }: { placement: 'above' | 'below'; radius?: number; tail?: number }) {
  const ready = useIllustReady();
  const navigate = useNavigate();
  const id = ready?.id;

  useEffect(() => {
    if (!id) return;
    haptic('success');
    const t = setTimeout(() => dismissReady(id), 7000);
    return () => clearTimeout(t);
  }, [id]);

  const card = ready ? getCard(ready.id) : undefined;
  const c = catStyle(card?.category ?? '');
  const above = placement === 'above';
  const open = () => {
    if (!ready) return;
    dismissReady(ready.id);
    void navigate({ to: '/zukan/$cardId', params: { cardId: ready.id } });
  };

  return (
    <AnimatePresence>
      {ready && (
        <motion.div key={ready.id} className="pointer-events-none absolute inset-0" initial="hidden" animate="shown" exit="gone">
          <motion.span
            aria-hidden
            className="absolute -inset-1 border-2 border-[#ffd36b]"
            style={{ borderRadius: radius + 4 }}
            variants={{ hidden: { opacity: 0, transform: 'scale(1)' }, shown: { opacity: [0, 0.9, 0], transform: ['scale(1)', 'scale(1.12)', 'scale(1.25)'], transition: { duration: 1.4, repeat: 2, ease: 'easeOut' } }, gone: { opacity: 0 } }}
          />
          <motion.button
            type="button"
            onClick={open}
            aria-live="polite"
            className={`pointer-events-auto absolute right-[-6px] z-10 w-max max-w-[min(250px,calc(100vw-48px))] text-left ${above ? 'bottom-[calc(100%+16px)]' : 'top-[calc(100%+14px)]'}`}
            style={{ transformOrigin: `calc(100% - ${tail + 6}px) ${above ? '100%' : '0%'}` }}
            variants={{
              hidden: { opacity: 0, scale: 0.2, y: above ? 18 : -18 },
              shown: { opacity: 1, scale: 1, y: 0, transition: { ...pop, delayChildren: 0.12, staggerChildren: 0.06 } },
              gone: { opacity: 0, scale: 0.3, y: above ? 14 : -14, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } },
            }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={{ transform: ['translateY(0px)', 'translateY(-3px)', 'translateY(0px)'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              className="relative flex items-center gap-3 rounded-[20px] bg-[#fffdf8] py-2.5 pl-2.5 pr-4 text-[#2a2017] shadow-[0_14px_40px_rgb(0_0_0/0.32)]"
            >
              <span
                aria-hidden
                className={`absolute h-4 w-4 rotate-45 rounded-[3px] bg-[#fffdf8] ${above ? '-bottom-[6px]' : '-top-[6px]'}`}
                style={{ right: tail - 2 }}
              />
              <motion.span
                className="relative h-12 w-12 shrink-0"
                variants={{ hidden: { scale: 0, rotate: -25 }, shown: { scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 500, damping: 16 } } }}
              >
                <span className="block h-full w-full overflow-hidden rounded-[14px]" style={{ background: c.bg }}>
                  <img src={mediaUrl(ready.url)} alt="" draggable={false} className="h-full w-full object-cover mix-blend-multiply" />
                </span>
                <Burst />
              </motion.span>
              <span className="min-w-0">
                <motion.span
                  className="flex items-center gap-1 text-[12px] font-black text-accent"
                  variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
                >
                  <Icon name="auto_awesome" size={14} fill />
                  イラストが完成したよ！
                </motion.span>
                <motion.span
                  className="block truncate text-[15px] font-black leading-snug"
                  variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
                >
                  {ready.name}のカード
                </motion.span>
                <motion.span
                  className="block text-[11px] font-bold text-[#9a8a7a]"
                  variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
                >
                  タップして見る
                </motion.span>
              </span>
            </motion.div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Burst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
            style={{ background: ['#ffd36b', '#ffffff', '#ef6a3a'][i % 3] }}
            variants={{
              hidden: { x: 0, y: 0, opacity: 0, scale: 0 },
              shown: { x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: [0, 1, 0], scale: [0, 1.3, 0.3], transition: { duration: 0.9, delay: 0.25, ease: 'easeOut' } },
            }}
          />
        );
      })}
    </span>
  );
}
