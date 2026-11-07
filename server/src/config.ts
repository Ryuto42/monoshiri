export const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'monoshiri-df26';
export const LOCAL = process.env.LOCAL_DEV === '1';
export const PORT = Number(process.env.PORT ?? 8080);
export const BUCKET = process.env.MEDIA_BUCKET ?? `${PROJECT}-media`;
export const YT_KEY = process.env.YOUTUBE_API_KEY ?? '';

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ??
  `https://${PROJECT}.web.app,https://${PROJECT}.firebaseapp.com,capacitor://localhost,https://localhost,http://localhost:5173,http://127.0.0.1:5173`)
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
export const CAP_JPY = Number(process.env.CAP_JPY ?? 200);
export const JPY_PER_USD = Number(process.env.JPY_PER_USD ?? 160);
export const SAFETY = 1.2;
export const CAP_USD = CAP_JPY / JPY_PER_USD;
export const VIDEO_LIMIT = Number(process.env.VIDEO_LIMIT ?? 2);
