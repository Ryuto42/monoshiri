import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { dismissNudge, useNudge } from '../lib/account';
import { useCards } from '../lib/cards';
import { mediaUrl } from '../lib/api';
import { haptic, onBack } from '../lib/native';
import { Button, Icon } from './ui';
import { Phrases } from './Phrases';
import { catStyle, dialogMotion, spring, ui } from './theme';

const COPY = {
  first: {
    title: 'はじめてのカード、\nおめでとう！',
    body: '登録しておくと、スマホをなくしても機種を変えても、図鑑は消えません。パソコンからも同じ図鑑が開けます。',
  },
  more: {
    title: '5枚あつまったね！',
    body: 'ここまでの図鑑を守りませんか？ 登録すれば、どの端末でもログインするだけで同じ図鑑が開けます。',
  },
  limit: {
    title: 'ゲストで調べられる分を\n使い切りました',
    body: '登録すると、もっとたくさん新しいモノを調べられます。みんなが調べたモノと、あつめたカードは今も見られます。',
  },
};

export function SignupNudge() {
  const nudge = useNudge();
  return <AnimatePresence>{nudge && <Prompt key={nudge} kind={nudge} />}</AnimatePresence>;
}

function Prompt({ kind }: { kind: keyof typeof COPY }) {
  const navigate = useNavigate();
  const card = useCards()[0];
  const copy = COPY[kind];
  useEffect(() => {
    haptic('select');
    // No history entry: it would be popped only after the exit animation, undoing the navigation to /account.
    return onBack(dismissNudge, { history: false });
  }, []);

  const go = () => {
    dismissNudge();
    void navigate({ to: '/account' });
  };

  return (
    <motion.div className={`${ui.overlay} z-[55] items-end sm:items-center`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="あとで" tabIndex={-1} className={ui.scrim} onClick={dismissNudge} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="nudge-title"
        {...dialogMotion}
        className={`${ui.dialog} overflow-hidden px-6 pb-4 pt-7 text-center`}
      >
        <Badge card={card} />
        <motion.h2
          id="nudge-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.18 }}
          className={`mt-5 whitespace-pre-line ${ui.title}`}
        >
          {copy.title}
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.24 }} className={`phrase-wrap ${ui.lead}`}>
          <Phrases text={copy.body} />
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }} className="mt-5 flex flex-col gap-2">
          <Button size="lg" icon="shield" iconFill onClick={go}>
            登録する
          </Button>
          <Button tone="subtle" onClick={dismissNudge}>
            あとで
          </Button>
        </motion.div>
      </motion.section>
    </motion.div>
  );
}

function Badge({ card }: { card?: ReturnType<typeof useCards>[number] }) {
  const c = catStyle(card?.category ?? '');
  return (
    <div className="relative mx-auto h-[118px] w-[96px]">
      <motion.div
        initial={{ rotate: -14, y: 20, scale: 0.6 }}
        animate={{ rotate: -6, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.05 }}
        className="absolute inset-0 rounded-[14px] bg-[#fffdf8] p-[5px] shadow-[var(--shadow-card)]"
      >
        <span className="grid h-full w-full place-items-center overflow-hidden rounded-[10px]" style={{ background: c.bg }}>
          {card?.illustration ? (
            <img src={mediaUrl(card.illustration)} alt="" className="h-full w-full object-cover mix-blend-multiply" />
          ) : (
            <Icon name={card?.icon ?? 'auto_awesome'} size={40} fill style={{ color: c.ink }} />
          )}
        </span>
      </motion.div>
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 13, delay: 0.32 }}
        className="absolute -bottom-3 -right-5 grid h-12 w-12 place-items-center rounded-full bg-leaf text-white shadow-[var(--shadow-float)] ring-4 ring-paper"
      >
        <Icon name="cloud_done" size={26} fill />
      </motion.span>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x: Math.cos(a) * 78, y: Math.sin(a) * 70, scale: [0, 1, 0.6], opacity: [1, 1, 0] }}
            transition={{ duration: 0.9, delay: 0.2 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full"
            style={{ background: ['var(--accent)', 'var(--sun)', 'var(--leaf)', 'var(--sky)', 'var(--accent)'][i] }}
          />
        );
      })}
    </div>
  );
}
