import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { api, errorMessage, mediaUrl } from '../lib/api';
import { toast } from '../lib/toast';
import { Icon } from './ui';
import { spring } from './theme';

type Part = { text: string; el?: Element };

const BLOCKS = '.prose-mono :is(h3,h4,p,li), [data-speak]';
const SILENT =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Short chunks keep the first sound quick; long paragraphs are split at sentence ends.
function chunks(text: string, max = 110) {
  const out: string[] = [];
  let cur = '';
  for (const s of text.match(/[^。！？!?]+[。！？!?]*/g) ?? [text]) {
    if (cur && (cur + s).length > max) {
      out.push(cur);
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur);
  return out.map((t) => t.trim()).filter((t) => /[\p{L}\p{N}]/u.test(t));
}

function partsOf(root: HTMLElement | null | undefined, extra: string[]): Part[] {
  const els = root ? [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS)) : [];
  return [
    ...els.flatMap((el) => chunks(el.textContent ?? '').map((text) => ({ text, el }))),
    ...extra.flatMap((t) => chunks(t).map((text) => ({ text }))),
  ];
}

let stopOther: (() => void) | null = null;

export function Speak({ target, text, compact }: { target?: RefObject<HTMLElement | null>; text?: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [pos, setPos] = useState({ at: 0, of: 0 });
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    const parts = partsOf(target?.current, text ? [text] : []);
    if (!parts.length) return;
    stopOther?.();

    const audio = new Audio();
    // Unlock playback inside the tap so later chunks can start after network waits (iOS).
    audio.src = SILENT;
    audio.play().catch(() => {});

    let stopped = false;
    let wake: (() => void) | null = null;
    let lit: Element | undefined;
    const light = (el?: Element) => {
      if (lit === el) return;
      lit?.classList.remove('tts-on');
      lit = el;
      if (!el) return;
      el.classList.add('tts-on');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const stop = () => {
      stopped = true;
      audio.pause();
      wake?.();
      light(undefined);
      setState('idle');
      if (stopOther === stop) stopOther = null;
    };
    stopOther = stopRef.current = stop;

    const urls = new Map<number, Promise<string>>();
    const fetchPart = (i: number) => {
      if (i >= parts.length) return;
      if (!urls.has(i)) {
        const p = api.tts(parts[i].text).then((r) => mediaUrl(r.url));
        p.catch(() => {});
        urls.set(i, p);
      }
      return urls.get(i)!;
    };

    setState('loading');
    setPos({ at: 0, of: parts.length });
    try {
      for (let i = 0; i < parts.length && !stopped; i++) {
        const url = await fetchPart(i)!;
        fetchPart(i + 1);
        fetchPart(i + 2);
        if (stopped) return;
        light(parts[i].el);
        setPos({ at: i + 1, of: parts.length });
        setState('playing');
        audio.src = url;
        await new Promise<void>((resolve, reject) => {
          wake = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('audio'));
          audio.play().catch(reject);
        });
      }
    } catch (e) {
      if (!stopped) {
        const m = errorMessage(e);
        toast(m || '読み上げできませんでした');
      }
    } finally {
      if (!stopped) stop();
    }
  };

  const busy = state !== 'idle';
  return (
    <motion.button
      onClick={() => (busy ? stopRef.current?.() : void start())}
      whileTap={{ scale: 0.94 }}
      transition={spring}
      aria-label={busy ? '読み上げを止める' : '読み上げる'}
      className={`inline-flex h-12 items-center gap-2 rounded-full bg-paper px-4 font-bold shadow-[var(--shadow-card)] hover:bg-paper-2 ${compact ? 'w-12 justify-center px-0' : ''}`}
    >
      {state === 'playing' ? (
        <span className="flex h-5 items-end gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-accent"
              animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
            />
          ))}
        </span>
      ) : state === 'loading' ? (
        <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
      ) : (
        <Icon name="volume_up" size={22} fill />
      )}
      {!compact && (busy ? 'とめる' : '読み上げ')}
      {!compact && state === 'playing' && pos.of > 1 && (
        <span className="text-[12px] tabular-nums text-ink-3">
          {pos.at}/{pos.of}
        </span>
      )}
    </motion.button>
  );
}
