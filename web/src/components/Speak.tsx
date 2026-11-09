import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { api, errorMessage, mediaUrl } from '../lib/api';
import { currentLevel } from '../lib/level';
import { stripRuby } from '../lib/ruby';
import { toast } from '../lib/toast';
import type { TtsRef } from '../lib/types';
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

// Furigana (<rt>) is for the eyes only: reading it too would voice "水みず".
function spokenText(el: Element) {
  if (!el.querySelector('rt, rp')) return el.textContent ?? '';
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('rt, rp').forEach((r) => r.remove());
  return copy.textContent ?? '';
}

function partsOf(root: HTMLElement | null | undefined, extra: string[]): Part[] {
  const els = root ? [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS)) : [];
  return [
    ...els.flatMap((el) => chunks(stripRuby(spokenText(el))).map((text) => ({ text, el }))),
    ...extra.flatMap((t) => chunks(stripRuby(t)).map((text) => ({ text }))),
  ];
}

// One element for every read-aloud: iOS lets an element play freely only after it has played inside a tap.
let shared: HTMLAudioElement | null = null;
const player = () => (shared ??= new Audio());

/** Call inside a tap (e.g. choosing a marker) so a read-aloud that starts on its own later is allowed to play. */
// oxlint-disable-next-line react/only-export-components -- shares the player above; costs only fast refresh of this file
export function unlockAudio() {
  const a = player();
  if (!a.paused) return;
  a.src = SILENT;
  a.play().catch(() => {});
}

let stopOther: (() => void) | null = null;

// How long the text has to stay unchanged before an automatic read-aloud starts (streamed text keeps changing).
const SETTLE_MS = 700;

export function Speak({ target, text, compact, ttsRef, autoStart }: {
  target?: RefObject<HTMLElement | null>; text?: string; compact?: boolean; ttsRef?: TtsRef; autoStart?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [pos, setPos] = useState({ at: 0, of: 0 });
  const stopRef = useRef<(() => void) | null>(null);
  const touched = useRef(false);

  useEffect(() => () => stopRef.current?.(), []);

  const start = async (auto = false) => {
    const parts = partsOf(target?.current, text ? [text] : []);
    if (!parts.length) return;
    stopOther?.();

    const audio = player();
    // Unlock playback inside the tap so later chunks can start after network waits (iOS).
    if (!auto) {
      audio.src = SILENT;
      audio.play().catch(() => {});
    }

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
      if (stopped) return;
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
        const p = api.tts(parts[i].text, ttsRef).then((r) => mediaUrl(r.url));
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
      // A blocked autoplay just leaves the button for a tap; it is not worth a message.
      const blocked = auto && e instanceof DOMException && e.name === 'NotAllowedError';
      if (!stopped && !blocked) {
        const m = errorMessage(e, 'speech');
        toast(m || '読み上げできませんでした');
      }
    } finally {
      if (!stopped) stop();
    }
  };

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  // Youngest readers get the explanation read to them as soon as it has settled on screen.
  useEffect(() => {
    if (!autoStart || currentLevel() !== 'lower') return;
    const root = target?.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (touched.current) return;
        if (!partsOf(target?.current, text ? [text] : []).length) return;
        touched.current = true;
        obs?.disconnect();
        void startRef.current(true);
      }, SETTLE_MS);
    };
    const obs = root ? new MutationObserver(arm) : null;
    obs?.observe(root!, { childList: true, subtree: true, characterData: true });
    arm();
    return () => {
      clearTimeout(timer);
      obs?.disconnect();
    };
  }, [autoStart, target, text]);

  const busy = state !== 'idle';
  return (
    <motion.button
      onClick={() => {
        touched.current = true;
        if (busy) stopRef.current?.();
        else void start();
      }}
      whileTap={{ scale: 0.94 }}
      transition={spring}
      aria-label={busy ? '読み上げを止める' : '読み上げる'}
      className={`inline-flex items-center gap-2 rounded-full bg-paper px-4 font-bold shadow-[var(--shadow-card)] hover:bg-paper-2 ${compact ? 'h-11 w-11 justify-center px-0' : 'h-12'}`}
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
