import { LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import { useCards } from '../../lib/cards';
import { accountMessage, googleAvailable, signInEmail, signInGoogle, signUpEmail } from '../../lib/account';
import { mediaUrl } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Card } from '../../lib/types';
import { Icon } from '../../components/ui';
import { KidText } from '../../components/RubyText';
import { haptic } from '../../lib/native';
import { catStyle, spring } from '../../components/theme';
import { EmailForm, ResetForm } from './EmailForm';
import { GoogleMark, PrivacyLink, Spinner } from './parts';

export function GuestView() {
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
      <h2 id="account-title" className="phrase-wrap mt-5 text-center text-[24px] font-black leading-snug">
        {mode === 'reset' ? (
          <KidText text="パスワードの再設定《さいせってい》" />
        ) : cards.length ? (
          <>
            <KidText text="あつめた図鑑《ずかん》を" />
            <br />
            <KidText text="どの端末《たんまつ》でも" />
          </>
        ) : mode === 'signup' ? (
          <KidText text="新規登録《しんきとうろく》" />
        ) : (
          'ログイン'
        )}
      </h2>
      {mode !== 'reset' && (
        <p className="phrase-wrap mt-2 text-center text-[14px] leading-relaxed text-ink-2">
          <KidText
            text={
              cards.length
                ? `いまの ${cards.length} 枚《まい》はそのまま引《ひ》きつがれます。スマホでもパソコンでも、ログインすれば同《おな》じ図鑑《ずかん》が開《ひら》けます。`
                : mode === 'signup'
                  ? '登録《とうろく》すると、スマホでもパソコンでも同《おな》じ図鑑《ずかん》が開《ひら》けます。'
                  : 'ログインすると、スマホでもパソコンでも同《おな》じ図鑑《ずかん》が開《ひら》けます。'
            }
          />
          <span className="mt-1 block text-[12px] text-ink-3">
            <KidText
              text="ゲストは新《あたら》しく調《しら》べられる数《かず》に限《かぎ》りがあります。登録《とうろく》すると、もっとたくさん調《しら》べられます。"
            />
          </span>
        </p>
      )}

      {mode === 'reset' ? (
        <ResetForm onBack={() => setMode('login')} />
      ) : (
        <>
          <Tabs mode={mode} onChange={(m) => { setMode(m); setError(null); }} />
          {mode === 'signup' && <Agreed />}
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
              run('form', () => (mode === 'signup' ? signUpEmail(email, pw) : signInEmail(email, pw)), mode === 'signup' ? '登録しました。確認メールを見てください（迷惑メールのフォルダも）' : 'ログインしました')
            }
            onForgot={() => setMode('reset')}
          />
        </>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-2xl bg-paper-2 px-4 py-3 text-[12px] leading-relaxed text-ink-2">
        <Icon name="shield_lock" size={18} className="mt-px shrink-0 text-leaf" fill />
        撮った写真はどこにも保存されません（調べ終わったら消えます）。パスワードは暗号化され、モノシリからも見られません。
      </p>
      <p className="mt-1 text-center">
        <PrivacyLink className="inline-flex h-11 items-center px-3 text-[12px] text-ink-3" />
      </p>
    </div>
  );
}

// Everyone agreed to the policy (with a guardian, under 13) on the first-run screen, so sign-up only points back to it.
function Agreed() {
  return (
    <p className="mt-5 flex items-start gap-2 rounded-2xl bg-paper-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
      <Icon name="verified_user" size={18} fill className="mt-0.5 shrink-0 text-leaf" />
      <span>
        はじめに同意した
        <PrivacyLink className="text-leaf" />
        の内容で登録します。
      </span>
    </p>
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
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => onChange(m)} className="relative h-11 rounded-full text-[14px] font-bold">
            {mode === m && <motion.span layoutId="account-tab" className="absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-tab)]" transition={spring} />}
            <span className={`relative ${mode === m ? 'text-ink' : 'text-ink-3'}`}>{m === 'signup' ? '新規登録' : 'ログイン'}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
