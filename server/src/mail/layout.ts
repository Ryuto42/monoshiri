// The look of Monoshiri's emails, shared by every template: the app's paper background, a rounded card and the orange
// pill button. Email clients ignore stylesheets and web fonts, so everything is tables with inline styles.
// The API server fills in the link and the address and sends the message itself (Firebase's own templates can't be edited).

const C = {
  paper: '#fbf6ec',
  paper2: '#f4ecdd',
  card: '#fffdf8',
  line: '#ece2cf',
  ink: '#2a2017',
  ink2: '#66574a',
  ink3: '#9a8a7a',
  accent: '#ef6a3a',
};
const FONT = `'Hiragino Maru Gothic ProN','Hiragino Sans','Zen Maru Gothic','Meiryo',sans-serif`;
import { APP_URL as SITE, CONTACT_EMAIL } from '../config.ts';

// No hidden preheader text and no emoji in the heading: both are common in spam and count against delivery.
export type MailParts = {
  link: string;
  title: string;
  lead: string;
  button: string;
  tip?: { title: string; body: string };
  ignore: string;
};

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function layout(m: MailParts) {
  const link = escapeHtml(m.link);
  const button = `<tr><td align="center" style="padding:28px 0 8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td align="center" bgcolor="${C.accent}" style="border-radius:999px;background:${C.accent};">
            <a href="${link}" target="_blank" style="display:inline-block;padding:16px 36px;border-radius:999px;font-family:${FONT};font-size:17px;font-weight:800;line-height:1;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">${m.button}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="padding:14px 4px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.ink3};">
        ボタンがおせないときは、このリンクをひらいてください<br>
        <a href="${link}" target="_blank" style="color:${C.ink3};word-break:break-all;">${link}</a>
      </td></tr>`;
  const tip = m.tip
    ? `<tr><td style="padding:26px 0 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="background:${C.paper2};border-radius:20px;padding:16px 18px;font-family:${FONT};">
            <div style="font-size:14px;font-weight:800;color:${C.ink};">${m.tip.title}</div>
            <div style="margin-top:4px;font-size:13px;line-height:1.7;color:${C.ink2};">${m.tip.body}</div>
          </td>
        </tr></table>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>モノシリ</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.paper}" style="background:${C.paper};">
<tr><td align="center" style="padding:32px 14px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
    <tr><td align="center" style="padding:0 0 18px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="padding-right:10px;"><img src="${SITE}/icon-192.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:12px;"></td>
        <td style="font-family:${FONT};font-size:22px;font-weight:900;color:${C.ink};letter-spacing:0.06em;">モノシリ</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:28px;padding:36px 26px 30px;box-shadow:0 18px 40px -24px rgba(42,32,23,0.35);">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td align="center" style="padding:0;font-family:${FONT};font-size:22px;font-weight:900;line-height:1.5;color:${C.ink};">${m.title}</td></tr>
        <tr><td align="center" style="padding:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.85;color:${C.ink2};">${m.lead}</td></tr>
        ${button}
        ${tip}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.8;color:${C.ink3};">
      ${m.ignore}<br>
      ご質問は <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink3};">${CONTACT_EMAIL}</a> までお寄せください。<br>
      <a href="${SITE}" target="_blank" style="color:${C.ink3};">${SITE.replace(/^https?:\/\//, '')}</a> ・ 撮るだけで、身の回りが教科書になる。
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
