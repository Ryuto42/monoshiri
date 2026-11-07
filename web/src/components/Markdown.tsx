import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion } from 'motion/react';

const MERMAID = /```mermaid\s*([\s\S]*?)```/;

export function splitMermaid(text: string) {
  const m = MERMAID.exec(text);
  const open = text.indexOf('```mermaid');
  if (m) return { body: text.replace(MERMAID, '\n'), mermaid: m[1].trim() };
  if (open >= 0) return { body: text.slice(0, open), mermaid: null, pending: true };
  return { body: text, mermaid: null };
}

function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => {
    // marked misses **bold** when it touches Japanese brackets, so convert it up front.
    const fixed = text.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    return DOMPurify.sanitize(marked.parse(fixed, { async: false, breaks: true }) as string);
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

let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;
let seq = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    mermaidLoader ??= import('mermaid').then((m) => {
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: 'Zen Maru Gothic, sans-serif',
        htmlLabels: false,
        flowchart: { curve: 'basis', padding: 14, nodeSpacing: 28, rankSpacing: 36, htmlLabels: false },
        themeVariables: {
          primaryColor: dark ? '#2f271f' : '#fff7ea',
          primaryBorderColor: dark ? '#ff8257' : '#ef6a3a',
          primaryTextColor: dark ? '#f5ece0' : '#2a2017',
          lineColor: dark ? '#c4b5a4' : '#66574a',
          fontSize: '15px',
        },
      });
      return m.default;
    });
    mermaidLoader
      .then(async (mm) => {
        const src = innerWidth < 700 ? code.replace(/^(flowchart|graph)\s+(LR|RL)/m, '$1 TD') : code;
        const { svg } = await mm.render(`mmd-${++seq}`, src);
        if (!alive || !ref.current) return;
        ref.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        setState('ok');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [code]);

  if (state === 'error') return null;
  return (
    <motion.figure
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      className="my-5 rounded-3xl bg-paper-2 p-4 overflow-x-auto no-scrollbar"
    >
      <figcaption className="mb-2 text-[12px] font-bold text-ink-3">流れで見てみよう</figcaption>
      {state === 'loading' && <div className="skeleton h-24" />}
      <div ref={ref} className="[&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto" />
    </motion.figure>
  );
}
