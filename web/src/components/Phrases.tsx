import { Fragment, useMemo } from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

// BudouX (Google) splits Japanese into phrases (文節) so a line can break between them instead of mid-word.
const parser = loadDefaultJapaneseParser();

// Copy written for children already puts a space between phrases (分かち書き); BudouX would split those words again.
// A space between two Japanese letters, more than once, marks such copy ("いまの 3 枚" does not count).
const WAKACHI = /[\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}ー》] [\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}「]/gu;
const spaced = (text: string) => (text.match(WAKACHI)?.length ?? 0) >= 2;

/** Text that wraps only between phrases. Use it inside .phrase-wrap, which turns off breaks inside a word. */
export function Phrases({ text }: { text: string }) {
  const parts = useMemo(() => (spaced(text) ? [text] : parser.parse(text)), [text]);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
