import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { getCard, saveCard, useCards } from '../lib/cards';
import { illustFor, notifyWhenReady, startIllust, usePendingIllust } from '../lib/illust';
import { maybeNudge } from '../lib/account';
import type { Card, DeepNote, Explore } from '../lib/types';
import { CardBack, CardFace } from './CardFace';
import { toast } from '../lib/toast';
import { Button, Icon } from './ui';
import { haptic, onBack } from '../lib/native';
import { KidText } from './RubyText';
import { api } from '../lib/api';
import { fillCard, useUnitLinks } from '../lib/units';
import { useFlip } from '../lib/flip';

const FLIP = { type: 'spring', stiffness: 120, damping: 16 } as const;

export function CardMaker({ ex, notes, onClose, flyTo }: {
  ex: Explore; notes: DeepNote[]; onClose: () => void; flyTo: () => DOMRect | null;
}) {
  const reduced = useReducedMotion();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const existing = getCard(ex.id);
  const cards = useCards();
  const [illustration, setIllustration] = useState<string | null>(existing?.illustration ?? illustFor(ex.id));
  const [flipped, setFlipped] = useState(!!existing);
  const flip = useFlip(flipped, FLIP);
  const busy = usePendingIllust().has(ex.id) && !illustration;
  const box = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0), scale = useMotionValue(1), opacity = useMotionValue(1);
  const no = existing ? cards.length - cards.findIndex((c) => c.id === ex.id) : cards.length + 1;
  const links = useUnitLinks(ex.name);
  const units = links?.map((l) => l.id) ?? existing?.units;

  const close = () => { if (!savingRef.current) onClose(); };
  useEffect(() => onBack(() => { if (!savingRef.current) onClose(); }), [onClose]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
      haptic('select');
    }, 650);
    let alive = true;
    if (!illustration) void startIllust(ex.id, ex.name).then((url) => alive && url && setIllustration(url));
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id]);

  const store = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    const byTopic = new Map((existing?.notes ?? []).map((n) => [n.topicId, n]));
    notes.forEach((n) => byTopic.set(n.topicId, { ...byTopic.get(n.topicId), ...n }));
    const card: Card = {
      id: ex.id, name: ex.name, reading: ex.reading, en: ex.en, category: ex.category, icon: ex.icon, oneLiner: ex.oneLiner,
      summary: ex.summary, funFact: ex.funFact, topics: ex.topics, notes: [...byTopic.values()], illustration,
      ...((ex.firstFind || existing?.firstFind) && { firstFind: true }),
      ...(units && { units }),
      createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    try {
      await saveCard(card);
    } catch {
      savingRef.current = false;
      setSaving(false);
      setSaveError(true);
      return;
    }
    void api.events([{ name: 'card_save' }]);
    // Units still on their way are added to the card when they arrive.
    if (!units) void fillCard(ex.id, ex.name).catch(() => {});
    if (!illustration) notifyWhenReady(ex.id);
    haptic('success');
    const target = flyTo();
    const el = box.current?.getBoundingClientRect();
    if (!reduced && target && el) {
      const dx = target.left + target.width / 2 - (el.left + el.width / 2);
      const dy = target.top + target.height / 2 - (el.top + el.height / 2);
      await Promise.all([
        animate(x, dx, { duration: 0.65, ease: [0.5, 0, 0.2, 1] }),
        animate(y, [0, -80, dy], { duration: 0.65, ease: [0.5, 0, 0.2, 1] }),
        animate(scale, 0.12, { duration: 0.65, ease: [0.5, 0, 0.2, 1] }),
        animate(opacity, [1, 1, 0], { duration: 0.7 }),
      ]);
    }
    if (illustration || !busy) toast(existing ? 'カードを更新しました' : `図鑑 No.${String(no).padStart(3, '0')} に追加！`, 'auto_awesome');
    else toast('イラストができたら図鑑でお知らせします', 'brush');
    onClose();
    if (!existing) maybeNudge(no);
  };

  return (
    <motion.div role="dialog" aria-modal aria-labelledby="card-maker-title" className="fixed inset-0 z-[70] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-[#120e0b]/75 backdrop-blur-md" onClick={close} />
      <div className="relative flex w-full max-w-[340px] flex-col items-center">
        <h2 id="card-maker-title" className="sr-only">{ex.name}のカードをつくる</h2>
        {!reduced && <Sparkles />}
        <motion.div ref={box} style={{ x, y, scale, opacity }} className="relative w-[min(78vw,300px)] [perspective:1200px]">
          <motion.div
            className="relative [transform-style:preserve-3d]"
            style={{ rotateY: flip.rotateY }}
            initial={reduced ? false : { y: 60, scale: 0.6 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          >
            <motion.div aria-hidden={flipped} className="[backface-visibility:hidden]" style={{ opacity: flip.front }}>
              <CardBack size="lg" />
            </motion.div>
            <motion.div aria-hidden={!flipped} className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ opacity: flip.back }}>
              <CardFace card={{ ...ex, illustration, units }} no={no} size="lg" loadingArt={busy} />
            </motion.div>
          </motion.div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.9 } }} className="mt-7 flex gap-2">
          <Button icon="inventory_2" iconFill onClick={store} disabled={saving}>
            {saving ? 'しまっています' : existing ? '図鑑を更新' : '図鑑にしまう'}
          </Button>
          <Button tone="glass" disabled={saving} onClick={close} aria-label="とじる">
            <Icon name="close" size={22} />
          </Button>
        </motion.div>
        {saveError && <p role="alert" className="mt-3 text-center text-[13px] font-bold text-white"><KidText text="カードをしまえませんでした。もう一度《いちど》ためしてね。" /></p>}
        {busy && <p className="mt-3 text-center text-[13px] font-bold text-white/70">イラストを待たずにしまえます</p>}
        {notes.length > 0 && (
          <p className="mt-1.5 text-[13px] font-bold text-white/70">深掘りした {notes.length} テーマもカードに記録されます</p>
        )}
      </div>
    </motion.div>
  );
}

function Sparkles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-[40%] h-2.5 w-2.5 rounded-full"
            style={{ background: ['#ffd3b8', '#ffe7a3', '#cde8d2', '#ffffff'][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x: Math.cos(a) * 190, y: Math.sin(a) * 230, opacity: [0, 1, 0], scale: [0, 1.4, 0.4] }}
            transition={{ duration: 1.3, delay: 0.55 + (i % 3) * 0.05, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
