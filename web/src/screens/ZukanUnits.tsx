import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { Card } from '../lib/types';
import type { Stage } from '../lib/level';
import { onBack } from '../lib/native';
import { stripRuby } from '../lib/ruby';
import { BAND_LABEL, cardsByUnit, STATUS_LABEL, subjectStyle, unitById, unitGroups, unitStatus, type Unit } from '../lib/units';
import { spring } from '../components/theme';
import { CardFace } from '../components/CardFace';
import { Button, Icon } from '../components/ui';

const norm = (s: string) => stripRuby(s).toLowerCase();

// 教科でみる: only the units this person has cards for, by grade × subject.
export function ZukanUnits({ cards, q, subject, stage, onOpenUnit }: {
  cards: Card[]; q: string; subject: string; stage: Stage | null; onOpenUnit: (id: string) => void;
}) {
  const have = cardsByUnit(cards);
  const query = norm(q.trim());
  const matches = (u: Unit) =>
    !query || [u.unit, u.subject, u.grade, ...(have.get(u.id) ?? []).flatMap((c) => [c.name, c.reading])].some((t) => norm(t).includes(query));
  const groups = unitGroups(stage)
    .filter((g) => subject === 'すべて' || g.subject === subject)
    .map((g) => ({ ...g, units: g.units.filter((u) => have.has(u.id) && matches(u)) }))
    .filter((g) => g.units.length > 0);

  if (!have.size) return <p className="phrase-wrap mt-10 text-center text-ink-3">カードにした モノの単元が ここに ならぶよ</p>;
  if (!groups.length) return <p className="mt-10 text-center text-ink-3">見つかりませんでした</p>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="mt-4 space-y-4">
      {groups.map((g, i) => {
        const s = subjectStyle(g.subject);
        const bandStart = i === 0 || groups[i - 1].band !== g.band;
        const count = new Set(g.units.flatMap((u) => (have.get(u.id) ?? []).map((c) => c.id))).size;
        return (
          <div key={g.key}>
            {bandStart && (
              <h2 className={`flex items-center gap-2 text-[18px] font-black ${i ? 'mt-8' : ''}`}>
                {BAND_LABEL[g.band]}
                {g.band === stage && <span className="rounded-full bg-accent px-2.5 text-[12px] font-black leading-6 text-accent-ink">あなたの学年</span>}
              </h2>
            )}
            <section className="mt-3 rounded-[28px] bg-paper-2 p-4" aria-label={`${g.grade} ${g.subject}`}>
              <header className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: s.bg, color: s.ink }}>
                  <Icon name={s.icon} size={24} fill />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-black leading-tight">
                    {g.grade} {g.subject}
                  </h3>
                  <p className="text-[13px] font-bold text-ink-3">
                    <span className="tabular-nums">{g.units.length}</span> 単元・<span className="tabular-nums">{count}</span>まい
                  </p>
                </div>
              </header>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.units.map((u) => {
                  const list = have.get(u.id) ?? [];
                  return (
                    <li key={u.id}>
                      <motion.button
                        type="button"
                        onClick={() => onOpenUnit(u.id)}
                        whileTap={{ scale: 0.97 }}
                        transition={spring}
                        className="flex h-full w-full items-center gap-3 rounded-2xl bg-paper p-3 text-left shadow-[var(--shadow-card)]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: s.ink, color: '#fff' }}>
                          <Icon name="check" size={20} fill />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-black leading-snug">『{u.unit}』</span>
                          <span className="block truncate text-[12px] text-ink-3">{list.map((c) => stripRuby(c.name)).join('、')}</span>
                        </span>
                        <span className="shrink-0 rounded-full px-2 text-[12px] font-black leading-6" style={{ background: s.bg, color: s.ink }}>
                          {list.length}まい
                        </span>
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        );
      })}
    </motion.div>
  );
}

export function UnitDetail({ unitId, cards, stage, onClose, onOpenCard }: {
  unitId: string; cards: Card[]; stage: Stage | null; onClose: () => void; onOpenCard: (id: string) => void;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => onBack(onClose), [onClose]);
  useEffect(() => box.current?.scrollIntoView({ block: 'start' }), [unitId]);
  const u = unitById.get(unitId);
  if (!u) return null;
  const s = subjectStyle(u.subject);
  const list = cardsByUnit(cards).get(u.id) ?? [];
  const status = unitStatus(u, stage);
  return (
    <motion.section
      ref={box}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="mt-4 scroll-mt-48"
      aria-label={`${u.grade} ${u.subject}『${u.unit}』`}
    >
      <Button tone="ghost" icon="arrow_back" className="-ml-3 h-10 px-3 text-[14px]" onClick={onClose}>
        単元のいちらん
      </Button>
      <div className="mt-2 rounded-[28px] p-5" style={{ background: s.bg, color: s.ink }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 text-[13px] font-black leading-7">
            <Icon name={s.icon} size={16} fill />
            {u.grade} {u.subject}
          </span>
          {status && <span className="rounded-full bg-white/70 px-2.5 text-[12px] font-black leading-6">{STATUS_LABEL[status]}</span>}
        </div>
        <h2 className="mt-2 text-[clamp(24px,4vw,32px)] font-black leading-tight text-[#2a2017]">『{u.unit}』</h2>
        <p className="mt-1 text-[14px] font-bold">{list.length ? `あつめたカード ${list.length}まい` : 'まだカードがありません'}</p>
      </div>

      {list.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((c) => (
            <li key={c.id}>
              <motion.button data-card-id={c.id} onClick={() => onOpenCard(c.id)} whileTap={{ scale: 0.97 }} transition={spring} className="block w-full text-left">
                <CardFace card={c} no={cards.length - cards.indexOf(c)} />
              </motion.button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
