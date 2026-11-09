import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Me } from '../../lib/firebase';
import { cardsAtRisk, syncCloud, useCards } from '../../lib/cards';
import { accountMessage, checkVerified, deleteAccount, logOut, resendVerification } from '../../lib/account';
import { api } from '../../lib/api';
import { haptic } from '../../lib/native';
import { toast } from '../../lib/toast';
import { saveStage, stageInfo, useStage, type Stage } from '../../lib/level';
import { stripRuby } from '../../lib/ruby';
import { AgePicker } from '../../components/AgePicker';
import { Icon, IconButton } from '../../components/ui';
import { Avatar, Field, GoogleMark, PrivacyLink, Spinner } from './parts';
import { StageRow } from './StageSetting';

const skipKey = (uid: string) => `monoshiri.stage.skip.${uid}`;
const skipped = (uid: string) => {
  try {
    return !!localStorage.getItem(skipKey(uid));
  } catch {
    return false;
  }
};

export function MemberView({ me, onDone }: { me: Me; onDone: () => void }) {
  const cards = useCards();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Cards that would be lost by logging out now (an unconfirmed address can't sync, or the sync just failed).
  const [risk, setRisk] = useState(0);
  const needsVerify = me.provider === 'password' && !me.verified;
  const st = useStage();
  const [editing, setEditing] = useState(false);
  const [skip, setSkip] = useState(() => skipped(me.uid));
  const [usage, setUsage] = useState<{ mySpentJpy: number; myCapJpy: number } | null>(null);
  useEffect(() => {
    if (!needsVerify) api.usage().then(setUsage).catch(() => {});
  }, [needsVerify]);

  // The first login on an account without a stage (e.g. on a device that never set one) asks for the age.
  const asking = !needsVerify && st.loaded && st.uid === me.uid && (editing || (!st.stage && !skip));
  if (asking) {
    return (
      <AgePicker
        initial={st.stage}
        saving={busy === 'stage'}
        saveLabel={editing ? 'これに する' : undefined}
        onSave={(s: Stage) =>
          act('stage', async () => {
            await saveStage(s);
            setEditing(false);
            toast(`「${stripRuby(stageInfo(s).ruby)}」向けの説明にしました`, 'school');
          })
        }
        onSkip={
          editing
            ? () => setEditing(false)
            : () => {
                try {
                  localStorage.setItem(skipKey(me.uid), '1');
                } catch {
                  /* ignore */
                }
                setSkip(true);
              }
        }
        skipLabel={editing ? 'やめる（いまの まま）' : undefined}
      />
    );
  }

  async function leave() {
    await logOut();
    toast('ログアウトしました', 'logout');
    onDone();
  }

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
            size={44}
            disabled={busy === 'sync'}
            className={busy === 'sync' ? 'animate-spin' : ''}
            onClick={() =>
              act('sync', async () => {
                const ok = await syncCloud();
                toast(ok ? '同期しました' : '同期できませんでした。通信を確かめて、もう一度ためしてね', ok ? 'cloud_done' : 'cloud_off');
              })
            }
          />
        )}
      </div>

      {!needsVerify && <StageRow stage={st.stage} onEdit={() => setEditing(true)} />}

      {usage && (
        <div className="mt-3 rounded-3xl bg-paper-2 px-4 py-3.5">
          <div className="flex items-baseline justify-between text-[13px] font-bold">
            <span>新しく調べられる残り</span>
            <span className="tabular-nums">{Math.max(0, Math.min(100, Math.round(100 - (usage.mySpentJpy / usage.myCapJpy) * 100)))}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-3">
            <motion.div
              className="h-full rounded-full bg-leaf"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, 100 - (usage.mySpentJpy / usage.myCapJpy) * 100))}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">みんなが調べたモノと、あつめたカードはいつでも見られます</p>
        </div>
      )}

      <AnimatePresence initial={false} mode="wait">
        {risk > 0 ? (
          <LogoutConfirm
            key="risk"
            count={risk}
            unsynced={needsVerify}
            busy={busy === 'logout'}
            onCancel={() => setRisk(0)}
            onLogout={() => act('logout', async () => { await leave(); setRisk(0); })}
          />
        ) : (
          <motion.div key="logout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button
              onClick={() =>
                act('logout', async () => {
                  const n = await cardsAtRisk();
                  if (n > 0) return setRisk(n);
                  await leave();
                })
              }
              disabled={!!busy}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 text-[15px] font-bold text-ink hover:bg-ink/5 disabled:opacity-60"
            >
              {busy === 'logout' ? <Spinner /> : <Icon name="logout" size={20} />}
              ログアウト
            </button>
            <p className="mt-2 text-center text-[12px] text-ink-3">ログアウトすると、この端末の図鑑は消えます（クラウドには残ります）</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        {confirming ? (
          <DeleteConfirm key="confirm" me={me} onCancel={() => setConfirming(false)} onDeleted={onDone} />
        ) : (
          <motion.button key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirming(true)} className="mx-auto mt-4 flex min-h-11 items-center px-3 text-[13px] font-bold text-[#c2410c]/80 underline decoration-current/30 underline-offset-4">
            アカウントを削除する
          </motion.button>
        )}
      </AnimatePresence>
      <p className="text-center">
        <PrivacyLink className="inline-flex h-11 items-center px-3 text-[12px] text-ink-3" />
      </p>
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
        <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-3">
          <Icon name="info" size={16} className="mt-px shrink-0" />
          メールが見つからないときは、迷惑メールのフォルダも見てね。
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
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[13px] font-bold text-paper disabled:opacity-60"
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
            className="h-11 flex-1 rounded-full border border-ink/15 text-[13px] font-bold text-ink disabled:text-ink-3"
          >
            {cool > 0 ? `再送まで ${cool} 秒` : 'メールを再送'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function LogoutConfirm({ count, unsynced, busy, onCancel, onLogout }: {
  count: number; unsynced: boolean; busy: boolean; onCancel: () => void; onLogout: () => void;
}) {
  return (
    <motion.div role="alertdialog" aria-labelledby="logout-risk" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-5 rounded-3xl border border-sun/50 bg-[color-mix(in_oklab,var(--sun)_16%,var(--paper))] px-4 py-4">
      <p id="logout-risk" className="flex items-center gap-2 text-[15px] font-black">
        <Icon name="warning" fill className="text-sun" /> このままだと集めたカードが消えます
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
        {unsynced
          ? `メールアドレスの確認がまだなので、この端末の ${count} 枚はクラウドに保存されていません。確認メールのリンクを開いてからログアウトすると、カードは残ります。`
          : `この端末の ${count} 枚をクラウドに保存できませんでした。通信を確かめて、もう一度ためしてからログアウトすると、カードは残ります。`}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="h-11 flex-1 rounded-full bg-ink text-[14px] font-bold text-paper">ログアウトしない</button>
        <button onClick={onLogout} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/15 text-[14px] font-bold disabled:opacity-60">
          {busy ? <Spinner /> : <Icon name="logout" size={18} />}
          消えてもよい
        </button>
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
