import { motion } from 'motion/react';
import type { Card } from '../lib/types';
import type { Stage } from '../lib/level';
import { stripRuby } from '../lib/ruby';
import { BAND_LABEL, cardsByUnit, STATUS_LABEL, subjectStyle, unitGroups, unitStatus, type Unit } from '../lib/units';
import { spring } from '../components/theme';
import { CardFace } from '../components/CardFace';
import { Icon } from '../components/ui';

const norm = (s: string) => stripRuby(s).toLowerCase();

// 教科でみる: only the units this person has cards for, by grade × subject, with each unit's cards laid out under it
// (no second step to open a unit).
export function ZukanUnits({ cards, q, subject, stage, onOpenCard }: {
  cards: Card[]; q: string; subject: string; stage: Stage | null; onOpenCard: (id: string, el: HTMLElement) => void;
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
    <div className="mt-4">
      {groups.map((g, i) => {
        const s = subjectStyle(g.subject);
        const bandStart = i === 0 || groups[i - 1].band !== g.band;
        const count = new Set(g.units.flatMap((u) => (have.get(u.id) ?? []).map((c) => c.id))).size;
        return (
          <div key={g.key}>
            {bandStart && (
              <h2 className={`flex items-center gap-2 text-[18px] font-black ${i ? 'mt-10' : ''}`}>
                {BAND_LABEL[g.band]}
                {g.band === stage && <span className="rounded-full bg-accent px-2.5 text-[12px] font-black leading-6 text-accent-ink">あなたの学年</span>}
              </h2>
            )}
            <section className="mt-3 rounded-[28px] bg-paper-2 p-4 sm:p-5" aria-label={`${g.grade} ${g.subject}`}>
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
              {/* On wider screens the units flow side by side, each as wide as its cards, so a unit with one or two cards
                  doesn't leave the rest of the row empty. */}
              <div className="sm:flex sm:flex-wrap sm:gap-x-10">
                {g.units.map((u) => {
                  const list = have.get(u.id) ?? [];
                  const status = unitStatus(u, stage);
                  return (
                    <section key={u.id} className="mt-5 min-w-0" aria-label={`『${u.unit}』`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="text-[16px] font-black leading-snug">『{u.unit}』</h4>
                        {status && (
                          <span className="rounded-full px-2 text-[12px] font-black leading-6" style={{ background: s.bg, color: s.ink }}>
                            {STATUS_LABEL[status]}
                          </span>
                        )}
                        <span className="text-[13px] font-bold tabular-nums text-ink-3">{list.length}まい</span>
                      </div>
                      <ul className="mt-2 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
                        {list.map((c) => (
                          <li key={c.id} className="sm:w-[196px]">
                            <motion.button
                              data-card-id={c.id}
                              onClick={(e) => onOpenCard(c.id, e.currentTarget)}
                              whileTap={{ scale: 0.97 }}
                              transition={spring}
                              className="block w-full text-left"
                            >
                              <CardFace card={c} no={cards.length - cards.indexOf(c)} />
                            </motion.button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}
