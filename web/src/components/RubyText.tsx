import { Fragment, useContext } from 'react';
import { ReadingStage, rubyParts } from '../lib/ruby';
import { useStage } from '../lib/level';

// Plain text that may carry 漢字《かんじ》 marks; renders them as furigana.
// Junior high and older read these kanji already, so the readings are left out for them
// (before an age is given, nobody's stage is known and the readings stay).
export function RubyText({ text }: { text: string | null | undefined }) {
  const saved = useStage().stage;
  const override = useContext(ReadingStage);
  const stage = override !== undefined ? override : saved;
  if (!text) return null;
  const readings = stage !== 'junior' && stage !== 'senior';
  return (
    <>
      {rubyParts(text).map((p, i) =>
        p.rt && readings ? (
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
