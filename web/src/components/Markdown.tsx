import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion } from 'motion/react';
import { parseFlow } from '../lib/flow-parse';
import { rubyToHtml } from '../lib/ruby';

const MERMAID = /```mermaid\s*([\s\S]*?)```/;

function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => {
    // marked misses **bold** when it touches Japanese brackets, so convert it up front.
    const fixed = text.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    return DOMPurify.sanitize(rubyToHtml(marked.parse(fixed, { async: false, breaks: true }) as string), { ADD_TAGS: ['ruby', 'rt', 'rp'] });
  }, [text]);
  return <div className={`prose-mono ${streaming ? 'caret' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const m = MERMAID.exec(text);
  if (m) {
    const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
    return (
      <>
        <Prose text={before} />
        <MermaidDiagram code={m[1].trim()} />
        <Prose text={after} streaming={streaming} />
      </>
    );
  }
  const open = text.indexOf('```mermaid');
  return <Prose text={open >= 0 ? text.slice(0, open) : text} streaming={streaming} />;
}

export function MermaidDiagram({ code }: { code: string }) {
  const flow = useMemo(() => parseFlow(code), [code]);
  if (!flow) return null;
  const next = new Map(flow.edges.map((e) => [e.from, e]));
  return (
    <motion.figure
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      className="my-5 rounded-3xl bg-paper-2 p-4"
    >
      <figcaption className="mb-3 text-[12px] font-bold text-ink-3">流れで見てみよう</figcaption>
      <ol className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:items-center">
        {flow.nodes.map((n, i) => {
          const edge = next.get(n.id);
          const last = i === flow.nodes.length - 1;
          return (
            <motion.li
              key={n.id}
              className="flex flex-col items-center gap-1 sm:flex-row"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.12 * i }}
            >
              <span className="flex w-full items-center gap-2 rounded-2xl border-2 border-accent/50 bg-paper px-3 py-2 text-[14px] font-bold leading-snug sm:w-auto">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-black text-accent-ink">{i + 1}</span>
                {n.label}
              </span>
              {!last && (
                <span className="flex items-center gap-1 text-ink-3 sm:px-1" aria-hidden>
                  <span className="ms text-[20px] sm:hidden">arrow_downward</span>
                  <span className="ms hidden text-[20px] sm:inline">arrow_forward</span>
                  {edge?.label && <span className="text-[11px] font-bold">{edge.label}</span>}
                </span>
              )}
            </motion.li>
          );
        })}
      </ol>
    </motion.figure>
  );
}
