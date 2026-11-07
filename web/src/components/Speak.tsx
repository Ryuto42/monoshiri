import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { api, errorMessage, mediaUrl } from '../lib/api';
import { toast } from './Toast';
import { Icon, spring } from './ui';

let current: HTMLAudioElement | null = null;

export function Speak({ text, compact }: { text: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  const onClick = async () => {
    if (state === 'playing') {
      audio.current?.pause();
      setState('idle');
      return;
    }
    if (state === 'loading') return;
    try {
      setState('loading');
      const { url } = await api.tts(text);
      current?.pause();
      const a = new Audio(mediaUrl(url));
      audio.current = current = a;
      a.onended = a.onpause = () => setState('idle');
      await a.play();
      setState('playing');
    } catch (e) {
      setState('idle');
      const m = errorMessage(e);
      if (m) toast(m);
    }
  };

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={spring}
      aria-label={state === 'playing' ? '読み上げを止める' : '読み上げる'}
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
      ) : (
        <Icon name={state === 'loading' ? 'hourglass_top' : 'volume_up'} size={22} fill className={state === 'loading' ? 'animate-spin' : ''} />
      )}
      {!compact && (state === 'playing' ? 'とめる' : '読み上げ')}
    </motion.button>
  );
}
