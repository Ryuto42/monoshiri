import { Fragment, useContext } from 'react';
import { ReadingStage, rubyParts, stripRuby } from '../lib/ruby';
import { useStage, type Stage } from '../lib/level';
import { Phrases } from './Phrases';

function useReadingStage(): Stage | null {
  const saved = useStage().stage;
  const override = useContext(ReadingStage);
  return override !== undefined ? override : saved;
}

// Plain text that may carry 漢字《かんじ》 marks; renders them as furigana.
// Junior high and older read these kanji already, so the readings are left out for them
// (before an age is given, nobody's stage is known and the readings stay).
export function RubyText({ text }: { text: string | null | undefined }) {
  const stage = useReadingStage();
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

// The app's own fixed copy (buttons, guides, empty states, errors): readings only for the youngest stage, which is
// still learning its first kanji; everyone else gets the plain text, wrapped between phrases (use inside .phrase-wrap).
// Screen readers (and accessible names) get the plain text in one piece: <ruby> splits a name into words otherwise.
export function KidText({ text }: { text: string }) {
  const stage = useReadingStage();
  const parts = rubyParts(text);
  const plain = stripRuby(text);
  if (stage !== 'lower' || !parts.some((p) => p.rt)) return <Phrases text={plain} />;
  return (
    <>
      <span className="sr-only">{plain}</span>
      <span aria-hidden>
        {parts.map((p, i) =>
          p.rt ? (
            <ruby key={i}>
              {p.base}
              <rt>{p.rt}</rt>
            </ruby>
          ) : (
            <Phrases key={i} text={p.base} />
          ),
        )}
      </span>
    </>
  );
}
