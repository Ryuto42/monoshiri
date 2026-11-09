import { motion } from 'motion/react';
import type { Card } from '../lib/types';
import type { Stage } from '../lib/level';
import { normalizeSearch as norm } from '../lib/search';
import { BAND_LABEL, cardsByUnit, STATUS_LABEL, subjectStyle, unitGroups, unitStatus, type Unit } from '../lib/units';
import { spring } from '../components/theme';
import { CardFace } from '../components/CardFace';
import { Icon } from '../components/ui';
import { KidText } from '../components/RubyText';


// 教科でみる: only the units this person has cards for, by grade × subject, with each unit's cards laid out under it
// (no second step to open a unit).
export function ZukanUnits({ cards, q, subject, stage, onOpenCard }: {
  cards: Card[]; q: string; subject: string; stage: Stage | null; onOpenCard: (id: string, el: HTMLElement) => void;
}) {
  const have = cardsByUnit(cards);
  const query = norm(q.trim());
  const matches = (u: Unit) =>
    !query || [u.unit, u.subject, u.grade, ...(have.get(u.id) ?? []).flatMap((c) => [c.name, c.reading, c.en])].some((t) => norm(t).includes(query));
  const groups = unitGroups(stage)
    .filter((g) => subject === 'すべて' || g.subject === subject)
    .map((g) => ({ ...g, units: g.units.filter((u) => have.has(u.id) && matches(u)) }))
    .filter((g) => g.units.length > 0);

  if (!have.size) {
    return (
      <div className="mt-8 overflow-hidden rounded-[32px] bg-paper-2">
        <div className="flex justify-center gap-3 pt-8 pb-4" aria-hidden>
          {['science', 'public', 'menu_book'].map((icon, i) => (
            <motion.div
              key={icon}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.08 } }}
              className="grid h-[88px] w-[88px] place-items-center rounded-[24px] border-[3px] border-dashed border-ink/20 text-ink/25"
              style={{ rotate: (i - 1) * 6 }}
            >
              <Icon name={icon} size={36} />
            </motion.div>
          ))}
        </div>
        <div className="phrase-wrap px-6 pb-8 text-center">
          <p className="text-[20px] font-black">
            <KidText text="まだ単元《たんげん》がありません" />
          </p>
          <p className="mt-1 text-ink-2">
            <KidText text="カードにしたモノが、学校《がっこう》のどの授業《じゅぎょう》に出《で》てくるかが、ここにならぶよ。" />
          </p>
        </div>
      </div>
    );
  }
  if (!groups.length) return <p className="mt-10 text-center text-ink-3">見つかりませんでした</p>;

  // A new subject fades the list in place, the same as a new genre does.
  return (
    <motion.div key={subject} id="zukan-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="mt-4">
      {groups.map((g, i) => {
        const s = subjectStyle(g.subject);
        const bandStart = i === 0 || groups[i - 1].band !== g.band;
        return (
          <div key={g.key}>
            {bandStart && (
              <h2 className={`flex items-center gap-2 text-[18px] font-black ${i ? 'mt-10' : ''}`}>
                {BAND_LABEL[g.band]}
                {g.band === stage && <span className="rounded-full bg-accent px-2.5 text-[12px] font-black leading-6 text-accent-ink">あなたの学年</span>}
              </h2>
            )}
            <section className="mt-3 rounded-[28px] bg-paper-2 p-3 sm:p-5" aria-label={`${g.grade} ${g.subject}`}>
              <header className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: s.bg, color: s.ink }}>
                  <Icon name={s.icon} size={24} fill />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-black leading-tight">
                    {g.grade} {g.subject}
                  </h3>
                  <p className="text-[13px] font-bold text-ink-3">
                    <span className="tabular-nums">{g.units.length}</span> 単元
                  </p>
                </div>
              </header>
              {/* Each unit starts at the left edge, in line with the subject header above, with its cards under it: two to a
                  row on a phone, a card's width each on wider screens, where the units also sit side by side. (Centred, a
                  unit with one card floated in the middle; Aya chose the left, 2026-11-09.) */}
              <div className="flex flex-wrap sm:gap-x-10">
                {g.units.map((u) => {
                  const list = have.get(u.id) ?? [];
                  const status = unitStatus(u, stage);
                  return (
                    <section key={u.id} className="mt-5 flex w-full min-w-0 flex-col items-start sm:w-auto sm:max-w-full" aria-label={`『${u.unit}』`}>
                      <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-1">
                        <h4 className="text-[16px] font-black leading-snug">『{u.unit}』</h4>
                        {status && (
                          <span className="rounded-full px-2 text-[12px] font-black leading-6" style={{ background: s.bg, color: s.ink }}>
                            {STATUS_LABEL[status]}
                          </span>
                        )}
                      </div>
                      <ul className="mt-2 flex w-full flex-wrap gap-3 sm:gap-4">
                        {list.map((c) => (
                          <li key={c.id} className="w-[calc(50%-6px)] sm:w-[200px]">
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
    </motion.div>
  );
}
