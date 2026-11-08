import { motion } from 'motion/react';
import type { Stage } from '../lib/level';
import type { UnitLink } from '../lib/types';
import { STATUS_LABEL, subjectStyle, unitById, unitStatus, type UnitStatus } from '../lib/units';
import { Icon } from './ui';

const STATUS_TONE: Record<UnitStatus, string> = {
  now: 'bg-accent text-accent-ink',
  soon: 'bg-accent-soft text-accent',
  done: 'bg-leaf-soft text-leaf',
  later: 'bg-paper-3 text-ink-3',
};

// "学校でならうよ": where this thing comes up at school, marked against the person's own school years.
export function UnitChips({ links, stage, className = '' }: { links: UnitLink[]; stage: Stage | null; className?: string }) {
  const rows = links.flatMap((l) => {
    const u = unitById.get(l.id);
    return u ? [{ ...l, u, status: unitStatus(u, stage) }] : [];
  });
  if (!rows.length) return null;
  return (
    <ul className={`grid gap-2 ${className}`}>
      {rows.map(({ id, why, u, status }, i) => {
        const s = subjectStyle(u.subject);
        const hot = status === 'now' || status === 'soon';
        return (
          <motion.li
            key={id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30, delay: i * 0.05 }}
            className={`flex items-start gap-3 rounded-3xl p-3.5 ${hot ? 'bg-paper-2 ring-2 ring-inset ring-accent/45' : 'bg-paper-2'}`}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: s.bg, color: s.ink }}>
              <Icon name={s.icon} size={24} fill />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full px-2 text-[11px] font-black leading-5" style={{ background: s.bg, color: s.ink }}>
                  {u.grade} {u.subject}
                </span>
                {status && <span className={`rounded-full px-2 text-[11px] font-black leading-5 ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>}
              </span>
              <span className="block text-[16px] font-black leading-snug">『{u.unit}』</span>
              {why && <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{why}</span>}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
