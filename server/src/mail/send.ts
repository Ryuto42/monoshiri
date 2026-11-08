import nodemailer, { type Transporter } from 'nodemailer';
import { APP_URL, SMTP } from '../config.ts';
import { auth } from '../store.ts';
import type { Mail } from './templates.ts';

export type MailUser = { email?: string; emailVerified: boolean; providers: string[] };

// Everything that touches Firebase Auth or the SMTP server, so tests can swap it out.
export type MailDeps = {
  enabled: () => boolean;
  getUser: (uid: string) => Promise<MailUser>;
  verifyLink: (email: string) => Promise<string>;
  /** null when no account has this address (the API still answers "sent", so addresses can't be probed). */
  resetLink: (email: string) => Promise<string | null>;
  send: (to: string, mail: Mail) => Promise<void>;
};

const after = { url: `${APP_URL}/account` };
let transport: Transporter | null = null;

export const defaultMailDeps: MailDeps = {
  enabled: () => !!(SMTP.user && SMTP.password),
  getUser: async (uid) => {
    const u = await auth.getUser(uid);
    return { email: u.email, emailVerified: u.emailVerified, providers: u.providerData.map((p) => p.providerId) };
  },
  verifyLink: (email) => auth.generateEmailVerificationLink(email, after),
  resetLink: async (email) => {
    try {
      return await auth.generatePasswordResetLink(email, after);
    } catch (e: any) {
      if (e?.code === 'auth/user-not-found' || e?.code === 'auth/email-not-found') return null;
      throw e;
    }
  },
  send: async (to, mail) => {
    transport ??= nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.port === 465,
      requireTLS: SMTP.port !== 465,
      auth: { user: SMTP.user, pass: SMTP.password },
    });
    await transport.sendMail({ from: { name: SMTP.fromName, address: SMTP.user }, to, subject: mail.subject, html: mail.html, text: mail.text });
  },
};

let deps = defaultMailDeps;
export const mailDeps = () => deps;
export function setMailDeps(d: MailDeps) {
  deps = d;
}

// Firebase's link points at its own page; the app's /auth/action does the same job with the app's look and comes back in.
export function toAppLink(firebaseLink: string, mode: 'verifyEmail' | 'resetPassword') {
  const src = new URL(firebaseLink);
  const oobCode = src.searchParams.get('oobCode');
  if (!oobCode) throw new Error('no_oob_code');
  const out = new URL('/auth/action', APP_URL);
  out.searchParams.set('mode', mode);
  out.searchParams.set('oobCode', oobCode);
  out.searchParams.set('continueUrl', src.searchParams.get('continueUrl') ?? after.url);
  out.searchParams.set('lang', 'ja');
  return out.toString();
}
