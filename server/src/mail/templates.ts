import { escapeHtml, layout } from './layout.ts';

export type Mail = { subject: string; html: string; text: string };

const strong = (email: string) => `<strong style="color:#2a2017;word-break:break-all;">${escapeHtml(email)}</strong>`;

export function verifyMail(email: string, link: string): Mail {
  return {
    subject: 'モノシリ｜メールアドレスの確認',
    html: layout({
      link,
      preheader: 'ボタンをおすと確認が終わり、どの端末でも同じ図鑑がひらけるようになります。',
      badge: '&#x1F4EE;',
      title: 'メールアドレスを確認してね',
      lead: `${strong(email)} で、モノシリに登録しようとしています。<br>下のボタンをおすと、確認が終わります。`,
      button: 'メールアドレスを確認する',
      tip: { title: '確認すると…', body: 'どの端末でログインしても、集めたカードの図鑑がそのままひらけます。' },
      ignore: '心あたりがないときは、このメールは何もしなくて大丈夫です。',
    }),
    text: `モノシリ\n\n${email} で、モノシリに登録しようとしています。\n次のリンクをひらくと、メールアドレスの確認が終わります。\n\n${link}\n\n心あたりがないときは、このメールは何もしなくて大丈夫です。`,
  };
}

export function resetMail(email: string, link: string): Mail {
  return {
    subject: 'モノシリ｜パスワードの再設定',
    html: layout({
      link,
      preheader: 'ボタンをおすと、新しいパスワードを決められます。',
      badge: '&#x1F511;',
      badgeTone: 'accent',
      title: '新しいパスワードを決めよう',
      lead: `${strong(email)} のパスワードを再設定するためのメールです。<br>下のボタンから、新しいパスワードを決めてください。`,
      button: '新しいパスワードを決める',
      tip: { title: 'パスワードのコツ', body: '10文字以上で、英字と数字を両方まぜてください。ほかのサービスと同じものは使わないでね。' },
      ignore: 'パスワードの再設定をたのんでいないときは、このメールは何もしなくて大丈夫です。今のパスワードのまま使えます。',
    }),
    text: `モノシリ\n\n${email} のパスワードを再設定するためのメールです。\n次のリンクから、新しいパスワードを決めてください。\n\n${link}\n\nたのんでいないときは、このメールは何もしなくて大丈夫です。`,
  };
}
