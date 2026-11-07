import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { removeCard, useCards } from '../lib/cards';
import { resetFlow, setFlow } from '../lib/flow';
import { api, errorMessage, mediaUrl } from '../lib/api';
import { CardFace } from '../components/CardFace';
import { Markdown } from '../components/Markdown';
import { Speak } from '../components/Speak';
import { toast } from '../lib/toast';
import { Button, Icon, IconButton } from '../components/ui';
import { catStyle } from '../components/theme';
import { onBack } from '../lib/native';

export function CardDetail({ cardId }: { cardId: string }) {
  const cards = useCards();
  const card = cards.find((c) => c.id === cardId);
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const close = () => navigate({ to: '/zukan' });

  useEffect(() => onBack(close));

  if (!card) return null;
  const c = catStyle(card.category);
  const no = cards.length - cards.indexOf(card);

  const again = async () => {
    resetFlow();
    navigate({ to: '/' });
    setFlow({ stage: 'exploring', crop: card.photo ?? null, objects: [{ label: card.name, en: card.en, box: [0, 0, 1000, 1000] }], selected: 0 });
    try {
      const ex = await api.explore(card.name);
      setFlow({ stage: 'explore', explore: ex, notes: Object.fromEntries(card.notes.map((n) => [n.topicId, n])) });
    } catch (e) {
      setFlow({ stage: 'error', error: errorMessage(e) });
    }
  };

  return (
    <motion.div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div className="fixed inset-0 bg-[#120e0b]/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 px-5 pb-16 pt-[max(env(safe-area-inset-top),20px)] lg:flex-row lg:items-start lg:pt-16">
        <div className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] z-10">
          <IconButton icon="close" label="とじる" tone="glass" onClick={close} />
        </div>

        <div className="w-[min(80vw,340px)] shrink-0 lg:sticky lg:top-16">
          <motion.button layoutId={`card-${card.id}`} onClick={() => setFlipped((f) => !f)} className="block w-full [perspective:1400px]" aria-label="カードをうらがえす" transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <motion.div className="relative [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
              <div className="[backface-visibility:hidden]">
                <CardFace card={card} no={no} size="lg" />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="flex h-full flex-col rounded-[22px] bg-[#fffdf8] p-5 text-left text-[#2a2017] shadow-[var(--shadow-float)]">
                  <span className="text-[12px] font-black" style={{ color: c.ink }}>No.{String(no).padStart(3, '0')} ・ {card.category}</span>
                  <span className="text-[22px] font-black">{card.name}</span>
                  <span className="mt-2 text-[14px] leading-relaxed text-[#66574a]">{card.summary}</span>
                  <span className="mt-auto rounded-2xl p-3 text-[13px] font-bold leading-relaxed" style={{ background: c.bg, color: c.ink }}>
                    知ってた？ {card.funFact}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.button>
          <p className="mt-3 text-center text-[13px] font-bold text-white/70">タップでうらがえす</p>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.15, type: 'spring', stiffness: 260, damping: 28 } }}
          exit={{ opacity: 0, y: 24 }}
          className="w-full flex-1 rounded-[32px] bg-paper p-6 text-ink shadow-[var(--shadow-float)]"
        >
          <p className="text-[12px] font-bold tracking-wider text-ink-3">{card.reading}・{card.en}</p>
          <h2 className="text-[30px] font-black leading-tight">{card.name}</h2>
          <p className="mt-2 text-[17px] font-bold text-accent">{card.oneLiner}</p>
          <p className="mt-3 text-ink-2">{card.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon="travel_explore" onClick={again}>もっと調べる</Button>
            <Speak text={`${card.name}。${card.summary}。知ってた？${card.funFact}`} />
            <Button
              tone="ghost"
              icon="delete"
              onClick={async () => {
                if (!confirm(`「${card.name}」のカードを図鑑から外しますか？`)) return;
                close();
                await removeCard(card.id);
                toast('カードを外しました', 'delete');
              }}
            >
              外す
            </Button>
          </div>

          <h3 className="mt-8 flex items-center gap-2 text-[18px] font-black">
            <Icon name="explore" size={22} fill className="text-accent" /> 深掘りノート
          </h3>
          {card.notes.length === 0 ? (
            <p className="mt-2 rounded-3xl bg-paper-2 p-5 text-[14px] text-ink-2">まだ深掘りしたテーマはありません。「もっと調べる」から問いを選んでみよう。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {card.notes.map((n) => {
                const isOpen = open === n.topicId;
                return (
                  <li key={n.topicId} className="overflow-hidden rounded-3xl bg-paper-2">
                    <button onClick={() => setOpen(isOpen ? null : n.topicId)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={isOpen}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: c.bg, color: c.ink }}>
                        <Icon name={n.icon} size={22} fill />
                      </span>
                      <span className="flex-1 font-black leading-snug">{n.title}</span>
                      <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
                        <Icon name="expand_more" size={24} className="text-ink-3" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                          <div className="px-5 pb-5">
                            <Markdown text={n.text} />
                            {n.diagram && <img src={mediaUrl(n.diagram)} alt="図解イラスト" className="mt-4 w-full rounded-2xl" loading="lazy" />}
                            {n.video && <video src={mediaUrl(n.video)} controls playsInline className="mt-4 w-full rounded-2xl bg-black" />}
                            {n.sources.length > 0 && (
                              <p className="mt-3 text-[12px] text-ink-3">
                                参考: {n.sources.slice(0, 4).map((s, i) => (
                                  <a key={s.uri} href={s.uri} target="_blank" rel="noopener" className="underline">
                                    {i ? '、' : ''}{s.title}
                                  </a>
                                ))}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}
