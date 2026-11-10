export const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'monoshiri-df26';
// The public Hosting site (https://monoshiri.web.app); other projects default to their own project-named site.
export const SITE = process.env.HOSTING_SITE ?? (PROJECT === 'monoshiri-df26' ? 'monoshiri' : PROJECT);
export const LOCAL = process.env.LOCAL_DEV === '1';
// The web app's address: links in the emails the API sends point here.
export const APP_URL = process.env.APP_URL ?? `https://${SITE}.web.app`;

// Sign-up and password emails are sent by the API through this SMTP account (Firebase's own templates can't be edited).
// SMTP_PASSWORD comes from Secret Manager; without it the app falls back to Firebase's standard emails.
export const SMTP = {
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER ?? '',
  password: process.env.SMTP_PASSWORD ?? '',
  fromName: process.env.MAIL_FROM_NAME ?? 'モノシリ',
};
// Where people can write to us; the emails say so instead of "do not reply".
export const CONTACT_EMAIL = 'monoshiri.app@gmail.com';
export const PORT = Number(process.env.PORT ?? 8080);
export const BUCKET = process.env.MEDIA_BUCKET ?? `${PROJECT}-media`;
export const YT_KEY = process.env.YOUTUBE_API_KEY ?? '';

// capacitor://localhost and https://localhost are the iOS and Android app shells; the Vite dev server is allowed only in local dev.
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ??
  [`https://${SITE}.web.app`, `https://${SITE}.firebaseapp.com`, `https://${PROJECT}.web.app`, `https://${PROJECT}.firebaseapp.com`,
    'capacitor://localhost', 'https://localhost',
    ...(LOCAL ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])].join(','))
  .split(',');

export const MODELS = {
  detect: process.env.MODEL_DETECT ?? 'gemini-3.1-flash-lite',
  explore: process.env.MODEL_EXPLORE ?? 'gemini-3.8-flash',
  deep: process.env.MODEL_DEEP ?? 'gemini-3.8-flash',
  quiz: process.env.MODEL_QUIZ ?? 'gemini-3.1-flash-lite',
  image: process.env.MODEL_IMAGE ?? 'gemini-nano-banana-2.1',
  tts: process.env.MODEL_TTS ?? 'gemini-3.8-flash-lite-tts',
  video: process.env.MODEL_VIDEO ?? 'gemini-omni-1.2-flash',
};

// USD per 1M tokens. Image/video outputs are estimated per item.
export const PRICES: Record<string, { in: number; out: number; perImage?: number }> = {
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
  'gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-nano-banana-2.1': { in: 1.5, out: 0, perImage: 0.0336 },
  'gemini-3.1-flash-lite-image': { in: 0.25, out: 0, perImage: 0.0336 },
  'gemini-3.8-flash-lite-tts': { in: 0.5, out: 6 },
  'gemini-omni-1.2-flash': { in: 1.5, out: 12 },
};

// Hard stop for AI spend estimated by the app itself (the billing kill switch sits above this).
export const CAP_JPY = Number(process.env.CAP_JPY ?? 1800);
export const JPY_PER_USD = Number(process.env.JPY_PER_USD ?? 160);
export const SAFETY = 1.2;
export const CAP_USD = CAP_JPY / JPY_PER_USD;
export const VIDEO_LIMIT = Number(process.env.VIDEO_LIMIT ?? 2);

// Lifetime AI spend allowed per account (estimated, same meter as CAP_JPY). Cached results cost nothing and stay free.
export const USER_CAP_JPY = {
  guest: Number(process.env.USER_CAP_GUEST_JPY ?? 50),
  member: Number(process.env.USER_CAP_MEMBER_JPY ?? 300),
  // Operators' own accounts (prewarm script), listed in ADMIN_UIDS; still bounded by CAP_JPY.
  admin: CAP_JPY,
};
export const ADMIN_UIDS = new Set((process.env.ADMIN_UIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

// Grounding with Google Search (Gemini 3): $14 per 1,000 search queries on top of tokens.
export const GROUNDING_USD_PER_QUERY = Number(process.env.GROUNDING_USD_PER_QUERY ?? 0.014);
// The first 5,000 search queries each month cost nothing, so only queries past that are put on the meters.
export const GROUNDING_FREE_PER_MONTH = Number(process.env.GROUNDING_FREE_PER_MONTH ?? 5000);

// App Check: '1' makes new generation require an attested app (or a signed-in account). Otherwise tokens are only checked and logged.
export const APPCHECK_ENFORCE = process.env.APPCHECK_ENFORCE === '1';
// While App Check is enforced, guests who can't attest (the iOS / Android apps) still get new generation from one shared
// daily pool, so anonymous accounts made by a script can't spend more than this a day between them.
export const UNATTESTED_POOL_JPY = Number(process.env.UNATTESTED_POOL_JPY ?? 150);

// Learning stages the explanations are written for. 'std' is the original audience (upper elementary to junior high)
// and is what guests and people who haven't picked a stage get.
export const LEVELS = ['std', 'lower', 'upper', 'junior', 'senior'] as const;
export type Level = (typeof LEVELS)[number];
export const asLevel = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : 'std');
