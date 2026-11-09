import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CardDetail } from './CardDetail';
import { useCards, useCardsLoaded } from '../lib/cards';
import type { Card } from '../lib/types';
import { clearReady, useIllustReady } from '../lib/illust';
import { CardFace } from '../components/CardFace';
import { EmptySlots } from '../components/LoadingCard';
import { Button, Icon, IconButton } from '../components/ui';
import { KidText } from '../components/RubyText';
import { CATEGORY_STYLE, spring } from '../components/theme';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';
import { useStage } from '../lib/level';
import { normalizeSearch } from '../lib/search';
import { toast } from '../lib/toast';
import { backfillUnits, cardsByUnit, SUBJECTS, unitById, UNITS } from '../lib/units';
import { ZukanUnits } from './ZukanUnits';

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
  const loaded = useCardsLoaded();

  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { cardId?: string };
  const [cat, setCat] = useState<string>('すべて');
  // A link to a card that isn't here (deleted elsewhere, or a wrong URL) falls back to the zukan. Cards seen during this
  // visit don't count: removing the open card also leaves its URL for a moment.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    cards.forEach((c) => seen.current.add(c.id));
  }, [cards]);
  useEffect(() => {
    if (loaded && params.cardId && !seen.current.has(params.cardId) && !cards.some((c) => c.id === params.cardId)) {
      void navigate({ to: '/zukan', replace: true });
      toast('カードが見《み》つかりませんでした');
    }
  }, [loaded, params.cardId, cards, navigate]);
  const [q, setQ] = useState('');
  const [mode, setModeState] = useState<Mode>(readMode);
  const [subject, setSubject] = useState('すべて');
  const { stage } = useStage();
  const cats = useMemo(() => ['すべて', ...Object.keys(CATEGORY_STYLE).filter((c) => cards.some((x) => x.category === c))], [cards]);
  const shown = cards.filter((c) => (cat === 'すべて' || c.category === cat) && (!q || normalizeSearch(`${c.name}${c.reading}${c.en}`).includes(normalizeSearch(q))));
  const notes = cards.reduce((n, c) => n + c.notes.length, 0);
  const have = useMemo(() => cardsByUnit(cards), [cards]);
  const subjects = useMemo(() => SUBJECTS.filter((s) => [...have.keys()].some((id) => unitById.get(id)?.subject === s)), [have]);
  const subj = subjects.includes(subject) ? subject : 'すべて';
  const backTo = useBackTo();
  const toCamera = () => backTo('/');
  useEffect(() => onBack(() => backTo('/'), { history: false }), [backTo]);
  useEffect(() => {
    void backfillUnits(cards);
  }, [cards]);
  useEffect(() => {
    if (mode === 'units') void api.events([{ name: 'zukan_units' }]);
  }, [mode]);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* the zukan just opens on genres next time */
    }
  };
  // Inside the zukan the card itself fades its new art in, so the bubble on the camera screen isn't needed.
  const ready = useIllustReady();
  useEffect(() => {
    if (ready) clearReady();
  }, [ready]);

  // A card can sit under several units, so the one that was tapped is marked for CardDetail to fly back onto.
  // Changing the filter while scrolled down brings the top of the new list up under the bar, instead of leaving the view
  // somewhere past its end.
  const bar = useRef<HTMLDivElement>(null);
  const toListTop = () => {
    const scroller = document.getElementById('zukan-scroll');
    const grid = document.getElementById('zukan-grid');
    const barBottom = bar.current?.getBoundingClientRect().bottom ?? 0;
    if (scroller && grid && grid.getBoundingClientRect().top < barBottom) scroller.scrollTop += grid.getBoundingClientRect().top - barBottom - 16;
  };
  const pickCat = (c: string) => {
    setCat(c);
    toListTop();
  };
  const pickSubject = (c: string) => {
    setSubject(c);
    toListTop();
  };
  const open = (id: string, el?: HTMLElement) => {
    document.querySelectorAll('[data-card-open]').forEach((e) => e.removeAttribute('data-card-open'));
    el?.setAttribute('data-card-open', '');
    void navigate({ to: '/zukan/$cardId', params: { cardId: id } });
  };
  // The filter bar sticks right under the header. Its height depends on the safe area, so it is measured: a guessed
  // offset left a sliver between the two where cards showed through while scrolling. Both are opaque for the same reason.
  const head = useRef<HTMLElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useLayoutEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-paper paper-grain" id="zukan-scroll">
        <header ref={head} className="sticky top-0 z-20 bg-paper">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-1.5 pt-[max(env(safe-area-inset-top),6px)] sm:px-6">
            <div className="flex items-center gap-2">
              <IconButton icon="arrow_back" label="カメラにもどる" onClick={toCamera} />
              <span className="hidden sm:block"><Logo /></span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
            <h1 className="text-[clamp(28px,5vw,44px)] font-black leading-tight">
              <KidText text="モノシリ図鑑《ずかん》" />
            </h1>
            {/* On a phone the counts sit in an even 2 × 2 grid; wider screens keep them in one row. */}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <Stat icon="style" label="あつめたカード" value={cards.length} />
              <Stat icon="explore" label="深掘りしたテーマ" value={notes} />
              <Stat icon="category" label="ジャンル" value={`${cats.length - 1}/${Object.keys(CATEGORY_STYLE).length}`} />
              {UNITS.length > 0 && <Stat icon="school" label="学校の単元" value={have.size} />}
            </div>
          </motion.section>

          {(cards.length > 0 || UNITS.length > 0) && (
            <div
              ref={bar}
              // The opaque band behind the bar spans the whole window and reaches a little up under the header, so no sliver
              // shows between the two at any width or zoom (on a PC it used to stop at the content's width).
              className="sticky z-10 mt-5 py-2 before:absolute before:-top-2 before:bottom-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-paper before:shadow-[0_10px_14px_-12px_rgb(0_0_0/0.45)] before:content-['']"
              style={{ top: headHeight }}
            >
              <div className="flex items-center gap-2">
                {UNITS.length > 0 && (
                  <div className="flex shrink-0 rounded-full bg-paper-2 px-1" role="tablist" aria-label="図鑑の見かた">
                    {([['genre', 'ジャンル', 'category'], ['units', '教科', 'school']] as const).map(([m, label, icon]) => (
                      <motion.button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => setMode(m)}
                        whileTap={{ scale: 0.97 }}
                        transition={spring}
                        className="hit-44 relative flex h-9 items-center gap-1 rounded-full px-3 text-[14px] font-bold"
                      >
                        {mode === m && <motion.span layoutId="mode-pill" className="hit-pill absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-tab)]" transition={spring} />}
                        <span className={`relative flex items-center gap-1 ${mode === m ? 'text-ink' : 'text-ink-3'}`}>
                          <Icon name={icon} size={18} fill={mode === m} />
                          {label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
                {(mode === 'units' ? have.size > 0 : cards.length > 0) && (
                  <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-paper-2 px-4 sm:max-w-xs">
                    <Icon name="search" size={20} className="text-ink-3" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="さがす"
                      aria-label={mode === 'units' ? '単元やモノをさがす' : 'カードをさがす'}
                      className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
                    />
                  </label>
                )}
              </div>
              {mode === 'genre' && cards.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {cats.map((c) => (
                    <motion.button key={c} aria-pressed={cat === c} onClick={() => pickCat(c)} whileTap={{ scale: 0.97 }} transition={spring} className="filter-pill hit-44 relative shrink-0 rounded-full px-4 py-1.5 text-[14px] font-bold">
                      {cat === c && <motion.span layoutId="cat-pill" className="hit-pill absolute inset-0 rounded-full bg-ink" transition={spring} />}
                      <span className={`relative ${cat === c ? 'text-paper' : 'text-ink-2'}`}>{c}</span>
                    </motion.button>
                  ))}
                </div>
              )}
              {mode === 'units' && subjects.length > 1 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {['すべて', ...subjects].map((c) => (
                    <motion.button key={c} aria-pressed={subj === c} onClick={() => pickSubject(c)} whileTap={{ scale: 0.97 }} transition={spring} className="filter-pill hit-44 relative shrink-0 rounded-full px-4 py-1.5 text-[14px] font-bold">
                      {subj === c && <motion.span layoutId="subject-pill" className="hit-pill absolute inset-0 rounded-full bg-ink" transition={spring} />}
                      <span className={`relative ${subj === c ? 'text-paper' : 'text-ink-2'}`}>{c}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Both views come in the same way: a short fade in place. Not initial={false}: it would also hold back the fade of
              a new genre or subject inside the view the zukan opened on. */}
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {mode === 'units' ? (
                <ZukanUnits cards={cards} q={q} subject={subj} stage={stage} onOpenCard={open} />
              ) : cards.length === 0 ? (
                <div className="mt-8 overflow-hidden rounded-[32px] bg-paper-2">
                  <EmptySlots />
                  <div className="px-6 pb-8 text-center">
                    <p className="phrase-wrap text-[20px] font-black">
                      <KidText text="まだカードがありません" />
                    </p>
                    <p className="phrase-wrap mt-1 text-ink-2">
                      <KidText text="身《み》の回《まわ》りのモノを撮《と》って、最初《さいしょ》の1枚《まい》を手《て》に入《い》れよう！" />
                    </p>
                  </div>
                </div>
              ) : (
                <CardGrid shown={shown} cards={cards} filter={cat} onOpen={open} />
              )}
              {mode === 'genre' && cards.length > 0 && shown.length === 0 && (
                <p className="phrase-wrap mt-10 text-center text-ink-3">
                  <KidText text="見《み》つかりませんでした" />
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {/* The only ways back to the camera are this and the arrow at the top left; hidden while a card is open. A soft fade
          of the paper behind it keeps it apart from the cards scrolling underneath. */}
      <AnimatePresence>
        {!params.cardId && (
          <motion.div
            key="go"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={spring}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-linear-to-t from-paper/85 via-paper/50 to-transparent px-4 pt-10 pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            <Button icon="photo_camera" onClick={toCamera} className="pointer-events-auto h-13 px-7 shadow-[var(--shadow-float)]">
              <KidText text="さがしに行《い》く" />
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
function CardGrid({ shown, cards, filter, onOpen }: { shown: Card[]; cards: Card[]; filter: string; onOpen: (id: string, el: HTMLElement) => void }) {
  // A new filter fades the grid in place. Cards used to slide to their new spots, but the page got shorter and the
  // scroll position moved with it, so they seemed to fly in from odd places.
  return (
    <motion.ul
      key={filter}
      id="zukan-grid"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      // On a PC the cards keep a card's width and the row sits in the middle, so a short zukan doesn't hug the left edge.
      className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(200px,236px))] lg:justify-center"
    >
      {shown.map((c) => (
        <li key={c.id}>
          <motion.button data-card-id={c.id} onClick={(e) => onOpen(c.id, e.currentTarget)} whileTap={{ scale: 0.97 }} transition={spring} className="block w-full text-left">
            <CardFace card={c} no={cards.length - cards.indexOf(c)} />
          </motion.button>
          {c.notes.length > 0 && (
            <p className="mt-2 flex items-center gap-1 px-1 text-[12px] font-bold text-ink-3">
              <Icon name="explore" size={14} fill /> {c.notes.length}テーマ深掘り
            </p>
          )}
        </li>
      ))}
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
