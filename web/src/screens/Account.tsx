import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMe, type Me } from '../lib/firebase';
import { syncCloud, useCards } from '../lib/cards';
import {
  accountMessage,
  checkVerified,
  deleteAccount,
  emailProblem,
  googleAvailable,
  logOut,
  passwordProblem,
  resendVerification,
  resetPassword,
  signInEmail,
  signInGoogle,
  signUpEmail,
} from '../lib/account';
import { mediaUrl } from '../lib/api';
import { onBack, haptic } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { toast } from '../lib/toast';
import { Icon, IconButton } from '../components/ui';
import { catStyle, spring } from '../components/theme';
import type { Card } from '../lib/types';

export function Account() {
  const me = useMe();
  const backTo = useBackTo();
  const close = () => backTo('/');
  useEffect(() => onBack(close, { history: false }));

  return (
    <motion.div className="fixed inset-0 z-[50] flex items-end justify-center lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="とじる" tabIndex={-1} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={close} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="account-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[32px] bg-paper text-ink shadow-[var(--shadow-float)] paper-grain lg:max-h-[min(860px,92dvh)] lg:max-w-[440px] lg:rounded-[32px]"
      >
        <div className="relative flex h-14 shrink-0 items-start justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-ink/15 lg:hidden" />
          <IconButton icon="close" label="とじる" onClick={close} className="absolute right-3 top-2" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-[max(env(safe-area-inset-bottom),24px)] no-scrollbar">
          {!me ? <Spinner big /> : me.guest ? <GuestView /> : <MemberView me={me} onDone={close} />}
        </div>
      </motion.section>
    </motion.div>
  );
}

function GuestView() {
  const cards = useCards();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(cards.length ? 'signup' : 'login');
  const [busy, setBusy] = useState<'google' | 'form' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'google' | 'form', f: () => Promise<void>, done?: string) {
    setBusy(kind);
    setError(null);
    try {
      await f();
      haptic('success');
      if (done) toast(done, 'verified_user');
    } catch (e) {
      const m = accountMessage(e);
      if (m) {
        setError(m);
        haptic('error');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-2">
      <Hero cards={cards} />
      <h2 id="account-title" className="mt-5 text-center text-[24px] font-black leading-snug">
        {mode === 'reset' ? 'パスワードの再設定' : cards.length ? <>あつめた図鑑を<br />どの端末でも</> : 'ログイン'}
      </h2>
      {mode !== 'reset' && (
        <p className="mt-2 text-center text-[14px] leading-relaxed text-ink-2">
          {cards.length
            ? `いまの ${cards.length} 枚はそのまま引きつがれます。スマホでもパソコンでも、ログインすれば同じ図鑑が開けます。`
            : 'ログインすると、スマホでもパソコンでも同じ図鑑が開けます。'}
        </p>
      )}

      {mode === 'reset' ? (
        <ResetForm onBack={() => setMode('login')} />
      ) : (
        <>
          <Tabs mode={mode} onChange={(m) => { setMode(m); setError(null); }} />
          {googleAvailable && (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                transition={spring}
                disabled={!!busy}
                onClick={() => run('google', signInGoogle, 'Google でログインしました')}
                className="mt-5 flex h-13 w-full items-center justify-center gap-3 rounded-full border border-line bg-white text-[15px] font-bold text-[#1f1f1f] shadow-[var(--shadow-card)] disabled:opacity-60"
              >
                {busy === 'google' ? <Spinner /> : <GoogleMark />}
                Google でつづける
              </motion.button>
              <div className="my-5 flex items-center gap-3 text-[12px] font-bold text-ink-3">
                <span className="h-px flex-1 bg-line" />
                またはメールアドレスで
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          <EmailForm
            key={mode}
            mode={mode}
            busy={busy === 'form'}
            disabled={!!busy}
            error={error}
            onSubmit={(email, pw) =>
              run('form', () => (mode === 'signup' ? signUpEmail(email, pw) : signInEmail(email, pw)), mode === 'signup' ? '登録しました。確認メールを見てください' : 'ログインしました')
            }
            onForgot={() => setMode('reset')}
          />
        </>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-2xl bg-paper-2 px-4 py-3 text-[12px] leading-relaxed text-ink-2">
        <Icon name="shield_lock" size={18} className="mt-px shrink-0 text-leaf" fill />
        撮った写真はこの端末の中だけに保存され、同期されません。パスワードは暗号化され、モノシリからも見られません。
      </p>
    </div>
  );
}

function Hero({ cards }: { cards: Card[] }) {
  const top = cards.slice(0, 3);
  if (!top.length) {
    return (
      <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }} className="mx-auto mt-3 grid h-20 w-20 place-items-center rounded-[26px] bg-accent-soft text-accent">
        <Icon name="account_circle" size={46} fill />
      </motion.div>
    );
  }
  return (
    <div className="relative mx-auto mt-4 h-[104px] w-[190px]">
      {top.map((c, i) => {
        const n = top.length;
        const offset = i - (n - 1) / 2;
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 30, rotate: 0 }}
            animate={{ opacity: 1, y: Math.abs(offset) * 8, rotate: offset * 12, x: offset * 46 }}
            transition={{ ...spring, delay: 0.08 * i }}
            className="absolute left-1/2 top-0 -ml-[38px] h-[100px] w-[76px] overflow-hidden rounded-[12px] bg-[#fffdf8] p-[4px] shadow-[var(--shadow-card)]"
            style={{ zIndex: n - Math.abs(Math.round(offset * 2)) }}
          >
            <Art card={c} />
          </motion.div>
        );
      })}
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.35 }}
        className="absolute -bottom-2 left-1/2 z-10 -ml-[18px] grid h-9 w-9 place-items-center rounded-full bg-leaf text-white shadow-[var(--shadow-card)]"
      >
        <Icon name="cloud_sync" size={20} fill />
      </motion.span>
    </div>
  );
}

function Art({ card }: { card: Card }) {
  const c = catStyle(card.category);
  return (
    <span className="grid h-full w-full place-items-center overflow-hidden rounded-[8px]" style={{ background: c.bg }}>
      {card.illustration ? (
        <img src={mediaUrl(card.illustration)} alt="" draggable={false} className="h-full w-full object-cover mix-blend-multiply" />
      ) : card.photo ? (
        <img src={card.photo} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <Icon name={card.icon} size={30} fill style={{ color: c.ink }} />
      )}
    </span>
  );
}

function Tabs({ mode, onChange }: { mode: 'login' | 'signup'; onChange: (m: 'login' | 'signup') => void }) {
  return (
    <LayoutGroup id="account-tabs">
      <div role="tablist" className="mt-5 grid grid-cols-2 rounded-full bg-paper-2 p-1">
        {(['signup', 'login'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => onChange(m)} className="relative h-10 rounded-full text-[14px] font-bold">
            {mode === m && <motion.span layoutId="account-tab" className="absolute inset-0 rounded-full bg-paper shadow-[0_0_0_1px_rgb(60_40_20/0.06),0_1px_6px_rgb(0_0_0/0.18)]" transition={spring} />}
            <span className={`relative ${mode === m ? 'text-ink' : 'text-ink-3'}`}>{m === 'signup' ? '新規登録' : 'ログイン'}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function EmailForm({ mode, busy, disabled, error, onSubmit, onForgot }: {
  mode: 'login' | 'signup'; busy: boolean; disabled: boolean; error: string | null; onSubmit: (email: string, pw: string) => void; onForgot: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const signup = mode === 'signup';
  const emailErr = emailProblem(email.trim());
  const pwErr = signup ? passwordProblem(pw, email.trim()) : pw ? null : 'パスワードを入力してください';
  const local = touched ? emailErr ?? pwErr : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (emailErr || pwErr) {
      haptic('error');
      return;
    }
    onSubmit(email.trim(), pw);
  }

  return (
    <form onSubmit={submit} noValidate className={googleAvailable ? '' : 'mt-5'}>
      <Field icon="mail" label="メールアドレス">
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
      </Field>
      <Field icon="key" label="パスワード" className="mt-3">
        <input
          type={show ? 'text' : 'password'}
          autoComplete={signup ? 'new-password' : 'current-password'}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={128}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={signup ? '10文字以上・英字と数字' : 'パスワード'}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'パスワードをかくす' : 'パスワードを表示'} className="grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-ink/6">
          <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
        </button>
      </Field>

      {/* 登録とログインで同じ高さの枠を使い、切り替えてもシートの高さが変わらないようにする */}
      <div className="mt-2.5 flex min-h-[30px] items-center">
        {signup ? (
          <Strength pw={pw} email={email.trim()} />
        ) : (
          <button type="button" onClick={onForgot} className="ml-auto flex items-center gap-1 px-1 text-[13px] font-bold text-ink-2">
            <Icon name="search" size={15} className="text-ink-3" />
            <span className="underline decoration-ink/20 underline-offset-4">パスワードを忘れてしまった</span>
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {(local || error) && (
          <motion.p
            key={local ?? error}
            role="alert"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: [8, -6, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-3 flex items-start gap-1.5 text-[13px] font-bold text-[#c2410c]"
          >
            <Icon name="error" size={18} fill className="shrink-0" />
            {local ?? error}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.button
        type="submit"
        disabled={disabled}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink shadow-[0_8px_22px_-8px_color-mix(in_oklab,var(--accent)_75%,transparent)] disabled:opacity-60"
      >
        {busy ? <Spinner light /> : <Icon name={signup ? 'person_add' : 'login'} size={22} />}
        {signup ? '登録する' : 'ログイン'}
      </motion.button>
    </form>
  );
}

function Strength({ pw, email }: { pw: string; email: string }) {
  const rules = [
    { ok: pw.length >= 10, label: '10文字以上' },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), label: '英字と数字' },
    { ok: pw.length > 0 && !passwordProblem(pw, email), label: '推測されにくい' },
  ];
  return (
    <ul className="flex w-full flex-wrap justify-between gap-1">
      {rules.map((r) => (
        <motion.li
          key={r.label}
          animate={{ backgroundColor: r.ok ? 'var(--leaf-soft)' : 'var(--paper-2)', color: r.ok ? 'var(--leaf)' : 'var(--ink-3)' }}
          className="flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-bold"
        >
          <Icon name={r.ok ? 'check_circle' : 'radio_button_unchecked'} size={14} fill={r.ok} />
          {r.label}
        </motion.li>
      ))}
    </ul>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = emailProblem(email.trim());
    if (bad) return setError(bad);
    setState('busy');
    setError(null);
    try {
      await resetPassword(email);
      setState('sent');
    } catch (err) {
      setError(accountMessage(err));
      setState('idle');
    }
  }

  return (
    <div className="mt-4">
      {state === 'sent' ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl bg-leaf-soft px-5 py-4 text-[14px] leading-relaxed text-ink">
          <p className="flex items-center gap-2 font-black text-leaf"><Icon name="mark_email_read" fill /> メールを確認してください</p>
          <p className="mt-1.5 text-ink-2">登録されているアドレスなら、再設定用のリンクを送りました。届かないときは迷惑メールのフォルダも見てください。</p>
        </motion.div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="mb-4 text-center text-[14px] leading-relaxed text-ink-2">登録したメールアドレスに、新しいパスワードを決めるためのリンクを送ります。</p>
          <Field icon="mail" label="メールアドレス">
            <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3" />
          </Field>
          {error && <p role="alert" className="mt-3 text-[13px] font-bold text-[#c2410c]">{error}</p>}
          <button type="submit" disabled={state === 'busy'} className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-black text-paper disabled:opacity-60">
            {state === 'busy' ? <Spinner light /> : <Icon name="send" size={20} />}
            再設定のメールを送る
          </button>
        </form>
      )}
      <button onClick={onBack} className="mx-auto mt-4 flex items-center gap-1 text-[13px] font-bold text-ink-2">
        <Icon name="arrow_back" size={18} /> ログインにもどる
      </button>
    </div>
  );
}

function MemberView({ me, onDone }: { me: Me; onDone: () => void }) {
  const cards = useCards();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const needsVerify = me.provider === 'password' && !me.verified;

  async function act(kind: string, f: () => Promise<unknown>) {
    setBusy(kind);
    try {
      return await f();
    } catch (e) {
      const m = accountMessage(e);
      if (m) toast(m, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-2">
      <div className="mt-3 flex flex-col items-center text-center">
        <Avatar me={me} />
        <h2 id="account-title" className="mt-3 text-[20px] font-black">{me.name ?? 'ログイン中'}</h2>
        <p className="mt-0.5 max-w-full truncate text-[14px] text-ink-2">{me.email}</p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1 text-[12px] font-bold text-ink-2">
          {me.provider === 'google' ? <GoogleMark size={14} /> : <Icon name="mail" size={15} />}
          {me.provider === 'google' ? 'Google でログイン' : 'メールアドレスでログイン'}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {needsVerify && <VerifyBanner email={me.email ?? ''} />}
      </AnimatePresence>

      <div className="mt-5 flex items-center gap-3 rounded-3xl bg-paper-2 px-4 py-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${needsVerify ? 'bg-paper-3 text-ink-3' : 'bg-leaf-soft text-leaf'}`}>
          <Icon name={needsVerify ? 'cloud_off' : 'cloud_done'} size={24} fill />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-black">図鑑 {cards.length} 枚</p>
          <p className="text-[12px] leading-snug text-ink-2">{needsVerify ? 'メールを確認すると同期がはじまります' : 'どの端末でもログインすれば同じ図鑑が開けます'}</p>
        </div>
        {!needsVerify && (
          <IconButton
            icon="sync"
            label="いま同期する"
            size={40}
            disabled={busy === 'sync'}
            className={busy === 'sync' ? 'animate-spin' : ''}
            onClick={() => act('sync', async () => { await syncCloud(); toast('同期しました', 'cloud_done'); })}
          />
        )}
      </div>

      <button
        onClick={() => act('logout', async () => { await logOut(); toast('ログアウトしました', 'logout'); onDone(); })}
        disabled={!!busy}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 text-[15px] font-bold text-ink hover:bg-ink/5 disabled:opacity-60"
      >
        {busy === 'logout' ? <Spinner /> : <Icon name="logout" size={20} />}
        ログアウト
      </button>
      <p className="mt-2 text-center text-[12px] text-ink-3">ログアウトすると、この端末の図鑑は消えます（クラウドには残ります）</p>

      <AnimatePresence initial={false} mode="wait">
        {confirming ? (
          <DeleteConfirm key="confirm" me={me} onCancel={() => setConfirming(false)} onDeleted={onDone} />
        ) : (
          <motion.button key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirming(true)} className="mx-auto mt-6 block text-[13px] font-bold text-[#c2410c]/80 underline decoration-current/30 underline-offset-4">
            アカウントを削除する
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [cool, setCool] = useState(0);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!cool) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);
  // Coming back from the mail app is the moment the link was most likely opened.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && void checkVerified().then((ok) => ok && toast('確認できました。同期をはじめます', 'verified')).catch(() => {});
    void checkVerified().then((ok) => ok && toast('確認できました。同期をはじめます', 'verified')).catch(() => {});
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="mt-5 rounded-3xl border border-sun/40 bg-[color-mix(in_oklab,var(--sun)_16%,var(--paper))] px-4 py-4">
        <p className="flex items-center gap-2 text-[15px] font-black"><Icon name="mark_email_unread" fill className="text-sun" /> メールアドレスを確認してください</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          <span className="break-all font-bold text-ink">{email}</span> に確認メールを送りました。メールのリンクを開くと、ほかの端末と同期できるようになります。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                const ok = await checkVerified();
                toast(ok ? '確認できました。同期をはじめます' : 'まだ確認できていません。メールのリンクを開いてください', ok ? 'verified' : 'hourglass');
              } catch (e) {
                toast(accountMessage(e) ?? '', 'error');
              } finally {
                setChecking(false);
              }
            }}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[13px] font-bold text-paper disabled:opacity-60"
          >
            {checking ? <Spinner light /> : <Icon name="check" size={18} />}
            確認しました
          </button>
          <button
            disabled={cool > 0}
            onClick={async () => {
              setCool(60);
              try {
                await resendVerification();
                toast('確認メールを送りなおしました', 'send');
              } catch (e) {
                toast(accountMessage(e) ?? '', 'error');
              }
            }}
            className="h-10 flex-1 rounded-full border border-ink/15 text-[13px] font-bold text-ink disabled:text-ink-3"
          >
            {cool > 0 ? `再送まで ${cool} 秒` : 'メールを再送'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function DeleteConfirm({ me, onCancel, onDeleted }: { me: Me; onCancel: () => void; onDeleted: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const google = me.provider === 'google';

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(google ? undefined : pw);
      toast('アカウントを削除しました', 'delete');
      onDeleted();
    } catch (e) {
      setError(accountMessage(e));
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-6 rounded-3xl border border-[#c2410c]/25 bg-[#c2410c]/6 px-4 py-4">
      <p className="flex items-center gap-2 text-[15px] font-black text-[#c2410c]"><Icon name="warning" fill /> 本当に削除しますか？</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">アカウントと、クラウドに保存した図鑑のカードがすべて消え、元にもどせません。</p>
      {!google && (
        <Field icon="key" label="確認のためパスワードを入力" className="mt-3">
          <input type="password" autoComplete="current-password" maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="パスワード" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3" />
        </Field>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] font-bold text-[#c2410c]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="h-11 flex-1 rounded-full border border-ink/15 text-[14px] font-bold">やめる</button>
        <button onClick={run} disabled={busy || (!google && !pw)} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#c2410c] text-[14px] font-black text-white disabled:opacity-50">
          {busy ? <Spinner light /> : <Icon name="delete_forever" size={20} />}
          {google ? 'Google で確認して削除' : '削除する'}
        </button>
      </div>
    </motion.div>
  );
}

export function Avatar({ me, size = 72 }: { me: Me; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (me.name ?? me.email ?? '?').trim().charAt(0).toUpperCase();
  return me.photo && !broken ? (
    <img src={me.photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="rounded-full object-cover shadow-[var(--shadow-card)]" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full bg-accent font-black text-white shadow-[var(--shadow-card)]" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}

function Field({ icon, label, className = '', children }: { icon: string; label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block px-1 text-[12px] font-bold text-ink-2">{label}</span>
      <span className="flex h-13 items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 transition-shadow [&_input]:outline-none focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)]">
        <Icon name={icon} size={20} className="shrink-0 text-ink-3" />
        {children}
      </span>
    </label>
  );
}

function Spinner({ light = false, big = false }: { light?: boolean; big?: boolean }) {
  const s = big ? 32 : 18;
  return (
    <span
      aria-label="読み込み中"
      className={`inline-block animate-spin rounded-full border-2 ${light ? 'border-white/40 border-t-white' : 'border-ink/15 border-t-ink/70'} ${big ? 'mx-auto my-16 block' : ''}`}
      style={{ width: s, height: s }}
    />
  );
}

// Google's brand mark, as their sign-in branding guidelines require next to "Google でつづける".
export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
