import { APP_URL as SITE, CONTACT_EMAIL } from '../config.ts';
import { escapeHtml, layout } from './layout.ts';

export type Mail = { subject: string; html: string; text: string };

const strong = (email: string) => `<strong style="color:#2a2017;word-break:break-all;">${escapeHtml(email)}</strong>`;

// The plain-text part carries the whole message (not just the link): mail with a thin text part looks like spam.
const textOf = (lines: string[]) => [...lines, '', '――', 'モノシリ（撮るだけで、身の回りが教科書になる学習アプリ）', SITE, `ご質問は ${CONTACT_EMAIL} までお寄せください。`].join('\n');

export function verifyMail(email: string, link: string): Mail {
  return {
    subject: 'モノシリ メールアドレスの確認',
    html: layout({
      link,
      title: 'メールアドレスを確認してね',
      lead: `${strong(email)} で、モノシリに登録しようとしています。<br>下のボタンをおすと、確認が終わります。`,
      button: 'メールアドレスを確認する',
      tip: { title: '確認すると…', body: 'どの端末でログインしても、集めたカードの図鑑がそのままひらけます。' },
      ignore: '心あたりがないときは、このメールは何もしなくて大丈夫です。',
    }),
    text: textOf([
      'モノシリ メールアドレスの確認',
      '',
      `${email} で、モノシリに登録しようとしています。`,
      '次のリンクをひらくと、メールアドレスの確認が終わります。',
      '',
      link,
      '',
      '確認すると、どの端末でログインしても、集めたカードの図鑑がそのままひらけます。',
      '',
      '心あたりがないときは、このメールは何もしなくて大丈夫です。登録は完了しません。',
    ]),
  };
}

export function resetMail(email: string, link: string): Mail {
  return {
    subject: 'モノシリ パスワードの再設定',
    html: layout({
      link,
      title: '新しいパスワードを決めよう',
      lead: `${strong(email)} のパスワードを再設定するためのメールです。<br>下のボタンから、新しいパスワードを決めてください。`,
      button: '新しいパスワードを決める',
      tip: { title: 'パスワードのコツ', body: '10文字以上で、英字と数字を両方まぜてください。ほかのサービスと同じものは使わないでね。' },
      ignore: 'パスワードの再設定をたのんでいないときは、このメールは何もしなくて大丈夫です。今のパスワードのまま使えます。',
    }),
    text: textOf([
      'モノシリ パスワードの再設定',
      '',
      `${email} のパスワードを再設定するためのメールです。`,
      '次のリンクをひらいて、新しいパスワードを決めてください。',
      '',
      link,
      '',
      'パスワードは10文字以上で、英字と数字を両方まぜてください。ほかのサービスと同じものは使わないでください。',
      '',
      'パスワードの再設定をたのんでいないときは、このメールは何もしなくて大丈夫です。今のパスワードのまま使えます。',
    ]),
  };
}

export type PolicyNotice = {
  /** The day the policy changed, as shown, e.g. 2026年11月20日. */
  date: string;
  /** The main changes, one per line. */
  changes: string[];
  /** A major change: CONSENT_VERSION (web/src/lib/welcome.ts) was raised, so the app asks for consent again. */
  reconsent: boolean;
};

// The notice sent once when the privacy policy changes, to accounts with a verified address (npm run notify:policy,
// src/tools/notify-policy.ts). Guests have no address; the app's consent screen tells them.
export function policyMail(n: PolicyNotice): Mail {
  const link = `${SITE}/privacy`;
  const after = n.reconsent
    ? '次にモノシリをひらいたときに、同意の画面がもう一度出ます。読んで、同意してから使ってください。'
    : 'これまでどおり、そのまま使えます。';
  return {
    subject: 'モノシリ プライバシーポリシーを変えました',
    html: layout({
      link,
      title: 'プライバシーポリシーを変えました',
      lead: `${escapeHtml(n.date)}に、モノシリのプライバシーポリシーを変えました。<br>${after}`,
      button: 'プライバシーポリシーを読む',
      tip: { title: 'おもに変わったところ', body: n.changes.map((c) => `・${escapeHtml(c)}`).join('<br>') },
      ignore: 'このメールは、モノシリにメールアドレスを登録している方にお送りしています。',
    }),
    text: textOf([
      'モノシリ プライバシーポリシーを変えました',
      '',
      `${n.date}に、モノシリのプライバシーポリシーを変えました。`,
      after,
      '',
      'おもに変わったところ',
      ...n.changes.map((c) => `・${c}`),
      '',
      '新しいプライバシーポリシーは、次のリンクから読めます。',
      link,
      '',
      'このメールは、モノシリにメールアドレスを登録している方にお送りしています。',
    ]),
  };
}
