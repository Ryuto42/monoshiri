import type { AuthDeps } from '../src/auth.ts';

// Tokens in tests are "uid:provider[:verified]"; App Check tokens are valid when they equal "ok".
export const fakeDeps: AuthDeps = {
  verifyIdToken: async (token) => {
    const [uid, provider = 'anonymous', verified] = token.split(':');
    if (!uid || uid === 'bad') throw new Error('invalid');
    return { uid, exp: Math.floor(Date.now() / 1000) + 3600, email_verified: verified === 'v', firebase: { sign_in_provider: provider } };
  },
  verifyAppCheck: async (token) => token === 'ok',
};

export const auth = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra });
