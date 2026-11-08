import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { closeWelcome, trySample, useWelcome } from '../lib/welcome';
import { saveStage, useStage, type Stage } from '../lib/level';
import { haptic, onBack } from '../lib/native';
import { toast } from '../lib/toast';
import { StagePicker } from './StagePicker';
import { Icon } from './ui';
import { spring } from './theme';

const SAMPLE = '/samples/desk.webp';

// Where the things sit in the sample photo (percent of width / height), shown the way the real result marks them.
const MARKS = [
  { label: 'ペットボトル', x: 35, y: 31 },
  { label: 'りんご', x: 64, y: 46 },
  { label: 'えんぴつ', x: 60, y: 71 },
  { label: '消しゴム', x: 41, y: 82 },
];

const STEPS = [
  { title: '撮る', body: '気になるモノを撮る' },
  { title: 'えらぶ', body: '見つかったモノの印をタップ' },
  { title: '知る', body: '解説や問いを読んで、図鑑に集める' },
];

export function Welcome() {
  const state = useWelcome();
  return <AnimatePresence>{state === 'open' && <Panel key="welcome" />}</AnimatePresence>;
}

// What to do once the welcome is over: open the camera, or try the sample photo.
type Then = 'camera' | 'sample';

function Panel() {
  const start = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { stage } = useStage();
  // The last step asks for the school year, only for people who have no stage yet.
  const [asking, setAsking] = useState<Then | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    haptic('select');
    start.current?.focus({ preventScroll: true });
    return onBack(closeWelcome, { history: false });
  }, []);

  const finish = (then: Then) => (then === 'sample' ? void trySample(SAMPLE) : closeWelcome());
  const next = (then: Then) => (stage ? finish(then) : setAsking(then));

  async function save(s: Stage) {
    setSaving(true);
    try {
      await saveStage(s);
      haptic('success');
    } catch {
      toast('ほぞんできませんでした。アカウントの画面から あとで えらべるよ', 'error');
    } finally {
      setSaving(false);
    }
    if (asking) finish(asking);
  }

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-end justify-center p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button aria-label="とじる" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={closeWelcome} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="welcome-title"
        initial={{ y: 80, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 60, scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="relative max-h-[calc(100dvh-24px)] w-full max-w-[420px] overflow-y-auto rounded-[32px] bg-paper p-3 pb-4 text-ink shadow-[var(--shadow-float)] paper-grain"
      >
        <AnimatePresence mode="wait" initial={false}>
          {asking ? (
            <motion.div key="stage" className="px-3 pt-2" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={spring}>
              <StagePicker
                initial={null}
                saving={saving}
                titleId="welcome-title"
                onSave={(s) => void save(s)}
                onSkip={() => finish(asking)}
                saveLabel={asking === 'sample' ? 'これで ためしてみる' : 'これで はじめる'}
              />
            </motion.div>
          ) : (
            <motion.div key="intro" exit={{ opacity: 0, x: -40 }} transition={spring}>
              <Photo />
              <div className="px-3">
                <h2 id="welcome-title" className="mt-5 text-[24px] font-black leading-snug">
                  撮るだけで、
                  <br />
                  モノシリになれる
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  身の回りのモノを撮ると、写っているモノを見つけて、その「なぜ？」を教えてくれます。
                </p>
                <ol className="mt-4 flex flex-col gap-2">
                  {STEPS.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span aria-hidden className="w-5 shrink-0 text-right text-[20px] font-black leading-7 text-accent">
                        {i + 1}
                      </span>
                      <p className="text-[14px] leading-7 text-ink-2">
                        <span className="mr-2 text-[15px] font-black text-ink">{s.title}</span>
                        {s.body}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-col gap-2">
                  <motion.button
                    ref={start}
                    whileTap={{ scale: 0.97 }}
                    transition={spring}
                    onClick={() => next('camera')}
                    className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink shadow-[0_8px_22px_-8px_color-mix(in_oklab,var(--accent)_75%,transparent)] outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Icon name="photo_camera" size={22} fill />
                    カメラではじめる
                  </motion.button>
                  <button
                    onClick={() => next('sample')}
                    className="flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Icon name="image" size={20} />
                    この写真でためしてみる
                  </button>
                </div>
                <button
                  onClick={() => navigate({ to: '/privacy' })}
                  className="mx-auto mt-1 flex h-11 items-center px-3 text-[12px] font-bold text-ink-3 underline decoration-ink/20 underline-offset-4"
                >
                  プライバシーポリシー
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

// The sample photo with markers popping in one by one, the same marks people will tap after taking a photo.
function Photo() {
  const still = useReducedMotion();
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[#120e0b]">
      <img src={SAMPLE} alt="机の上のペットボトル、りんご、えんぴつ、消しゴムの写真" className="h-full w-full object-cover" draggable={false} />
      {MARKS.map((m, i) => (
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
