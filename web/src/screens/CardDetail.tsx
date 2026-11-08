import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@tanstack/react-router';
import { getCard, removeCard, saveCard, useCards } from '../lib/cards';
import { api } from '../lib/api';
import type { Card, DeepNote, Explore } from '../lib/types';
import { CardFace } from '../components/CardFace';
import { SearchEntry } from '../components/SearchEntry';
import { Speak } from '../components/Speak';
import { toast } from '../lib/toast';
import { Button, Icon, IconButton } from '../components/ui';
import { catStyle, spring, TOPIC_COLORS } from '../components/theme';
import { haptic } from '../lib/native';
import { TopicPanel } from './TopicPanel';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { slideOut, useSwipeDismiss } from '../lib/useSwipeDismiss';

export function CardDetail({ cardId }: { cardId: string }) {
  const cards = useCards();
  const card = cards.find((c) => c.id === cardId);
  const [flipped, setFlipped] = useState(false);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [explore, setExplore] = useState<Explore | null>(null);
  const backTo = useBackTo();
  const close = () => backTo('/zukan');
  const router = useRouter();

  // Registered once (the router is stable) so a topic panel opened later stays above this layer in the back stack.
  useEffect(
    () =>
      onBack(
        () => {
          if (router.history.canGoBack()) router.history.back();
          else void router.navigate({ to: '/zukan', replace: true });
        },
        { history: false },
      ),
    [router],
  );
  // The explanation is cached on the server once explored, so this only fetches the extras (Wikipedia, Google suggestions).
  const name = card?.name;
  useEffect(() => {
    if (!name) return;
    let live = true;
    api.explore(name).then((ex) => live && setExplore(ex)).catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  const y = useMotionValue(0);
  const scroller = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  useSwipeDismiss({ y, areas: [scroller], onDismiss: () => slideOut(y, close) });

  if (!card) return null;
  const c = catStyle(card.category);
  const no = cards.length - cards.indexOf(card);

  const notes = new Map(card.notes.map((n) => [n.topicId, n]));
  const read = card.topics.filter((t) => notes.has(t.id)).length;
  const topicIndex = card.topics.findIndex((t) => t.id === topicId);
  const topic = topicIndex >= 0 ? card.topics[topicIndex] : null;

  const onNote = (n: DeepNote) => {
    const latest = getCard(card.id);
    if (!latest) return;
    void saveCard({ ...latest, notes: [...latest.notes.filter((x) => x.topicId !== n.topicId), n], updatedAt: Date.now() });
  };

  return (
    <motion.div ref={scroller} className="fixed inset-0 z-40 overflow-y-auto overscroll-contain" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div className="fixed inset-0 bg-[#120e0b]/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div style={{ y }} className="relative mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 px-5 pb-16 pt-[max(env(safe-area-inset-top),20px)] lg:flex-row lg:items-start lg:pt-16">
        <div className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] z-10">
          <IconButton icon="close" label="とじる" tone="glass" onClick={close} />
        </div>

        <div className="w-[min(80vw,340px)] shrink-0 lg:sticky lg:top-16">
          <motion.button layoutId={`card-${card.id}`} onClick={() => setFlipped((f) => !f)} className="block w-full [perspective:1400px]" aria-label="カードをうらがえす" transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <motion.div className="relative [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
              <div className="[backface-visibility:hidden]">
                <CardFace card={card} no={no} size="lg" />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="flex h-full flex-col rounded-[22px] bg-[#fffdf8] p-5 text-left text-[#2a2017] shadow-[var(--shadow-float)]">
                  <span className="text-[12px] font-black" style={{ color: c.ink }}>No.{String(no).padStart(3, '0')} ・ {card.category}</span>
                  <span className="text-[22px] font-black">{card.name}</span>
                  <span className="mt-2 text-[14px] leading-relaxed text-[#66574a]">{card.summary}</span>
                  <span className="mt-auto rounded-2xl p-3 text-[13px] font-bold leading-relaxed" style={{ background: c.bg, color: c.ink }}>
                    知ってた？ {card.funFact}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.button>
          <p className="mt-3 text-center text-[13px] font-bold text-white/70">タップでうらがえす</p>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.15, type: 'spring', stiffness: 260, damping: 28 } }}
          exit={{ opacity: 0, y: 24 }}
          className="w-full flex-1 rounded-[32px] bg-paper p-6 text-ink shadow-[var(--shadow-float)]"
        >
          <div ref={intro}>
            <p className="text-[12px] font-bold tracking-wider text-ink-3">{card.reading}・{card.en}</p>
            <h2 data-speak className="text-[30px] font-black leading-tight">{card.name}</h2>
            <p data-speak className="mt-2 text-[17px] font-bold text-accent">{card.oneLiner}</p>
            <p data-speak className="mt-3 text-ink-2">{card.summary}</p>
          </div>
          <div className="mt-4 flex gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--sun)_22%,var(--paper))] p-4">
            <Icon name="lightbulb" size={26} fill className="mt-0.5 shrink-0 text-[#b7800b]" />
            <div>
              <p className="text-[12px] font-black text-[#9a6b06]">知ってた？</p>
              <p className="text-[15px] font-bold leading-relaxed">{card.funFact}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Speak target={intro} text={`知ってた？${card.funFact}`} />
            <Button
              tone="ghost"
              icon="delete"
              onClick={async () => {
                if (!confirm(`「${card.name}」のカードを図鑑から外しますか？`)) return;
                close();
                await removeCard(card.id);
                toast('カードを外しました', 'delete');
              }}
            >
              外す
            </Button>
          </div>

          <div className="mt-8 flex items-end justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[18px] font-black">
              <Icon name="explore" size={22} fill className="text-accent" /> もっと知りたい！
            </h3>
            {card.topics.length > 0 && (
              <p className="shrink-0 text-[13px] font-bold text-ink-3" aria-label={`${card.topics.length}この問いのうち${read}こを読んだ`}>
                読んだ {read} / {card.topics.length}
              </p>
            )}
          </div>
          <TopicList card={card} notes={notes} onOpen={(id) => {
            haptic('select');
            setTopicId(id);
          }} />

          {explore?.wiki && (
            <a
              href={explore.wiki.url}
              target="_blank"
              rel="noopener"
              className="mt-6 flex gap-3 rounded-3xl border border-line p-4 transition-colors hover:bg-paper-2"
            >
              {explore.wiki.thumb && <img src={explore.wiki.thumb} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />}
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[12px] font-black text-ink-3">
                  <Icon name="menu_book" size={16} /> Wikipedia「{explore.wiki.title}」
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2 line-clamp-3">{explore.wiki.extract}</span>
              </span>
            </a>
          )}
          <SearchEntry html={explore?.entryPoint} />
        </motion.section>
      </motion.div>
      {createPortal(
        <AnimatePresence>
          {topic && (
            <TopicPanel
              key={topic.id}
              ex={explore ?? asExplore(card)}
              topic={topic}
              index={topicIndex}
              note={notes.get(topic.id)}
              onNote={onNote}
              onClose={() => setTopicId(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  );
}

// Enough of an explanation to open a topic before (or without) the server copy arriving.
function asExplore(card: Card): Explore {
  const { id, name, reading, en, category, icon, oneLiner, summary, funFact, topics } = card;
  return { id, label: name, name, reading, en, category, icon, oneLiner, summary, funFact, topics, keywords: [], entryPoint: null, queries: [], wiki: null };
}

function TopicList({ card, notes, onOpen }: { card: Card; notes: Map<string, DeepNote>; onOpen: (id: string) => void }) {
  if (card.topics.length === 0) {
    return <p className="mt-2 rounded-3xl bg-paper-2 p-5 text-[14px] text-ink-2">このカードには問いがありません。</p>;
  }
  return (
    <ul className="mt-3 grid gap-3">
      {card.topics.map((t, i) => {
        const done = notes.has(t.id);
        const [bg, ink] = TOPIC_COLORS[i % TOPIC_COLORS.length];
        return (
          <li key={t.id}>
            <motion.button
              layoutId={`topic-${t.id}`}
              onClick={() => onOpen(t.id)}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className="group flex w-full items-start gap-3 rounded-3xl bg-paper-2 p-4 text-left"
            >
              <span className="relative shrink-0">
                <motion.span layoutId={`topic-icon-${t.id}`} className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: bg, color: ink }}>
                  <Icon name={t.icon} size={26} fill />
                </motion.span>
                {done && (
                  <span className="absolute -bottom-1.5 -right-1.5 grid place-items-center rounded-full bg-paper-2 text-leaf">
                    <Icon name="check_circle" size={22} fill />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[11px] font-black tracking-wider text-ink-3">
                  {t.kind}
                  {done && <span className="sr-only">（読んだ）</span>}
                </span>
                <motion.span layoutId={`topic-title-${t.id}`} className="block text-[16px] font-black leading-snug">
                  {t.title}
                </motion.span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{t.teaser}</span>
              </span>
              <Icon name="chevron_right" size={24} className="mt-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}
