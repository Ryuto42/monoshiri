import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { accountMessage, applyEmailLink, passwordProblem, resetLinkEmail, setNewPassword, type EmailAction } from '../lib/account';
import { haptic } from '../lib/native';
import { Button, HeroIcon, Icon } from '../components/ui';
import { dialogMotion, ui } from '../components/theme';
import { Field, Spinner } from './account/parts';
import { BrandMark } from '../components/BrandMark';

type View =
  | { kind: 'working' }
  | { kind: 'verified'; email: string | null }
  | { kind: 'recovered'; email: string | null }
  | { kind: 'reset'; email: string }
  | { kind: 'passwordSet' }
  | { kind: 'failed'; message: string };

const REDIRECT_MS = 3500;
const ROUTES = ['/', '/zukan', '/account'] as const;
type Route = (typeof ROUTES)[number];

// Where to go afterwards: the continue URL the app put in the email when it is one of our own screens, else the account screen.
function nextRoute(raw: string | null, fallback: Route): Route {
  try {
    const u = new URL(raw ?? '', location.origin);
    if (u.origin === location.origin && (ROUTES as readonly string[]).includes(u.pathname)) return u.pathname as Route;
  } catch {
    /* not a URL */
  }
  return fallback;
}

// The page Firebase's email links open (set as the action URL of the project's email templates).
export function AuthAction() {
  const navigate = useNavigate();
  const [params] = useState(() => new URLSearchParams(location.search));
  const mode = params.get('mode') as EmailAction | null;
  const oobCode = params.get('oobCode') ?? '';
  const next = nextRoute(params.get('continueUrl'), '/account');
  const known = mode === 'verifyEmail' || mode === 'verifyAndChangeEmail' || mode === 'recoverEmail' || mode === 'resetPassword';
  const [view, setView] = useState<View>(() =>
    !oobCode || !mode
      ? { kind: 'failed', message: 'リンクの形が正しくありません。メールのリンクをもう一度ひらいてください' }
      : known
        ? { kind: 'working' }
        : { kind: 'failed', message: 'このリンクはモノシリでは使えません' },
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !oobCode || !known) return;
    started.current = true;
    const fail = (e: unknown) => {
      haptic('error');
      setView({ kind: 'failed', message: accountMessage(e) ?? 'うまくいきませんでした' });
    };
    if (mode === 'verifyEmail' || mode === 'verifyAndChangeEmail')
      applyEmailLink(oobCode).then((email) => (haptic('success'), setView({ kind: 'verified', email })), fail);
    else if (mode === 'recoverEmail') applyEmailLink(oobCode).then((email) => setView({ kind: 'recovered', email }), fail);
    else resetLinkEmail(oobCode).then((email) => setView({ kind: 'reset', email }), fail);
  }, [mode, oobCode, known]);

  const go = (to: Route) => navigate({ to, replace: true });
  const auto = view.kind === 'verified' || view.kind === 'recovered' || view.kind === 'passwordSet';
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => go(view.kind === 'passwordSet' ? '/account' : next), REDIRECT_MS);
    return () => clearTimeout(t);
  });

  return (
    <motion.div
      className={`${ui.overlay} z-[60] items-center overflow-y-auto bg-paper paper-grain text-ink`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section role="dialog" aria-modal aria-labelledby="action-title" aria-live="polite" {...dialogMotion} className={`${ui.dialog} px-6 pb-6 pt-7`}>
        <div className="mb-5 flex items-center justify-center gap-2 text-[15px] font-black text-ink-2">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent text-white">
            <BrandMark size={18} />
          </span>
          モノシリ
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view.kind} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {view.kind === 'working' && (
              <div className="grid place-items-center py-10">
                <Spinner big />
                <p id="action-title" className="mt-4 text-[15px] font-bold text-ink-2">
                  たしかめています…
                </p>
              </div>
            )}
            {view.kind === 'verified' && (
              <Done
                icon="mark_email_read"
                title="メールアドレスを確認できました"
                lead="これで、どの端末でログインしても同じ図鑑がひらけます。"
                email={view.email}
                onGo={() => go(next)}
              />
            )}
            {view.kind === 'recovered' && (
              <Done icon="undo" title="メールアドレスを元にもどしました" lead="心あたりがない変更だった場合は、パスワードも変えておきましょう。" email={view.email} onGo={() => go(next)} />
            )}
            {view.kind === 'reset' && (
              <ResetForm email={view.email} onDone={() => (haptic('success'), setView({ kind: 'passwordSet' }))} onFail={(m) => setView({ kind: 'failed', message: m })} oobCode={oobCode} />
            )}
            {view.kind === 'passwordSet' && (
              <Done icon="lock_reset" title="新しいパスワードにしました" lead="アプリにもどって、新しいパスワードでログインしてください。" email={null} onGo={() => go('/account')} />
            )}
            {view.kind === 'failed' && (
              <div className="text-center">
                <HeroIcon icon="link_off" />
                <h1 id="action-title" className={`mt-4 ${ui.title}`}>
                  リンクをひらけませんでした
                </h1>
                <p className={ui.lead}>{view.message}</p>
                <Button size="lg" icon="arrow_forward" className="mt-6 w-full" onClick={() => go('/account')}>
                  アプリをひらく
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

function Done({ icon, title, lead, email, onGo }: { icon: string; title: string; lead: string; email: string | null; onGo: () => void }) {
  return (
    <div className="text-center">
      <HeroIcon icon={icon} tone="leaf" />
      <h1 id="action-title" className={`mt-4 ${ui.title}`}>
        {title}
      </h1>
      {email && <p className="mt-2 break-all text-[14px] font-bold text-ink">{email}</p>}
      <p className={ui.lead}>{lead}</p>
      <Button size="lg" icon="arrow_forward" className="mt-6 w-full" onClick={onGo}>
        アプリをひらく
      </Button>
      {/* Fills while waiting, then the app opens by itself. */}
      <div className="mx-auto mt-4 h-1.5 w-32 overflow-hidden rounded-full bg-paper-3" aria-hidden>
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: REDIRECT_MS / 1000, ease: 'linear' }} />
      </div>
      <p className="mt-2 text-[12px] text-ink-3">すこしすると、アプリにもどります</p>
    </div>
  );
}

function ResetForm({ email, oobCode, onDone, onFail }: { email: string; oobCode: string; onDone: () => void; onFail: (message: string) => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(pw, email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem || busy) return void haptic('error');
    setBusy(true);
    try {
      await setNewPassword(oobCode, pw);
      onDone();
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') {
        setBusy(false);
        return void haptic('error');
      }
      onFail(accountMessage(err) ?? 'うまくいきませんでした');
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="text-center">
        <HeroIcon icon="key" />
        <h1 id="action-title" className={`mt-4 ${ui.title}`}>
          新しいパスワードを決める
        </h1>
        <p className="mt-2 break-all text-[14px] font-bold text-ink">{email}</p>
      </div>
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field icon="key" label="新しいパスワード" className="mt-5">
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={128}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="10文字以上・英字と数字"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'パスワードをかくす' : 'パスワードを表示'}
          className="-mr-1.5 grid h-11 w-11 place-items-center rounded-full text-ink-3 hover:bg-ink/6"
        >
          <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
        </button>
      </Field>
      <p className={`mt-2 px-1 text-[12px] ${touched && problem ? 'font-bold text-[#c2410c]' : 'text-ink-3'}`} role={touched && problem ? 'alert' : undefined}>
        {touched && problem ? problem : '10文字以上で、英字と数字を両方まぜてください'}
      </p>
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy} icon={busy ? undefined : 'check'}>
        {busy ? <Spinner light /> : 'このパスワードにする'}
      </Button>
    </form>
  );
}
