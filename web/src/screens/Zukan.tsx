import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CardDetail } from './CardDetail';
import { useCards } from '../lib/cards';
import type { Card } from '../lib/types';
import { clearReady, useIllustReady } from '../lib/illust';
import { CardFace } from '../components/CardFace';
import { EmptySlots } from '../components/LoadingCard';
import { Button, Icon, IconButton } from '../components/ui';
import { Phrases } from '../components/Phrases';
import { CATEGORY_STYLE, spring } from '../components/theme';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';
import { useStage } from '../lib/level';
import { stripRuby } from '../lib/ruby';
import { backfillUnits, cardsByUnit, SUBJECTS, unitById, UNITS } from '../lib/units';
import { UnitDetail, ZukanUnits } from './ZukanUnits';

type Mode = 'genre' | 'units';
const MODE_KEY = 'monoshiri.zukan.mode';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'units' && UNITS.length ? 'units' : 'genre';
  } catch {
    return 'genre';
  }
};

export function Zukan() {
  const cards = useCards();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { cardId?: string };
  const [cat, setCat] = useState<string>('すべて');
  const [q, setQ] = useState('');
  const [mode, setModeState] = useState<Mode>(readMode);
  const [subject, setSubject] = useState('すべて');
  const [unitId, setUnitId] = useState<string | null>(null);
  const { stage } = useStage();
  const cats = useMemo(() => ['すべて', ...Object.keys(CATEGORY_STYLE).filter((c) => cards.some((x) => x.category === c))], [cards]);
  const shown = cards.filter((c) => (cat === 'すべて' || c.category === cat) && (!q || stripRuby(`${c.name}${c.reading}${c.en}`).toLowerCase().includes(q.toLowerCase())));
  const notes = cards.reduce((n, c) => n + c.notes.length, 0);
  const have = useMemo(() => cardsByUnit(cards), [cards]);
  const subjects = useMemo(() => SUBJECTS.filter((s) => [...have.keys()].some((id) => unitById.get(id)?.subject === s)), [have]);
  const subj = subjects.includes(subject) ? subject : 'すべて';
  const backTo = useBackTo();
  const toCamera = () => backTo('/');
  // Registered once so layers opened inside the zukan (a unit) stay above it in the back stack.
  useEffect(() => onBack(() => backTo('/'), { history: false }), [backTo]);
  useEffect(() => {
    void backfillUnits(cards);
  }, [cards]);
  useEffect(() => {
    if (mode === 'units') void api.events([{ name: 'zukan_units' }]);
  }, [mode]);
  const setMode = (m: Mode) => {
    setModeState(m);
    setUnitId(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* the zukan just opens on genres next time */
    }
  };
  const scrollBack = useRef(0);
  const openUnit = (id: string) => {
    scrollBack.current = document.getElementById('zukan-scroll')?.scrollTop ?? 0;
    if (mode !== 'units') setMode('units');
    setUnitId(id);
  };
  const closeUnit = useCallback(() => {
    setUnitId(null);
    requestAnimationFrame(() => document.getElementById('zukan-scroll')?.scrollTo({ top: scrollBack.current }));
  }, []);
  // Inside the zukan the card itself fades its new art in, so the bubble on the camera screen isn't needed.
  const ready = useIllustReady();
  useEffect(() => {
    if (ready) clearReady();
  }, [ready]);

  const open = (id: string) => navigate({ to: '/zukan/$cardId', params: { cardId: id } });

  return (
    <>
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-paper paper-grain" id="zukan-scroll">
        <header className="sticky top-0 z-20 bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] sm:px-6">
            <div className="flex items-center gap-2">
              <IconButton icon="arrow_back" label="カメラにもどる" onClick={toCamera} />
              <span className="hidden sm:block"><Logo /></span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
            <h1 className="text-[clamp(28px,5vw,44px)] font-black leading-tight">モノシリ図鑑</h1>
            {/* On a phone the counts sit in an even 2 × 2 grid; wider screens keep them in one row. */}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <Stat icon="style" label="あつめたカード" value={cards.length} />
              <Stat icon="explore" label="深掘りしたテーマ" value={notes} />
              <Stat icon="category" label="ジャンル" value={`${cats.length - 1}/${Object.keys(CATEGORY_STYLE).length}`} />
              {UNITS.length > 0 && <Stat icon="school" label="学校の単元" value={have.size} />}
            </div>
          </motion.section>

          {(cards.length > 0 || UNITS.length > 0) && (
            <div className="sticky top-[calc(max(env(safe-area-inset-top),14px)+60px)] z-10 -mx-4 mt-5 bg-paper/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
              <div className="flex items-center gap-2">
                {UNITS.length > 0 && (
                  <div className="flex shrink-0 rounded-full bg-paper-2 p-1" role="tablist" aria-label="図鑑の見かた">
                    {([['genre', 'ジャンル', 'category'], ['units', '教科でみる', 'school']] as const).map(([m, label, icon]) => (
                      <motion.button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => setMode(m)}
                        whileTap={{ scale: 0.97 }}
                        transition={spring}
                        className="relative flex h-9 items-center gap-1 rounded-full px-3 text-[14px] font-bold"
                      >
                        {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-card)]" transition={spring} />}
                        <span className={`relative flex items-center gap-1 ${mode === m ? 'text-ink' : 'text-ink-3'}`}>
                          <Icon name={icon} size={18} fill={mode === m} />
                          {label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
                {(mode === 'units' ? !unitId && have.size > 0 : cards.length > 0) && (
                  <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-paper-2 px-4 sm:max-w-xs">
                    <Icon name="search" size={20} className="text-ink-3" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={mode === 'units' ? '単元やモノをさがす' : 'カードをさがす'}
                      aria-label={mode === 'units' ? '単元やモノをさがす' : 'カードをさがす'}
                      className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
                    />
                  </label>
                )}
              </div>
              {mode === 'genre' && cards.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {cats.map((c) => (
                    <motion.button key={c} onClick={() => setCat(c)} whileTap={{ scale: 0.97 }} transition={spring} className="relative shrink-0 rounded-full px-4 py-1.5 text-[14px] font-bold">
                      {cat === c && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
                      <span className={`relative ${cat === c ? 'text-paper' : 'text-ink-2'}`}>{c}</span>
                    </motion.button>
                  ))}
                </div>
              )}
              {mode === 'units' && !unitId && subjects.length > 1 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {['すべて', ...subjects].map((c) => (
                    <motion.button key={c} onClick={() => setSubject(c)} whileTap={{ scale: 0.97 }} transition={spring} className="relative shrink-0 rounded-full px-4 py-1.5 text-[14px] font-bold">
                      {subj === c && <motion.span layoutId="subject-pill" className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
                      <span className={`relative ${subj === c ? 'text-paper' : 'text-ink-2'}`}>{c}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'units' ? (
            unitId ? (
              <UnitDetail unitId={unitId} cards={cards} stage={stage} onClose={closeUnit} onOpenCard={open} />
            ) : (
              <ZukanUnits cards={cards} q={q} subject={subj} stage={stage} onOpenUnit={openUnit} />
            )
          ) : cards.length === 0 ? (
            <div className="mt-8 overflow-hidden rounded-[32px] bg-paper-2">
              <EmptySlots />
              <div className="px-6 pb-8 text-center">
                <p className="text-[20px] font-black">まだカードがありません</p>
                <p className="phrase-wrap mt-1 text-ink-2">
                  <Phrases text="身の回りのモノを撮って、最初の1枚を手に入れよう！" />
                </p>
              </div>
            </div>
          ) : (
            <CardGrid shown={shown} cards={cards} onOpen={open} />
          )}
          {mode === 'genre' && cards.length > 0 && shown.length === 0 && <p className="mt-10 text-center text-ink-3">見つかりませんでした</p>}
        </main>
      </div>
      {/* The only ways back to the camera are this and the arrow at the top left; hidden while a unit or a card is open. */}
      <AnimatePresence>
        {!unitId && !params.cardId && (
          <motion.div
            key="go"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={spring}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            <Button icon="photo_camera" onClick={toCamera} className="pointer-events-auto h-13 px-7 shadow-[var(--shadow-float)]">
              さがしに行く
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{params.cardId && cards.some((c) => c.id === params.cardId) && <CardDetail key={params.cardId} cardId={params.cardId} />}</AnimatePresence>
    </>
  );
}

// Kept apart from the route params so opening or closing a card does not re-render (and re-measure) every card.
// CardDetail hides the card it is showing and flies back onto it (data-card-id).
function CardGrid({ shown, cards, onOpen }: { shown: Card[]; cards: Card[]; onOpen: (id: string) => void }) {
  // Layout animations only need a fresh measurement when the set of cards (or their height) changes.
  const layoutKey = shown.map((c) => `${c.id}:${c.notes.length > 0}`).join();
  return (
    <motion.ul layout layoutDependency={layoutKey} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {/* No entrance pop on first open: the zukan is already sliding in, and two dozen JS-driven springs at once drop frames. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {shown.map((c, i) => (
          <motion.li
            key={c.id}
            layout
            layoutDependency={layoutKey}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(i, 12) * 0.035 }}
          >
            <motion.button data-card-id={c.id} onClick={() => onOpen(c.id)} whileTap={{ scale: 0.97 }} transition={spring} className="block w-full text-left">
              <CardFace card={c} no={cards.length - cards.indexOf(c)} />
            </motion.button>
            {c.notes.length > 0 && (
              <p className="mt-2 flex items-center gap-1 px-1 text-[12px] font-bold text-ink-3">
                <Icon name="explore" size={14} fill /> {c.notes.length}テーマ深掘り
              </p>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-paper-2 px-4 py-2.5">
      <Icon name={icon} size={22} fill className="text-accent" />
      <div className="leading-tight">
        <div className="text-[11px] font-bold text-ink-3">{label}</div>
        <div className="text-[20px] font-black tabular-nums">{value}</div>
      </div>
    </div>
  );
}
