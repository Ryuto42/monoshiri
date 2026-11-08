import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { accountMessage, emailProblem, googleAvailable, passwordProblem, resetPassword } from '../../lib/account';
import { haptic } from '../../lib/native';
import { Icon } from '../../components/ui';
import { spring } from '../../components/theme';
import { Field, Spinner } from './parts';

export function EmailForm({ mode, busy, disabled, error, onSubmit, onForgot }: {
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
    if (disabled) return;
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
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'パスワードをかくす' : 'パスワードを表示'} className="-mr-1.5 grid h-11 w-11 place-items-center rounded-full text-ink-3 hover:bg-ink/6">
          <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
        </button>
      </Field>

      {/* 登録とログインで同じ高さの枠を使い、切り替えてもシートの高さが変わらないようにする */}
      <div className="mt-2.5 flex min-h-11 items-center">
        {signup ? (
          <Strength pw={pw} email={email.trim()} />
        ) : (
          <button type="button" onClick={onForgot} className="ml-auto flex min-h-11 items-center gap-1 px-1 text-[13px] font-bold text-ink-2">
            <Icon name="help" size={16} className="translate-y-px text-ink-3" />
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
        data-kb-bottom
        type="submit"
        disabled={disabled}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink disabled:opacity-60"
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
          initial={false}
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

export function ResetForm({ onBack }: { onBack: () => void }) {
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
          <button data-kb-bottom type="submit" disabled={state === 'busy'} className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-black text-paper disabled:opacity-60">
            {state === 'busy' ? <Spinner light /> : <Icon name="send" size={20} />}
            再設定のメールを送る
          </button>
        </form>
      )}
      <button onClick={onBack} className="mx-auto mt-4 flex min-h-11 items-center gap-1 px-2 text-[13px] font-bold text-ink-2">
        <Icon name="arrow_back" size={18} /> ログイン画面に戻る
      </button>
    </div>
  );
}
