import { Hono } from 'hono';
import { APPCHECK_ENFORCE } from '../config.ts';
import { clean, type Env } from '../http.ts';
import { resetMail, verifyMail } from '../mail/templates.ts';
import { mailDeps, toAppLink } from '../mail/send.ts';

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
const allowed = (uid: string, email: string) =>
  take(`day`, MAIL_LIMITS.perDay, DAY) && take(`u:${uid}`, MAIL_LIMITS.perAccount, HOUR) && take(`e:${email.toLowerCase()}`, MAIL_LIMITS.perAddress, HOUR);

export const resetMailLimits = () => sent.clear();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The address-confirmation email for the signed-in account (email/password accounts that aren't confirmed yet).
mail.post('/api/mail/verify', async (c) => {
  const d = mailDeps();
  if (!d.enabled()) return c.json({ error: 'mail_unavailable' }, 503);
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
  // It sends email to an address someone typed, so (like generation) guests need App Check while it is enforced.
  if (APPCHECK_ENFORCE && c.get('tier') === 'guest' && !c.get('attested')) return c.json({ error: 'attest_required' }, 403);
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = clean(body.email, 254);
  if (!EMAIL.test(email)) return c.json({ error: 'bad_email' }, 400);
  if (!allowed(c.get('uid'), email)) return c.json({ error: 'mail_limit' }, 429);
  const raw = await d.resetLink(email);
  if (raw) await d.send(email, resetMail(email, toAppLink(raw, 'resetPassword')));
  return c.json({ ok: true });
});
