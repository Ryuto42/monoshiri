import { stripRuby } from './ruby';

export const normalizeSearch = (text: string) => stripRuby(text).normalize('NFKC').trim().toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
