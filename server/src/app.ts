import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { ALLOWED_ORIGINS, LOCAL, USER_CAP_JPY } from './config.ts';
import { AttestError, BudgetError, UserLimitError } from './store.ts';
import { authMiddleware, defaultAuthDeps, type AuthDeps } from './auth.ts';
import type { Env } from './http.ts';
import { files } from './routes/files.ts';
import { detect } from './routes/detect.ts';
import { explore } from './routes/explore.ts';
import { deep } from './routes/deep.ts';
import { media } from './routes/media.ts';
import { speech } from './routes/speech.ts';
import { video } from './routes/video.ts';
import { learn } from './routes/learn.ts';
import { mail } from './routes/mail.ts';

export function createApp(deps: AuthDeps = defaultAuthDeps) {
  const app = new Hono<Env>();
  app.use('*', cors({ origin: ALLOWED_ORIGINS, allowHeaders: ['Authorization', 'Content-Type', 'X-Firebase-AppCheck'], maxAge: 86400 }));
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });
  app.use('/api/*', bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }));
  app.route('/', files);
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.use('/api/*', authMiddleware(deps));

  app.onError((err, c) => {
    if (err instanceof BudgetError) return c.json({ error: 'budget' }, 402);
    if (err instanceof UserLimitError) return c.json({ error: 'user_limit', tier: err.tier, capJpy: USER_CAP_JPY[err.tier] }, 402);
    if (err instanceof AttestError) return c.json({ error: 'attest_required' }, 403);
    if ((err as any)?.status === 429) return c.json({ error: 'busy' }, 503);
    console.error(err);
    return c.json({ error: 'internal', ...(LOCAL && { message: String(err?.message ?? err).slice(0, 200) }) }, 500);
  });

  for (const r of [detect, explore, deep, media, speech, video, learn, mail]) app.route('/', r);
  return app;
}
