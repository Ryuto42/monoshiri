import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { Card } from '../lib/types';
import type { Stage } from '../lib/level';
import { onBack } from '../lib/native';
import { stripRuby } from '../lib/ruby';
import { BAND_LABEL, cardsByUnit, STATUS_LABEL, subjectStyle, unitById, unitGroups, unitStatus, type Unit } from '../lib/units';
import { CardFace } from '../components/CardFace';
import { Button, Icon } from '../components/ui';

const norm = (s: string) => stripRuby(s).toLowerCase();

// 教科でみる: every unit of the course of study by grade × subject, with the cards collected for each.
export function ZukanUnits({ cards, q, subject, stage, onOpenUnit }: {
  cards: Card[]; q: string; subject: string; stage: Stage | null; onOpenUnit: (id: string) => void;
}) {
  const have = cardsByUnit(cards);
  const query = norm(q.trim());
  const matches = (u: Unit) =>
    !query ||
    [u.unit, u.subject, u.grade, ...u.examples, ...(have.get(u.id) ?? []).flatMap((c) => [c.name, c.reading])].some((t) => norm(t).includes(query));
  const groups = unitGroups(stage)
    .filter((g) => subject === 'すべて' || g.subject === subject)
    .map((g) => ({ ...g, total: g.units.length, got: g.units.filter((u) => have.has(u.id)).length, units: g.units.filter(matches) }))
    .filter((g) => g.units.length > 0);

  if (!groups.length) return <p className="mt-10 text-center text-ink-3">見つかりませんでした</p>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="mt-4 space-y-4">
      {groups.map((g, i) => {
        const s = subjectStyle(g.subject);
        const bandStart = i === 0 || groups[i - 1].band !== g.band;
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
                  <p className="text-[13px] font-bold text-ink-3" aria-label={`${g.total}単元のうち${g.got}単元のカードがある`}>
                    <span className={`tabular-nums ${g.got ? 'text-ink' : ''}`}>{g.got}</span>/{g.total} 単元
                  </p>
                </div>
                <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-paper-3 sm:w-32" aria-hidden>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: s.ink }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(g.got / g.total) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 24, delay: 0.1 }}
                  />
                </div>
              </header>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.units.map((u) => {
                  const list = have.get(u.id) ?? [];
                  const got = list.length > 0;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => onOpenUnit(u.id)}
                        className={`flex h-full w-full items-center gap-3 rounded-2xl p-3 text-left transition-[background-color,transform] active:scale-[0.97] ${got ? 'bg-paper shadow-[var(--shadow-card)]' : 'border border-dashed border-line hover:bg-paper'}`}
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                          style={got ? { background: s.ink, color: '#fff' } : { background: 'var(--paper-3)', color: 'var(--ink-3)' }}
                        >
                          <Icon name={got ? 'check' : 'search'} size={20} fill={got} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-black leading-snug ${got ? '' : 'text-ink-2'}`}>『{u.unit}』</span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {got ? list.map((c) => stripRuby(c.name)).join('、') : `例: ${u.examples.slice(0, 3).join('、')}`}
                          </span>
                        </span>
                        {got && (
                          <span className="shrink-0 rounded-full px-2 text-[12px] font-black leading-6" style={{ background: s.bg, color: s.ink }}>
                            {list.length}まい
                          </span>
                        )}
                      </button>
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

export function UnitDetail({ unitId, cards, stage, onClose, onOpenCard, onFind }: {
  unitId: string; cards: Card[]; stage: Stage | null; onClose: () => void; onOpenCard: (id: string) => void; onFind: () => void;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => onBack(onClose), [onClose]);
  useEffect(() => box.current?.scrollIntoView({ block: 'start' }), [unitId]);
  const u = unitById.get(unitId);
  if (!u) return null;
  const s = subjectStyle(u.subject);
  const list = cardsByUnit(cards).get(u.id) ?? [];
  const status = unitStatus(u, stage);
  const names = new Set(list.map((c) => stripRuby(c.name)));
  const others = u.examples.filter((e) => !names.has(e));
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
              <motion.button data-card-id={c.id} onClick={() => onOpenCard(c.id)} whileTap={{ scale: 0.96 }} className="block w-full text-left">
                <CardFace card={c} no={cards.length - cards.indexOf(c)} />
              </motion.button>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <div className="mt-6 rounded-[28px] bg-paper-2 p-5">
          <h3 className="flex items-center gap-2 text-[17px] font-black">
            <Icon name="travel_explore" size={22} fill className="text-accent" />
            {list.length ? 'ほかにも、こんなモノが出てくるよ' : 'さがしてみよう'}
          </h3>
          {!list.length && <p className="mt-1 text-[14px] text-ink-2">身の回りでこんなモノを見つけて撮ってみよう。カードにすると、この単元に入るよ。</p>}
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((e) => (
              <li key={e} className="rounded-full bg-paper px-3.5 py-1.5 text-[14px] font-bold shadow-[var(--shadow-card)]">
                {e}
              </li>
            ))}
          </ul>
          <Button className="mt-4" icon="photo_camera" onClick={onFind}>
            カメラでさがす
          </Button>
        </div>
      )}
    </motion.section>
  );
}
