import { createContext } from 'react';
import type { Stage } from './level';

// Lets a screen use a stage that isn't saved yet (the consent step right after the age is entered).
export const ReadingStage = createContext<Stage | null | undefined>(undefined);

// Explanations for younger stages mark readings as 漢字《かんじ》 (the Aozora Bunko convention).
const RUBY = /([\p{Script=Han}々〆ヶ]+)《([^《》\n]{1,20})》/gu;

export const stripRuby = (s: string) => s.replace(RUBY, '$1').replace(/《[^《》\n]{0,20}》/g, '');

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// For HTML that is sanitized afterwards (DOMPurify keeps ruby/rt): turns the marks into <ruby> elements.
export const rubyToHtml = (html: string) => html.replace(RUBY, '<ruby>$1<rt>$2</rt></ruby>');

export type RubyPart = { base: string; rt?: string };

export function rubyParts(s: string): RubyPart[] {
  const out: RubyPart[] = [];
  let last = 0;
  for (const m of s.matchAll(RUBY)) {
    if (m.index > last) out.push({ base: s.slice(last, m.index) });
    out.push({ base: m[1], rt: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ base: s.slice(last) });
  return out.map((p) => (p.rt ? p : { base: p.base.replace(/《[^《》\n]{0,20}》/g, '') }));
}

export { esc as escapeHtml };
