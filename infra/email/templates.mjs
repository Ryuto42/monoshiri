import { layout } from './layout.mjs';

const EMAIL = '<strong style="color:#2a2017;word-break:break-all;">%EMAIL%</strong>';

// Firebase Authentication email templates (Identity Toolkit config: notification.sendEmail.*Template).
export const templates = {
  verifyEmailTemplate: {
    subject: 'モノシリ｜メールアドレスの確認',
    body: layout({
      preheader: 'ボタンをおすと確認が終わり、どの端末でも同じ図鑑がひらけるようになります。',
      badge: '&#x1F4EE;',
      title: 'メールアドレスを確認してね',
      lead: `${EMAIL} で、モノシリに登録しようとしています。<br>下のボタンをおすと、確認が終わります。`,
      button: 'メールアドレスを確認する',
      tip: { title: '確認すると…', body: 'どの端末でログインしても、集めたカードの図鑑がそのままひらけます。' },
      ignore: '心あたりがないときは、このメールは何もしなくて大丈夫です。',
    }),
  },
  resetPasswordTemplate: {
    subject: 'モノシリ｜パスワードの再設定',
    body: layout({
      preheader: 'ボタンをおすと、新しいパスワードを決められます。',
      badge: '&#x1F511;',
      badgeTone: 'accent',
      title: '新しいパスワードを決めよう',
      lead: `${EMAIL} のパスワードを再設定するためのメールです。<br>下のボタンから、新しいパスワードを決めてください。`,
      button: '新しいパスワードを決める',
      tip: { title: 'パスワードのコツ', body: '10文字以上で、英字と数字を両方まぜてください。ほかのサービスと同じものは使わないでね。' },
      ignore: 'パスワードの再設定をたのんでいないときは、このメールは何もしなくて大丈夫です。今のパスワードのまま使えます。',
    }),
  },
  changeEmailTemplate: {
    subject: 'モノシリ｜ログイン用のメールアドレスが変わりました',
    body: layout({
      preheader: 'ログイン用のメールアドレスが変わりました。心あたりがないときは元にもどせます。',
      badge: '&#x1F6E1;&#xFE0F;',
      badgeTone: 'accent',
      title: 'メールアドレスが変わりました',
      lead: `モノシリのログイン用のメールアドレスが<br><strong style="color:#2a2017;word-break:break-all;">%NEW_EMAIL%</strong> に変わりました。`,
      button: '元のメールアドレスにもどす',
      after: '自分で変えたときは、何もしなくて大丈夫です。',
      ignore: '心あたりがないときは、上のボタンで元にもどし、パスワードも変えてください。',
    }),
  },
};
