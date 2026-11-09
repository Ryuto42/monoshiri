import type { MiddlewareHandler } from 'hono';
import { getAppCheck } from 'firebase-admin/app-check';
import { ADMIN_UIDS, APPCHECK_ENFORCE, LOCAL } from './config.ts';
import { auth, runAs, type Tier } from './store.ts';
import type { Env } from './http.ts';

export type IdToken = { uid: string; exp: number; email_verified?: boolean; firebase?: { sign_in_provider?: string } };
export type AuthDeps = {
  verifyIdToken: (token: string) => Promise<IdToken>;
  verifyAppCheck: (token: string) => Promise<boolean>;
};

export const defaultAuthDeps: AuthDeps = {
  // checkRevoked rejects tokens of deleted/disabled accounts or after a password change; re-checked at least every 5 minutes.
  verifyIdToken: (token) => auth.verifyIdToken(token, !LOCAL) as Promise<IdToken>,
  verifyAppCheck: async (token) => {
    try {
      await getAppCheck().verifyToken(token);
      return true;
    } catch {
      return false;
    }
  },
};

export const tierOf = (d: IdToken): Tier => {
  if (ADMIN_UIDS.has(d.uid)) return 'admin';
  // Members are Google accounts and email accounts with a confirmed address; everyone else is on the guest allowance.
  const provider = d.firebase?.sign_in_provider;
  return provider === 'anonymous' || (provider === 'password' && !d.email_verified) ? 'guest' : 'member';
};

const WINDOW = 5 * 60_000;
export const RATE_LIMIT = 120;
// Reads are mostly cache hits, but each still costs Firestore reads (and /api/media may search), so they get a looser limit.
export const GET_RATE_LIMIT = 300;

// Rate limits live in each instance's memory: with at most 2 Cloud Run instances the effective ceiling is 2x,
// which is fine at this scale and costs no Firestore writes per request.
export function authMiddleware(deps: AuthDeps): MiddlewareHandler<Env> {
  const tokenCache = new Map<string, { uid: string; tier: Tier; exp: number }>();
  const appCheckCache = new Map<string, number>();
  const hits = new Map<string, number[]>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tokenCache) if (v.exp < now) tokenCache.delete(k);
    for (const [k, v] of appCheckCache) if (v < now) appCheckCache.delete(k);
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
  }, 60_000);
  sweep.unref();
  let logged = 0;

  return async (c, next) => {
    const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
    if (!token) return c.json({ error: 'unauthenticated' }, 401);
    let entry = tokenCache.get(token);
    if (!entry || entry.exp < Date.now()) {
      try {
        const d = await deps.verifyIdToken(token);
        entry = { uid: d.uid, tier: tierOf(d), exp: Math.min(d.exp * 1000, Date.now() + 5 * 60_000) };
        tokenCache.set(token, entry);
      } catch {
        return c.json({ error: 'unauthenticated' }, 401);
      }
    }
    const ac = c.req.header('X-Firebase-AppCheck');
    let attested = false;
    if (ac) {
      const until = appCheckCache.get(ac);
      if (until && until > Date.now()) attested = true;
      else if (await deps.verifyAppCheck(ac)) {
        attested = true;
        appCheckCache.set(ac, Date.now() + 5 * 60_000);
      }
    }
    if (!APPCHECK_ENFORCE && !attested && entry.tier === 'guest' && logged++ % 50 === 0) console.log('appcheck: guest request without a valid token');
    c.set('uid', entry.uid);
    c.set('tier', entry.tier);
    c.set('attested', attested);
    if ((c.req.method === 'POST' || c.req.method === 'GET') && entry.tier !== 'admin') {
      const now = Date.now();
      const k = `${c.req.method}:${entry.uid}`;
      const list = (hits.get(k) ?? []).filter((t) => now - t < WINDOW);
      if (list.length >= (c.req.method === 'GET' ? GET_RATE_LIMIT : RATE_LIMIT)) return c.json({ error: 'rate_limited' }, 429);
      list.push(now);
      hits.set(k, list);
    }
    await runAs({ uid: entry.uid, tier: entry.tier, attested }, next);
  };
}
