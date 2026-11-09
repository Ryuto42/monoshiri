import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { endSignIn, finishOnboarding, startSignIn, useWelcome } from '../lib/welcome';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useMe } from '../lib/firebase';
import { useStage } from '../lib/level';
import { saveStage, type Stage } from '../lib/level';
import { haptic, onBack } from '../lib/native';
import { PrivacyLink } from '../screens/account/parts';
import { AgePicker } from './AgePicker';
import { RubyText } from './RubyText';
import { ReadingStage, stripRuby } from '../lib/ruby';
import { Button, HeroIcon, Icon } from './ui';
import { dialogMotion, spring, ui } from './theme';

// Below this age, a parent or guardian has to read the policy with the child and agree too.
const GUARDIAN_AGE = 13;

// Before the welcome (guests included): the age, turned into a stage on the spot, then consent to the privacy policy.
// Nothing here can be skipped, and the camera waits until it is done.
export function Onboarding() {
  const state = useWelcome();
  return (
    <>
      <AnimatePresence>{state === 'onboard' && <Panel key="onboard" />}</AnimatePresence>
      {state === 'signin' && <SignIn />}
    </>
  );
}

// Opens the account sheet for someone who logs in from the first screen, and settles it when they sign in or close it.
function SignIn() {
  const me = useMe();
  const { uid, stage, loaded } = useStage();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const opened = useRef(false);
  useEffect(() => {
    void navigate({ to: '/account' });
  }, [navigate]);
  // Signed in: wait until the account's own stage has loaded (the guest's is gone by then).
  const member = !!me && !me.guest && uid === me.uid && loaded;
  useEffect(() => {
    if (!member) return;
    endSignIn(true, !!stage);
    void navigate({ to: '/' });
  }, [member, stage, navigate]);
  // Closed the sheet without signing in.
  useEffect(() => {
    if (pathname === '/account') opened.current = true;
    else if (opened.current && !member) endSignIn(false, false);
  }, [pathname, member]);
  return null;
}

function Panel() {
  const [answer, setAnswer] = useState<{ age: number; stage: Stage } | null>(null);
  const [policy, setPolicy] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [step, setStep] = useState<'age' | 'consent'>('age');
  useEffect(() => void haptic('select'), []);
  useEffect(() => (step === 'consent' ? onBack(() => setStep('age'), { history: false }) : undefined), [step]);

  function finish() {
    if (!answer) return;
    haptic('success');
    // The stage is in use on this device straight away; only the copy in a signed-in account can fail.
    void saveStage(answer.stage).catch(() => {});
    finishOnboarding();
  }

  return (
    <motion.div
      className={`${ui.overlay} z-[55] items-center`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div aria-hidden className={ui.scrim} />
      {/* max-h-full keeps it inside the overlay's safe-area padding, so on a short screen it scrolls instead of
          running under the status bar or the home indicator. */}
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="onboard-title"
        {...dialogMotion}
        className={`${ui.dialog} phrase-wrap max-h-full overflow-y-auto overscroll-contain px-6 pt-4 pb-4 no-scrollbar`}
      >
        <Dots at={step === 'age' ? 0 : 1} />
        {/* The two steps slide past each other (the old one leaves while the new one comes in) and the card eases to
            the new height, so it never stands empty between them. */}
        <Grow>
          <AnimatePresence mode="popLayout" initial={false}>
          {step === 'age' ? (
            <motion.div key="age" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={spring}>
              <AgePicker
                initial={null}
                initialAge={answer?.age}
                titleId="onboard-title"
                saveLabel="つぎへ"
                skipLabel="アカウントが ある人は ログイン"
                onSkip={startSignIn}
                onSave={(stage, age) => {
                  if (answer && (answer.age < GUARDIAN_AGE) !== (age < GUARDIAN_AGE)) setGuardian(false);
                  setAnswer({ stage, age });
                  setStep('consent');
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="consent" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={spring}>
              <ReadingStage.Provider value={answer?.stage ?? null}>
                <Consent policy={policy} guardian={guardian} setPolicy={setPolicy} setGuardian={setGuardian} child={!!answer && answer.age < GUARDIAN_AGE} onBack={() => setStep('age')} onAgree={finish} />
              </ReadingStage.Provider>
            </motion.div>
          )}
          </AnimatePresence>
        </Grow>
      </motion.section>
    </motion.div>
  );
}

function Grow({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  // A number only while the card eases to a new step's height; at rest it is 'auto', so nothing is ever clipped
  // (Safari on an iPhone cut off the bottom button when the measured height came up short).
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const last = useRef(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    last.current = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (Math.abs(h - last.current) < 1) return;
      setHeight(last.current);
      last.current = h;
      requestAnimationFrame(() => setHeight(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      onAnimationComplete={() => setHeight('auto')}
      className={height === 'auto' ? 'relative' : 'relative overflow-hidden'}
    >
      {/* flow-root keeps the first child's top margin inside, so it is part of the measured height. */}
      <div ref={inner} className="flow-root">
        {children}
      </div>
    </motion.div>
  );
}

function Dots({ at }: { at: number }) {
  return (
    <ol aria-label={`2つ中 ${at + 1}つめ`} className="flex h-6 items-center justify-center gap-1.5">
      {[0, 1].map((i) => (
        <li key={i} className={`h-1.5 rounded-full transition-all ${i === at ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20'}`} />
      ))}
    </ol>
  );
}

function Consent({ child, onBack, onAgree, policy, guardian, setPolicy, setGuardian }: { child: boolean; onBack: () => void; onAgree: () => void; policy: boolean; guardian: boolean; setPolicy: (v: boolean) => void; setGuardian: (v: boolean) => void }) {
  const ready = policy && (!child || guardian);
  return (
    <div className="pb-2">
      <div className="[@media(max-height:760px)]:hidden">
        <HeroIcon icon="shield_lock" tone="leaf" />
      </div>
      <h2 id="onboard-title" className={`mt-4 text-center ${ui.title}`}>
        はじめる まえに
      </h2>
      <p className={`${ui.lead} text-center`}>
        <RubyText text="モノシリの プライバシーポリシーを 読《よ》んでね。" />
      </p>

      <ul className={`mt-4 flex flex-col gap-2 text-[13px] leading-relaxed ${ui.panel}`}>
        <Point icon="photo_camera">
          <RubyText text="写真《しゃしん》は しらべたら けすよ。どこにも のこさないよ。" />
        </Point>
        <Point icon="school">
          <RubyText text="年齢《ねんれい》は おぼえないよ。せつめいの むずかしさだけ おぼえるよ。" />
        </Point>
        <Point icon="style">
          <RubyText text="カードは きみの 図鑑《ずかん》に しまうよ。ほかの 人には 見えないよ。" />
        </Point>
      </ul>
      <p className="mt-1 text-center">
        <PrivacyLink icon="chevron_right" className="inline-flex min-h-11 items-center gap-1 px-2 text-[14px] text-leaf">
          プライバシーポリシーを 読む
        </PrivacyLink>
      </p>

      <div className="mt-1">
        <Check checked={policy} onChange={setPolicy} text="プライバシーポリシーを 読《よ》んで、同意《どうい》します" />
      </div>
      {child && (
        <div className="mt-2 rounded-3xl border border-sun/40 bg-[color-mix(in_oklab,var(--sun)_14%,var(--paper))] px-2 pt-2.5 pb-1">
          <p className="flex items-center gap-1.5 px-2 text-[12px] font-bold text-ink-2">
            <Icon name="person" size={16} fill className="shrink-0 text-sun" />
            <span>
              <RubyText text="13さい 未満《みまん》の 人は、おうちの 人と いっしょに 読《よ》んでね" />
            </span>
          </p>
          <Check checked={guardian} onChange={setGuardian} text="おうちの 人と いっしょに 読《よ》み、同意《どうい》を もらいました" />
        </div>
      )}

      <div className="mt-4 flex items-center gap-1">
        <Button type="button" tone="subtle" icon="arrow_back" onClick={onBack} className="-ml-3 shrink-0 whitespace-nowrap pl-3 pr-4">
          もどる
        </Button>
        <Button
          type="button"
          size="lg"
          icon="check"
          aria-label="同意して はじめる"
          disabled={!ready}
          onClick={onAgree}
          className="min-w-0 flex-1 whitespace-nowrap outline-offset-4"
        >
          <span>
            <RubyText text="同意《どうい》して はじめる" />
          </span>
        </Button>
      </div>
    </div>
  );
}

function Point({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icon name={icon} size={22} fill className="mt-0.5 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}

// The box is tied to its sentence by id, and its name is the sentence without the readings, so a screen reader says
// the sentence once (not "on", and not each kanji twice).
function Check({ checked, onChange, text }: { checked: boolean; onChange: (v: boolean) => void; text: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-ink/4">
      <input
        id={id}
        type="checkbox"
        aria-label={stripRuby(text)}
        checked={checked}
        onChange={(e) => {
          haptic('select');
          onChange(e.target.checked);
        }}
        className="h-6 w-6 shrink-0 cursor-pointer accent-[var(--accent)]"
      />
      <span aria-hidden className="text-[14px] font-bold leading-snug text-ink">
        <RubyText text={text} />
      </span>
    </label>
  );
}
