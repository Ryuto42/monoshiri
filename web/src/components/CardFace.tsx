import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';
import { catStyle, Icon } from './ui';
import { mediaUrl } from '../lib/api';

export type CardLike = {
  name: string;
  reading?: string;
  category: string;
  icon: string;
  oneLiner?: string;
  illustration?: string | null;
  photo?: string | null;
};

export function CardFace({ card, no, size = 'md', loadingArt, tilt = true }: {
  card: CardLike; no?: number; size?: 'sm' | 'md' | 'lg'; loadingArt?: boolean; tilt?: boolean;
}) {
  const c = catStyle(card.category);
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [9, -9]), { stiffness: 220, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-11, 11]), { stiffness: 220, damping: 18 });
  const gx = useTransform(mx, [0, 1], ['0%', '100%']);
  const gy = useTransform(my, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgb(255 255 255 / 0.45), transparent 55%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  const big = size === 'lg', small = size === 'sm';

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: tilt ? rx : 0, rotateY: tilt ? ry : 0, transformPerspective: 900 }}
      className={`relative aspect-[5/7] w-full select-none rounded-[22px] bg-[#fffdf8] p-[6%] shadow-[var(--shadow-float)] text-[#2a2017] ${small ? 'rounded-[16px]' : ''}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[16px] flex flex-col" style={{ background: c.bg }}>
        <div className="flex items-center justify-between px-[7%] pt-[6%]" style={{ color: c.ink }}>
          <span className={`inline-flex items-center gap-1 rounded-full bg-white/70 px-2 font-bold ${small ? 'text-[9px] leading-4' : 'text-[11px] leading-6'}`}>
            <Icon name={c.icon} size={small ? 11 : 14} fill />
            {card.category}
          </span>
          {no != null && <span className={`font-black tabular-nums opacity-70 ${small ? 'text-[9px]' : 'text-[12px]'}`}>No.{String(no).padStart(3, '0')}</span>}
        </div>
        <div className="relative flex-1 grid place-items-center">
          {card.illustration ? (
            <motion.img
              key={card.illustration}
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              src={mediaUrl(card.illustration)}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover mix-blend-multiply"
            />
          ) : card.photo ? (
            <img src={card.photo} alt="" draggable={false} className="absolute inset-[10%] h-[80%] w-[80%] object-cover rounded-2xl" />
          ) : (
            <Icon name={card.icon} size={big ? 96 : small ? 40 : 64} fill style={{ color: c.ink, opacity: 0.8 }} />
          )}
          {loadingArt && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/75 px-4 py-3 backdrop-blur-sm" style={{ color: c.ink }}>
                <Icon name="brush" size={28} fill className="animate-bounce" />
                <span className="text-[12px] font-bold">イラストを描いています</span>
              </div>
            </div>
          )}
        </div>
        <div className={`bg-[#fffdf8]/92 px-[7%] ${small ? 'py-[5%]' : 'py-[6%]'}`}>
          {card.reading && !small && <div className="text-[11px] font-bold tracking-wider text-[#9a8a7a]">{card.reading}</div>}
          <div className={`font-black leading-tight ${big ? 'text-[28px]' : small ? 'text-[13px] truncate' : 'text-[20px]'}`}>{card.name}</div>
          {card.oneLiner && !small && <div className={`mt-1 text-[#66574a] leading-snug ${big ? 'text-[14px]' : 'text-[12px] line-clamp-2'}`}>{card.oneLiner}</div>}
        </div>
      </div>
      {tilt && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] mix-blend-soft-light" style={{ background: glare }} />}
    </motion.div>
  );
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
          <Icon name="travel_explore" size={size === 'sm' ? 32 : 56} fill />
          <div className={`font-black tracking-widest ${size === 'sm' ? 'text-[12px]' : 'text-[20px]'}`}>モノシリ</div>
        </div>
      </div>
    </div>
  );
}
