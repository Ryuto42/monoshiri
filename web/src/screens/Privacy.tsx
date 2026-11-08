import { motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { onBack } from '../lib/native';
import { useBackTo } from '../lib/useBackTo';
import { RubyText } from '../components/RubyText';
import { Icon, IconButton } from '../components/ui';

const ISSUES = 'https://github.com/Ryuto42/monoshiri/issues';
const ENACTED = '2026年11月9日';

// The /privacy route: closing steps back to wherever it was opened from.
export function Privacy() {
  const backTo = useBackTo();
  return <PrivacySheet onClose={() => backTo('/')} />;
}

// Also opened in place (e.g. from the sign-up form) so the screen underneath keeps what was typed.
export function PrivacySheet({ onClose }: { onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => onBack(() => close.current(), { history: false }), []);

  return (
    <motion.div className="fixed inset-0 z-[58] flex items-end justify-center text-ink lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.button aria-label="とじる" tabIndex={-1} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal
        aria-labelledby="privacy-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[32px] bg-paper shadow-[var(--shadow-float)] paper-grain lg:max-h-[min(860px,92dvh)] lg:max-w-[560px] lg:rounded-[32px]"
      >
        <div className="relative flex h-14 shrink-0 items-start justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-ink/15 lg:hidden" />
          <IconButton icon="close" label="とじる" onClick={onClose} className="absolute right-3 top-2" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-[max(env(safe-area-inset-bottom),28px)] no-scrollbar">
          <PrivacyBody />
        </div>
      </motion.section>
    </motion.div>
  );
}

function PrivacyBody() {
  return (
    <article className="pb-4">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-leaf-soft text-leaf">
        <Icon name="shield_lock" size={36} fill />
      </div>
      <h2 id="privacy-title" className="mt-4 text-center text-[24px] font-black leading-snug">
        プライバシーポリシー
      </h2>
      <p className="mt-1 text-center text-[12px] text-ink-3">モノシリ・{ENACTED} 制定</p>

      <section aria-labelledby="privacy-easy" className="mt-6 rounded-3xl bg-paper-2 px-5 py-4">
        <h3 id="privacy-easy" className="flex items-center gap-2 text-[17px] font-black">
          <Icon name="lightbulb" size={22} fill className="text-sun" />
          かんたんに いうと
        </h3>
        <ul className="mt-3 flex flex-col gap-2.5 text-[15px] leading-relaxed">
          <Easy icon="photo_camera">
            <RubyText text="とった 写真《しゃしん》は、なにが うつっているかを しらべる ためだけに つかって、どこにも のこさないよ。" />
          </Easy>
          <Easy icon="school">
            <RubyText text="年《とし》や 学年《がくねん》は おぼえないよ。「低学年《ていがくねん》むけ」のような せつめいの むずかしさだけ おぼえるよ。" />
          </Easy>
          <Easy icon="style">
            <RubyText text="あつめた カードは、きみの 図鑑《ずかん》に しまっておくよ。ほかの 人には 見えないよ。" />
          </Easy>
          <Easy icon="person">
            <RubyText text="13さい 未満《みまん》の 人が 登録《とうろく》する ときは、おうちの 人と いっしょに してね。" />
          </Easy>
          <Easy icon="delete">
            <RubyText text="アカウントは いつでも けせるよ。けすと、カードも いっしょに きえるよ。" />
          </Easy>
        </ul>
      </section>

      <div className="mt-8 flex flex-col gap-6 text-[14px] leading-relaxed text-ink-2">
        <Part title="1. 運営者">
          <p>
            モノシリ（以下「本アプリ」）は、チーム「いぬどろぼう」が DevFest GDGoC Japan Hackathon 2026 の作品として開発・運営しています。
          </p>
        </Part>

        <Part title="2. 集める情報">
          <ul className="list-disc pl-5">
            <li>Firebase Authentication が発行する利用者ID（uid）。ゲストで使う場合も、匿名のIDが作られます</li>
            <li>アカウント登録をした場合：メールアドレス、Google でログインした場合は Google アカウントの表示名とプロフィール画像のURL</li>
            <li>図鑑に保存したカード（モノの名前・解説・ノートなど）</li>
            <li>選んだ「学びの段階」（低学年・高学年・中学生・高校生以上のいずれか）</li>
          </ul>
          <p className="mt-2">年齢と学年は保存も送信もしません。段階を選ぶときに学年を聞きますが、その場で段階に置きかえて、学年そのものは捨てています。</p>
        </Part>

        <Part title="3. 写真の扱い">
          <p>
            撮影した写真や選んだ写真は保存しません。写っているモノを見つけて解説するために、Google の Gemini（Vertex AI）と、子どもに見せてよい写真かを確かめる Cloud Vision の SafeSearch に送って解析し、終わったら破棄します。解析の結果（モノの名前や解説）は、ほかの人が同じモノを調べたときにも使えるよう、写真とは切り離して保存することがあります。
          </p>
        </Part>

        <Part title="4. 利用状況の数え方">
          <p>
            どの機能がどのくらい使われたかは、サーバーで「1日ごとの合計回数」だけを数えています。だれが使ったかとは結び付けません。使いすぎを防ぐための利用額の記録は、利用者IDごとに持ちます。
          </p>
        </Part>

        <Part title="5. 外部への送信">
          <ul className="list-disc pl-5">
            <li>Google：Firebase（ログイン、データベース、ホスティング）、reCAPTCHA Enterprise（Firebase App Check。本アプリからの正しい通信かを確かめるため）、Vertex AI の Gemini と Cloud Vision（写真の解析・解説）</li>
            <li>YouTube：関連する動画を、Cookie を使わない埋め込み（youtube-nocookie.com）で表示します。再生すると YouTube に通信が発生します</li>
            <li>Wikimedia Commons・Wikipedia：テーマに合う写真と、モノの要約を表示するために画像や文章を読み込みます</li>
          </ul>
          <p className="mt-2">これら以外の第三者に、個人を特定できる情報を渡すことはありません。広告は表示しません。</p>
        </Part>

        <Part title="6. 13歳未満の方へ">
          <p>13歳未満の方がアカウントを登録するときは、保護者の方の同意を得たうえで、いっしょに登録してください。ゲストのままでも使えます。</p>
        </Part>

        <Part title="7. 削除の方法">
          <p>
            アカウント画面の「アカウントを削除する」から、いつでも削除できます。削除すると、クラウドに保存した図鑑のカードとアカウントが消え、元にはもどせません。ログアウトすると、その端末に保存していた図鑑と段階の設定も消えます。
          </p>
        </Part>

        <Part title="8. お問い合わせ">
          <p>
            ご質問やご意見は、
            <a href={ISSUES} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-leaf underline underline-offset-4">
              GitHub の Issues
              <Icon name="open_in_new" size={15} />
            </a>
            までお寄せください。
          </p>
        </Part>

        <Part title="9. 改定">
          <p>内容を変えるときは、本アプリ内でお知らせします。</p>
          <p className="mt-2 text-ink-3">{ENACTED} 制定</p>
        </Part>
      </div>
    </article>
  );
}

function Easy({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icon name={icon} size={22} fill className="mt-1 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[16px] font-black text-ink">{title}</h3>
      {children}
    </section>
  );
}
