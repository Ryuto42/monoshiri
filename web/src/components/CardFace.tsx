import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useState, type PointerEvent } from 'react';
import { Icon } from './ui';
import { catStyle } from './theme';
import { mediaUrl } from '../lib/api';
import { usePendingIllust } from '../lib/illust';
import { nearestUnit } from '../lib/units';
import { useStage } from '../lib/level';
import { RubyText } from './RubyText';
import { BrandMark } from './BrandMark';

// Tilt follows a mouse; on touch screens it never moves, yet its 3D transform would still give every card its own GPU layer.
const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export type CardLike = {
  id?: string;
  name: string;
  reading?: string;
  category: string;
  icon: string;
  oneLiner?: string;
  illustration?: string | null;
  firstFind?: boolean;
  units?: string[];
};

export function CardFace({ card, no, size = 'md', loadingArt, tilt = true }: {
  card: CardLike; no?: number; size?: 'sm' | 'md' | 'lg'; loadingArt?: boolean; tilt?: boolean;
}) {
  const tilts = tilt && canHover;
  const c = catStyle(card.category);
  // Only art that arrives while the card is on screen fades in; animating a blur on every card when the zukan opens is expensive.
  const [firstArt] = useState(card.illustration);
  const pending = usePendingIllust();
  const drawing = loadingArt ?? (!!card.id && !card.illustration && pending.has(card.id));
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [9, -9]), { stiffness: 220, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-11, 11]), { stiffness: 220, damping: 18 });
  const gx = useTransform(mx, [0, 1], ['0%', '100%']);
  const gy = useTransform(my, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgb(255 255 255 / 0.45), transparent 55%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilts) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  const big = size === 'lg', small = size === 'sm';
  const stage = useStage().stage;
  const unit = nearestUnit(card.units, stage);

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={tilts ? { rotateX: rx, rotateY: ry, transformPerspective: 900 } : undefined}
      className={`relative aspect-[5/7] w-full select-none rounded-[22px] bg-[#fffdf8] p-[6%] shadow-[var(--shadow-float)] text-[#2a2017] ${small ? 'rounded-[16px]' : ''}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[16px] flex flex-col" style={{ background: c.bg }}>
        {/* The illustration is square, so its area is square too: nothing is cropped and no band of a different
            colour sits above it. The category and number sit on top of the art. */}
        <div className="relative aspect-square w-full min-h-0 shrink grid place-items-center">
          <div className="absolute inset-x-0 top-0 z-[1] flex items-center justify-between px-[7%] pt-[6%]" style={{ color: c.ink }}>
            <span className={`inline-flex items-center gap-1 rounded-full bg-white/70 px-2 font-bold ${small ? 'text-[9px] leading-4' : 'text-[11px] leading-6'}`}>
              <Icon name={c.icon} size={small ? 11 : 14} fill />
              {card.category}
            </span>
            {no != null && <span className={`font-black tabular-nums opacity-70 ${small ? 'text-[9px]' : 'text-[12px]'}`}>No.{String(no).padStart(3, '0')}</span>}
          </div>
          {card.illustration ? (
            <motion.img
              key={card.illustration}
              initial={card.illustration === firstArt ? false : { opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              src={mediaUrl(card.illustration)}
              alt=""
              draggable={false}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover mix-blend-multiply"
            />
          ) : (
            <Icon name={card.icon} size={big ? 96 : small ? 40 : 64} fill style={{ color: c.ink, opacity: 0.8 }} />
          )}
          {card.firstFind && (
            <span
              className={`absolute z-[1] grid place-items-center rounded-full bg-sun text-[#5a3b00] shadow-[var(--shadow-card)] ${small ? 'bottom-1.5 right-1.5 h-5 w-5' : 'bottom-3 right-3 h-8 w-8'}`}
              title="はじめて見つけたモノ"
            >
              <Icon name="flag" size={small ? 13 : big ? 20 : 18} fill />
              <span className="sr-only">はじめて見つけたモノ</span>
            </span>
          )}
          {unit && !small && (
            <span
              className={`absolute bottom-3 left-[7%] z-[1] inline-flex max-w-[66%] items-center gap-1 rounded-full bg-white/80 px-2 font-bold ${big ? 'text-[12px] leading-6' : 'text-[10px] leading-5'}`}
              style={{ color: c.ink }}
              title={`学校でならう：${unit.grade} ${unit.subject}『${unit.unit}』`}
            >
              <Icon name="school" size={big ? 15 : 12} fill />
              <span className="truncate">{unit.grade} {unit.subject}</span>
            </span>
          )}
          {drawing && (
            <div className="absolute inset-0 grid place-items-center">
              {small ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/80" style={{ color: c.ink }}>
                  <Icon name="brush" size={16} fill className="animate-bounce" />
                </span>
              ) : (
                <div className={`flex flex-col items-center rounded-2xl bg-white/75 backdrop-blur-sm ${big ? 'gap-2 px-4 py-3' : 'gap-1 px-3 py-2'}`} style={{ color: c.ink }}>
                  <Icon name="brush" size={big ? 28 : 22} fill className="animate-bounce" />
                  <span className="whitespace-nowrap text-[12px] font-bold">{big ? 'イラストを描いています' : '描いています'}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={`flex flex-1 flex-col justify-center bg-[#fffdf8]/92 px-[7%] [container-type:inline-size] ${small ? 'py-[5%]' : 'py-[6%]'}`}>
          {card.reading && !small && <div className="truncate text-[11px] font-bold tracking-wider text-[#8a7a6b]">{card.reading}</div>}
          {/* Always one line, shrunk to fit but not below a readable size; a name longer than that ends in "…" (the card
              itself shows it in full). Two lines made that card's picture smaller than the rest. */}
          <div className="truncate font-black" style={nameStyle(card.name, big ? 28 : small ? 13 : 20, small ? 11 : 15)}>{card.name}</div>
          {/* Grid cards keep room for two lines, so every card's picture is the same size. */}
          {card.oneLiner && !small && <div className={`mt-1 text-[#66574a] leading-snug ${big ? 'text-[14px]' : 'text-[12px] line-clamp-2 min-h-[2.75em]'}`}><RubyText text={card.oneLiner} /></div>}
        </div>
      </div>
      {tilts && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] mix-blend-soft-light" style={{ background: glare }} />}
    </motion.div>
  );
}

// Japanese characters are about 1em wide, so the size that fits the name is the width over the character count.
// The line keeps the full size's height, so a shrunk name doesn't change the card's layout.
function nameStyle(name: string, max: number, min: number) {
  return { fontSize: `max(${min}px, min(${max}px, calc(100cqw / ${Math.max(1, [...name].length)})))`, lineHeight: `${Math.round(max * 1.25)}px` };
}

export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="relative aspect-[5/7] w-full rounded-[22px] bg-[#fffdf8] p-[6%] shadow-[var(--shadow-float)]">
      <div
        className="h-full w-full rounded-[16px] grid place-items-center"
        style={{
          background:
            'radial-gradient(circle at 30% 20%, #ffd3b8 0 18%, transparent 19%), radial-gradient(circle at 75% 70%, #cde8d2 0 22%, transparent 23%), #ef6a3a',
        }}
      >
        <div className="text-center text-white">
          <BrandMark size={size === 'sm' ? 32 : 56} />
          <div className={`font-black tracking-widest ${size === 'sm' ? 'text-[12px]' : 'text-[20px]'}`}>モノシリ</div>
        </div>
      </div>
    </div>
  );
}
