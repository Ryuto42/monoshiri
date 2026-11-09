import { animate, AnimatePresence, motion, useMotionValue, usePresence, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@tanstack/react-router';
import { getCard, removeCard, saveCard, useCards } from '../lib/cards';
import { api } from '../lib/api';
import type { Card, DeepNote, Explore, UnitLink } from '../lib/types';
import { CardFace } from '../components/CardFace';
import { MoreSearch } from '../components/MoreSearch';
import { Speak } from '../components/Speak';
import { useFlip } from '../lib/flip';
import { toast } from '../lib/toast';
import { Button, Icon, IconButton } from '../components/ui';
import { catStyle, spring, TOPIC_COLORS } from '../components/theme';
import { haptic } from '../lib/native';
import { TopicPanel } from './TopicPanel';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { useSwipeDismiss } from '../lib/useSwipeDismiss';
import { RubyText } from '../components/RubyText';
import { UnitChips } from '../components/UnitChips';
import { stripRuby } from '../lib/ruby';
import { useStage, type Stage } from '../lib/level';
import { unitById, unitStatus, useUnitLinks } from '../lib/units';

const gridCard = (id: string) =>
  document.querySelector<HTMLElement>(`#zukan-scroll [data-card-open][data-card-id="${CSS.escape(id)}"]`) ??
  document.querySelector<HTMLElement>(`#zukan-scroll [data-card-id="${CSS.escape(id)}"]`);

// Where the card should land in the zukan; scrolls it into view (under the cover of the detail) when it is off screen.
function landing(grid: HTMLElement) {
  const scroller = document.getElementById('zukan-scroll');
  let r = grid.getBoundingClientRect();
  if (!r.width) return null;
  if (scroller) {
    const top = Math.max(0, ...[...scroller.querySelectorAll('.sticky')].map((e) => e.getBoundingClientRect().bottom));
    if (r.top < top || r.bottom > window.innerHeight) {
      scroller.scrollTop += r.top - (top + (window.innerHeight - top - r.height) / 2);
      r = grid.getBoundingClientRect();
    }
  }
  return r;
}

const FLIP = { type: 'spring', stiffness: 140, damping: 18 } as const;

export function CardDetail({ cardId }: { cardId: string }) {
  const reduced = useReducedMotion();
  const cards = useCards();
  const card = cards.find((c) => c.id === cardId);
  const [flipped, setFlipped] = useState(false);
  const flip = useFlip(flipped, FLIP);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [explore, setExplore] = useState<Explore | null>(null);
  const backTo = useBackTo();
  const close = () => backTo('/zukan');
  const router = useRouter();
  // Every way of closing (button, swipe, back button, Escape, browser back) only changes the route;
  // the exit below then flies the card back onto its place in the grid before the detail is removed.
  const [isPresent, safeToRemove] = usePresence();

  // Registered once (the router is stable) so a topic panel opened later stays above this layer in the back stack.
  // Dropped as soon as the exit starts, so a second back press goes to the zukan's layer, not here again.
  useEffect(
    () =>
      isPresent
        ? onBack(
            () => {
              if (router.history.canGoBack()) router.history.back();
              else void router.navigate({ to: '/zukan', replace: true });
            },
            { history: false },
          )
        : undefined,
    [router, isPresent],
  );
  // The card itself is what this shows; only the extras (Wikipedia, Google suggestions) come from the server. They are
  // the same at every stage, so they are read from the standard explanation, and only when /api/known says it is cached:
  // asking at the current stage would quietly write a new explanation for a stage the card was never read at.
  const name = card?.name;
  useEffect(() => {
    if (!name) return;
    let live = true;
    api
      .known(name)
      .then(({ known }) => (known && live ? api.explore(name, undefined, undefined, 'std') : null))
      .then((ex) => live && ex && setExplore(ex))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  const { stage } = useStage();
  const links = useUnitLinks(name);
  // Cards saved before units existed get them now (see backfillUnits); a failed lookup just leaves the card as it was.
  const missing = !!card && !card.units;
  useEffect(() => {
    if (!missing || !links) return;
    const latest = getCard(cardId);
    if (latest && !latest.units) void saveCard({ ...latest, units: links.map((l) => l.id), updatedAt: Date.now() }).catch(() => {});
  }, [missing, links, cardId]);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLButtonElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const fades = useRef<(HTMLElement | null)[]>([]);
  const intro = useRef<HTMLDivElement>(null);
  const opening = useRef<Animation | null>(null);

  // Pulling down shrinks the whole detail around the card, which follows the finger, like closing a photo in a gallery app.
  const dragX = useMotionValue(0), dragY = useMotionValue(0);
  const pivotX = useMotionValue(0), pivotY = useMotionValue(0);
  const shrink = useTransform(dragY, (v) => 1 - 0.4 * Math.min(1, Math.max(0, v) / (window.innerHeight * 0.6)));
  const x = useTransform(() => pivotX.get() * (1 - shrink.get()) + dragX.get());
  const y = useTransform(() => pivotY.get() * (1 - shrink.get()) + dragY.get());
  const entry = useMotionValue(0);
  const scrimOpacity = useTransform(() => entry.get() * (1 - 0.7 * Math.min(1, Math.max(0, dragY.get()) / 400)));
  useSwipeDismiss({
    y: dragY,
    x: dragX,
    areas: [scroller],
    onStart: () => {
      const c = content.current?.getBoundingClientRect(), f = face.current?.getBoundingClientRect();
      if (!c || !f) return;
      pivotX.set(f.left + f.width / 2 - c.left);
      pivotY.set(f.top + f.height / 2 - c.top);
    },
    onDismiss: close,
    enabled: isPresent,
  });

  // Open: grow out of the card in the grid (FLIP on the compositor, so mounting the detail can't stall it).
  useLayoutEffect(() => {
    const el = face.current;
    if (!el) return;
    if (reduced) { entry.set(1); return; }
    const grid = gridCard(cardId);
    const from = grid?.getBoundingClientRect();
    if (grid) grid.style.visibility = 'hidden';
    const fade = animate(entry, 1, { duration: 0.3, ease: 'easeOut' });
    const to = el.getBoundingClientRect();
    if (from && from.width > 0 && from.bottom > 0 && from.top < window.innerHeight) {
      const t = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
      opening.current = el.animate([{ transform: t }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.04)' });
    } else {
      opening.current = el.animate([{ transform: 'translateY(48px) scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    return () => {
      fade.stop();
      opening.current?.cancel();
      if (grid) grid.style.visibility = '';
    };
  }, [cardId, entry, reduced]);

  // Close: shrink the detail so the card lands exactly on its grid slot, cross-fading into it at the end.
  useEffect(() => {
    if (isPresent) return;
    if (reduced) return void safeToRemove?.();
    const box = scroller.current, c = content.current, el = face.current;
    if (!box || !c || !el) return void safeToRemove?.();
    box.style.pointerEvents = 'none';
    dragX.stop();
    dragY.stop();
    // Freeze an unfinished opening where it is; the flight starts from what is on screen.
    if (opening.current?.playState === 'running') {
      const m = getComputedStyle(el).transform;
      opening.current.cancel();
      el.style.transform = m === 'none' ? '' : m;
      el.style.opacity = '1';
    }
    const D = 440;
    const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
    const fadeOut = (e: HTMLElement | null, duration: number) =>
      e?.animate([{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' });
    fades.current.forEach((e) => fadeOut(e, 180));
    fadeOut(scrim.current, 300);

    const grid = gridCard(cardId);
    const target = grid && landing(grid);
    const s = shrink.get(), dx = x.get(), dy = y.get();
    const from = `translate(${dx}px, ${dy}px) scale(${s})`;
    let to: string;
    if (grid && target) {
      // The content is transformed around its top-left corner: screen = origin + d + (p - origin) * s.
      const v = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      const ox = b.left + c.offsetLeft - box.scrollLeft, oy = b.top + c.offsetTop - box.scrollTop;
      const k = (s * target.width) / v.width;
      const rx = (v.left - ox - dx) / s, ry = (v.top - oy - dy) / s;
      to = `translate(${target.left - ox - rx * k}px, ${target.top - oy - ry * k}px) scale(${k})`;
      el.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.6 }, { opacity: 0, offset: 1 }], { duration: D, fill: 'forwards' });
    } else {
      to = `translate(${dx}px, ${dy + 40}px) scale(${s * 0.9})`;
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D * 0.6, easing: 'ease-out', fill: 'forwards' });
    }
    const reveal = setTimeout(() => grid && (grid.style.visibility = ''), D * 0.55);
    const fly = c.animate([{ transform: from }, { transform: to }], { duration: D, easing: ease, fill: 'forwards' });
    fly.finished.then(() => safeToRemove?.(), () => {});
    return () => clearTimeout(reveal);
  }, [isPresent, safeToRemove, reduced, cardId, dragX, dragY, shrink, x, y]);

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
    void saveCard({ ...latest, notes: [...latest.notes.filter((x) => x.topicId !== n.topicId), n], updatedAt: Date.now() }).catch(() => toast('カードをしまえませんでした。もう一度《いちど》ためしてね'));
  };

  return (
    <div role="dialog" aria-modal aria-labelledby="card-detail-title" ref={scroller} className="fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <motion.div ref={scrim} className="fixed inset-0 bg-[#120e0b]/70 backdrop-blur-md" style={{ opacity: scrimOpacity }} onClick={close} />
      <motion.div
        ref={content}
        style={{ x, y, scale: shrink, originX: 0, originY: 0, willChange: 'transform' }}
        className="relative mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 px-5 pb-16 pt-[max(env(safe-area-inset-top),20px)] lg:flex-row lg:items-start lg:pt-16"
      >
        {/* min-w-0 on the panel below keeps long content from widening it past this button's right edge (on a PC the
            button sat well inside the panel's corner). */}
        <div ref={(e) => void (fades.current[0] = e)} className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] z-10 lg:right-5">
          <IconButton icon="close" label="とじる" tone="glass" onClick={close} />
        </div>

        <div className="w-[min(80vw,340px)] shrink-0 lg:sticky lg:top-16">
          <button ref={face} onClick={() => setFlipped((f) => !f)} className="block w-full origin-top-left [perspective:1400px]" aria-label={flipped ? 'カードのうらを表示中。おもてにする' : 'カードのおもてを表示中。うらにする'}>
            <motion.div className="relative [transform-style:preserve-3d]" style={{ rotateY: flip.rotateY }}>
              <motion.div aria-hidden={flipped} className="[backface-visibility:hidden]" style={{ opacity: flip.front }}>
                <CardFace card={card} no={no} size="lg" />
              </motion.div>
              <motion.div aria-hidden={!flipped} className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ opacity: flip.back }}>
                <div className="flex h-full flex-col overflow-y-auto overscroll-contain rounded-[22px] bg-[#fffdf8] p-5 text-left text-[#2a2017] shadow-[var(--shadow-float)]">
                  <span className="text-[12px] font-black" style={{ color: c.ink }}>No.{String(no).padStart(3, '0')} ・ {card.category}</span>
                  <span className="text-[22px] font-black">{card.name}</span>
                  <span className="mt-2 text-[14px] leading-relaxed text-[#66574a]"><RubyText text={card.summary} /></span>
                  <span className="mt-auto shrink-0 rounded-2xl p-3 text-[13px] font-bold leading-relaxed" style={{ background: c.bg, color: c.ink }}>
                    知ってた？ <RubyText text={card.funFact} />
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </button>
          <p ref={(e) => void (fades.current[1] = e)} className="mt-3 text-center text-[13px] font-bold text-white/70">タップでうらがえす</p>
        </div>

        <motion.section
          ref={(e) => void (fades.current[2] = e)}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.15, type: 'spring', stiffness: 260, damping: 28 } }}
          className="w-full min-w-0 flex-1 rounded-[32px] bg-paper p-6 text-ink shadow-[var(--shadow-float)]"
        >
          <div ref={intro}>
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[12px] font-bold tracking-wider text-ink-3">{card.reading}・{card.en}</p>
              <Speak target={intro} text={`知ってた？${stripRuby(card.funFact)}`} ttsRef={{ name: card.name }} compact />
            </div>
            <h2 id="card-detail-title" data-speak className="text-[30px] font-black leading-tight">{card.name}</h2>
            {card.firstFind && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--sun)_30%,var(--paper))] py-1 pl-1.5 pr-3 text-[13px] font-black">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-sun text-[#5a3b00]">
                  <Icon name="flag" size={15} fill />
                </span>
                モノシリで最初に見つけたモノ
              </p>
            )}
            <p data-speak className="mt-2 text-[17px] font-bold text-accent"><RubyText text={card.oneLiner} /></p>
            <p data-speak className="mt-3 text-ink-2"><RubyText text={card.summary} /></p>
          </div>
          <div className="mt-4 flex gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--sun)_22%,var(--paper))] p-4">
            <Icon name="lightbulb" size={26} fill className="mt-0.5 shrink-0 text-[#b7800b]" />
            <div>
              <p className="text-[12px] font-black text-[#9a6b06]">知ってた？</p>
              <p className="text-[15px] font-bold leading-relaxed"><RubyText text={card.funFact} /></p>
            </div>
          </div>

          <CardUnits links={links} ids={card.units} stage={stage} />

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
          <MoreSearch name={card.name} entry={explore?.entryPoint} />
          {/* Rarely needed and can't be undone, so it is last and quiet. */}
          <div className="mt-10 flex justify-center">
            <Button
              tone="subtle"
              size="sm"
              icon="delete"
              onClick={async () => {
                if (!confirm(`「${card.name}」のカードを図鑑から外しますか？`)) return;
                close();
                await removeCard(card.id);
                toast('カードを外しました', 'delete');
              }}
            >
              図鑑から外す
            </Button>
          </div>
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
    </div>
  );
}

// Enough of an explanation to open a topic before (or without) the server copy arriving.
function asExplore(card: Card): Explore {
  const { id, name, reading, en, category, icon, oneLiner, summary, funFact, topics } = card;
  return { id, label: name, name, reading, en, category, icon, oneLiner, summary, funFact, topics, keywords: [], entryPoint: null, queries: [], wiki: null };
}

// The saved ids are enough to list the units; the reasons come from the (cached) lookup when it is available.
function CardUnits({ links, ids, stage }: { links: UnitLink[] | null; ids?: string[]; stage: Stage | null }) {
  // Units from school years already behind this person aren't listed.
  const list = (links ?? ids?.map((id) => ({ id, why: '' })) ?? []).filter((l) => {
    const u = unitById.get(l.id);
    return u && unitStatus(u, stage) !== 'done';
  });
  if (!list.length) return null;
  return (
    <section className="mt-8" aria-label="学校でならうよ">
      <h3 className="flex items-center gap-2 text-[18px] font-black">
        <Icon name="school" size={22} fill className="text-accent" /> 学校でならうよ
      </h3>
      <UnitChips links={list} stage={stage} className="mt-3" />
    </section>
  );
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
                  <RubyText text={t.title} />
                </motion.span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2"><RubyText text={t.teaser} /></span>
              </span>
              <Icon name="chevron_right" size={24} className="mt-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}
