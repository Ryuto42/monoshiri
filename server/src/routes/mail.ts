import { Hono } from 'hono';
import { APPCHECK_ENFORCE } from '../config.ts';
import { clean, type Env } from '../http.ts';
import { resetMail, verifyMail } from '../mail/templates.ts';
import { mailDeps, toAppLink } from '../mail/send.ts';
import { errorText, report } from '../report.ts';

export const mail = new Hono<Env>();

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Gmail allows about 500 messages a day; stay well below it, and keep any one account or address from being flooded.
export const MAIL_LIMITS = { perAccount: 5, perAddress: 3, perDay: 300 };
const sent = new Map<string, number[]>();

function take(key: string, max: number, window: number) {
  const now = Date.now();
  const list = (sent.get(key) ?? []).filter((t) => now - t < window);
  if (list.length >= max) return false;
  list.push(now);
  sent.set(key, list);
  return true;
}
// One mailbox can be written many ways (Kid+1@gmail.com, k.i.d@googlemail.com), so the per-address limit counts the mailbox.
export function mailbox(email: string) {
  const at = email.lastIndexOf('@');
  let local = email.slice(0, at).toLowerCase();
  let domain = email.slice(at + 1).toLowerCase();
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

const allowed = (uid: string, email: string) =>
  take(`day`, MAIL_LIMITS.perDay, DAY) && take(`u:${uid}`, MAIL_LIMITS.perAccount, HOUR) && take(`e:${mailbox(email)}`, MAIL_LIMITS.perAddress, HOUR);

export const resetMailLimits = () => sent.clear();

// The reset answer always takes about this long, so its timing doesn't tell whether the address has an account.
export const MAIL_TIMING = { resetMs: 2500 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sending email is something guests can do (unconfirmed email accounts are guests too), so like generation it needs
// App Check while that is enforced.
const attestMissing = (c: { get: (k: 'tier' | 'attested') => unknown }) => APPCHECK_ENFORCE && c.get('tier') === 'guest' && !c.get('attested');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The address-confirmation email for the signed-in account (email/password accounts that aren't confirmed yet).
mail.post('/api/mail/verify', async (c) => {
  const d = mailDeps();
  if (!d.enabled()) return c.json({ error: 'mail_unavailable' }, 503);
  if (attestMissing(c)) return c.json({ error: 'attest_required' }, 403);
  const user = await d.getUser(c.get('uid'));
  if (!user.email || user.emailVerified || !user.providers.includes('password')) return c.json({ error: 'nothing_to_verify' }, 400);
  if (!allowed(c.get('uid'), user.email)) return c.json({ error: 'mail_limit' }, 429);
  const link = toAppLink(await d.verifyLink(user.email), 'verifyEmail');
  await d.send(user.email, verifyMail(user.email, link));
  return c.json({ ok: true });
});

// The password-reset email. Answers the same whether or not the address has an account.
mail.post('/api/mail/reset', async (c) => {
  const d = mailDeps();
  if (!d.enabled()) return c.json({ error: 'mail_unavailable' }, 503);
  if (attestMissing(c)) return c.json({ error: 'attest_required' }, 403);
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = clean(body.email, 254);
  if (!EMAIL.test(email)) return c.json({ error: 'bad_email' }, 400);
  if (!allowed(c.get('uid'), email)) return c.json({ error: 'mail_limit' }, 429);
  // Known and unknown addresses get the same answer after the same wait; a failed send is only logged, for the same reason.
  const work = (async () => {
    const raw = await d.resetLink(email);
    if (raw) await d.send(email, resetMail(email, toAppLink(raw, 'resetPassword')));
  })().catch((e) => report('failed', 'mail_failed', { kind: 'reset', detail: errorText(e) }));
  await Promise.all([work, sleep(MAIL_TIMING.resetMs)]);
  return c.json({ ok: true });
});
