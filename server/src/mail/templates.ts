import { APP_URL as SITE } from '../config.ts';
import { escapeHtml, layout } from './layout.ts';

export type Mail = { subject: string; html: string; text: string };

const strong = (email: string) => `<strong style="color:#2a2017;word-break:break-all;">${escapeHtml(email)}</strong>`;

// The plain-text part carries the whole message (not just the link): mail with a thin text part looks like spam.
const textOf = (lines: string[]) => [...lines, '', '――', 'モノシリ（撮るだけで、身の回りが教科書になる学習アプリ）', SITE, 'このメールは送信専用です。返信はとどきません。'].join('\n');

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
