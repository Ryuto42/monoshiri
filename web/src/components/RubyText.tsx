import { Fragment } from 'react';
import { rubyParts } from '../lib/ruby';

// Plain text that may carry 漢字《かんじ》 marks; renders them as furigana.
export function RubyText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <>
      {rubyParts(text).map((p, i) =>
        p.rt ? (
          <ruby key={i}>
            {p.base}
            <rt>{p.rt}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{p.base}</Fragment>
        ),
      )}
    </>
  );
}
