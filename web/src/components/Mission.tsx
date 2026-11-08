import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { missionShown, requestUnit, useMission } from '../lib/units';
import { Button, Icon } from './ui';
import { spring } from './theme';

// The day's mission at the top of the zukan.
export function MissionCard({ onFind, onOpenUnit, className = '' }: { onFind: () => void; onOpenUnit?: (id: string) => void; className?: string }) {
  const m = useMission();
  useEffect(() => {
    if (m) missionShown();
  }, [m]);
  if (!m) return null;
  const { unit, done } = m;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-label="今日のミッション"
      className={`flex flex-col gap-3 rounded-[28px] p-4 sm:flex-row sm:items-center sm:p-5 ${className} ${done ? 'bg-[color-mix(in_oklab,var(--leaf)_16%,var(--paper))]' : 'bg-[color-mix(in_oklab,var(--sun)_24%,var(--paper))]'}`}
    >
      <button type="button" onClick={() => onOpenUnit?.(unit.id)} disabled={!onOpenUnit} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${done ? 'bg-leaf text-white' : 'bg-sun text-[#5a3b00]'}`}>
          <Icon name={done ? 'check_circle' : 'flag'} size={28} fill />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-black" style={{ color: done ? 'var(--leaf)' : '#9a6b06' }}>
            {done ? '今日のミッション達成！' : '今日のミッション'}
          </span>
          <span className="block text-[16px] font-black leading-snug">
            {unit.grade} {unit.subject}『{unit.unit}』{done ? 'のモノを見つけたね' : 'に出てくるモノを見つけよう'}
          </span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">
            {done ? 'また明日、新しいミッションが届くよ' : `例: ${unit.examples.slice(0, 4).join('、')}`}
          </span>
        </span>
      </button>
      {!done && (
        <Button icon="photo_camera" className="h-11 shrink-0 self-start sm:self-center" onClick={onFind}>
          さがしに行く
        </Button>
      )}
    </motion.section>
  );
}

// Compact version for the camera screen. tone "glass" sits on the live camera; "paper" on light surfaces.
// Without onClick, tapping it opens the mission's unit in the zukan.
export function MissionBadge({ onClick, tone = 'glass', className = '' }: { onClick?: () => void; tone?: 'glass' | 'paper'; className?: string }) {
  const m = useMission();
  const navigate = useNavigate();
  useEffect(() => {
    if (m) missionShown();
  }, [m]);
  if (!m) return null;
  const { unit, done } = m;
  const skin = tone === 'glass' ? 'glass border border-white/15 bg-black/35 text-white backdrop-blur-xl' : 'bg-paper text-ink shadow-[var(--shadow-card)]';
  return (
    <motion.button
      type="button"
      onClick={
        onClick ??
        (() => {
          requestUnit(unit.id);
          void navigate({ to: '/zukan' });
        })
      }
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileTap={{ scale: 0.95 }}
      transition={spring}
      aria-label={done ? `今日のミッション達成：${unit.grade} ${unit.subject}『${unit.unit}』` : `今日のミッション：${unit.grade} ${unit.subject}『${unit.unit}』に出てくるモノを見つけよう`}
      className={`inline-flex max-w-full items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-left ${skin} ${className}`}
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? 'bg-leaf text-white' : 'bg-sun text-[#5a3b00]'}`}>
        <Icon name={done ? 'check' : 'flag'} size={17} fill />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[10px] font-black opacity-75">{done ? 'ミッション達成！' : '今日のミッション'}</span>
        <span className="block truncate text-[13px] font-black">
          {unit.grade} {unit.subject}『{unit.unit}』
        </span>
      </span>
    </motion.button>
  );
}
