import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { skipTutorial, startTour, useWelcome, welcomeAhead } from '../lib/welcome';
import { TOUR_PAGES } from '../lib/tour';
import { haptic, onBack } from '../lib/native';
import { PrivacyLink } from '../screens/account/parts';
import { HelpHint, Tour } from './Tour';
import { dialogMotion, ui } from './theme';
import { Button } from './ui';
import { KidText } from './RubyText';

const SAMPLE = '/samples/desk.webp';

// Fetched while the age and consent screens are up, so the card opens with its photo already there.
if (typeof Image !== 'undefined' && welcomeAhead()) new Image().src = SAMPLE;

// Where the things sit in the sample photo (percent of width / height), shown the way the real result marks them.
const MARKS = [
  { label: 'ペットボトル', x: 35, y: 31 },
  { label: 'りんご', x: 64, y: 46 },
  { label: 'えんぴつ', x: 60, y: 71 },
  { label: '消しゴム', x: 41, y: 82 },
];

const STEPS = [
  { title: '撮《と》る', body: '気《き》になるモノを撮《と》る' },
  { title: 'えらぶ', body: '見《み》つかったモノの印《しるし》をタップ' },
  { title: '知《し》る', body: '解説《かいせつ》や問《と》いを読《よ》んで、図鑑《ずかん》に集《あつ》める' },
];

export function Welcome() {
  const state = useWelcome();
  return (
    <>
      <AnimatePresence>
        {state === 'open' && <Panel key="welcome" />}
        {state === 'tour' && <Tour key="tour" />}
      </AnimatePresence>
      <HelpHint />
    </>
  );
}

// The welcome card is the tutorial's first page: "つぎへ" moves on to the pages that light up each camera button.
function Panel() {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    haptic('select');
    start.current?.focus({ preventScroll: true });
    return onBack(skipTutorial, { history: false });
  }, []);

  return (
    <motion.div
      className={`${ui.overlay} z-[55] items-center`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button aria-label="スキップ" tabIndex={-1} className={ui.scrim} onClick={skipTutorial} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="welcome-title"
        {...dialogMotion}
        className={`${ui.dialog} max-h-full overflow-y-auto overscroll-contain p-3 pb-4 no-scrollbar`}
      >
        <Photo />
        <div className="px-3">
          {/* The first page of the tutorial: the same dots and "スキップ" as the pages that light up each button. */}
          <div className="mt-3 flex h-6 items-center justify-between">
            <ol aria-label={`${TOUR_PAGES}つ中 1つめ`} className="flex gap-1.5">
              {Array.from({ length: TOUR_PAGES }, (_, i) => (
                <li key={i} className={`h-1.5 rounded-full ${i === 0 ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20'}`} />
              ))}
            </ol>
            <button
              onClick={skipTutorial}
              className="-mr-2 flex h-11 items-center rounded-full px-2 text-[13px] font-bold text-ink-3 hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-accent"
            >
              スキップ
            </button>
          </div>
          <h2 id="welcome-title" className={`phrase-wrap mt-2 ${ui.title}`}>
            <KidText text="撮《と》るだけで、" />
            <br />
            モノシリになれる
          </h2>
          <p className={`phrase-wrap ${ui.lead}`}>
            <KidText text="身《み》の回《まわ》りのモノを撮《と》ると、写《うつ》っているモノを見《み》つけて、その「なぜ？」を教《おし》えてくれます。" />
          </p>
          <ol className="phrase-wrap mt-4 flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span aria-hidden className="w-5 shrink-0 text-right text-[20px] font-black leading-7 text-accent">
                  {i + 1}
                </span>
                <p className="text-[14px] leading-7 text-ink-2">
                  <span className="mr-2 text-[15px] font-black text-ink">
                    <KidText text={s.title} />
                  </span>
                  <KidText text={s.body} />
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-between gap-2">
            <PrivacyLink className="-ml-1 flex h-11 items-center px-1 text-[12px] text-ink-3" />
            <Button ref={start} onClick={startTour} className="outline-offset-4">
              つぎへ
            </Button>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

// The sample photo with markers popping in one by one, the same marks people will tap after taking a photo.
// Until the photo has loaded, a soft paper-coloured shimmer holds its place (not a black box); then it fades in.
function Photo() {
  const still = useReducedMotion();
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useLayoutEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true);
  }, []);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] bg-paper-2">
      {!loaded && <span aria-hidden className="skeleton absolute inset-0" />}
      <img
        ref={img}
        src={SAMPLE}
        alt="机の上のペットボトル、りんご、えんぴつ、消しゴムの写真"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        draggable={false}
      />
      {loaded && MARKS.map((m, i) => (
        <motion.span
          key={m.label}
          aria-hidden
          className="absolute grid place-items-center"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: 0, height: 0 }}
          initial={still ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20, delay: 0.45 + i * 0.16 }}
        >
          <span className="absolute h-8 w-8 rounded-full bg-white/35 animate-ping motion-reduce:animate-none" style={{ animationDuration: '1.8s', animationDelay: `${i * 0.2}s` }} />
          <span className="absolute h-4 w-4 rounded-full border-[3px] border-white bg-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)]" />
          <span className="absolute top-3 whitespace-nowrap rounded-full bg-black/55 px-2.5 text-[12px] font-bold leading-6 text-white backdrop-blur-md">
            {m.label}
          </span>
        </motion.span>
      ))}
    </div>
  );
}
