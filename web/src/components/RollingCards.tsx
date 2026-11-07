import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Card } from '../lib/types';
import { Icon } from './ui';
import { catStyle } from './theme';
import { mediaUrl } from '../lib/api';

type Item = { key: string; img?: string | null; icon: string; bg: string; ink: string; name: string };

const PLACEHOLDERS: Item[] = [
  { key: 'p1', icon: 'eco', bg: '#CDE8D2', ink: '#25603F', name: 'しぜん' },
  { key: 'p2', icon: 'science', bg: '#D9D6F2', ink: '#423A8C', name: 'しくみ' },
  { key: 'p3', icon: 'history_edu', bg: '#FBE3A8', ink: '#7A5300', name: 'れきし' },
  { key: 'p4', icon: 'recycling', bg: '#F9D9C4', ink: '#8A3B12', name: 'かんきょう' },
  { key: 'p5', icon: 'lightbulb', bg: '#CFE0F4', ink: '#1F4F82', name: 'まめちしき' },
  { key: 'p6', icon: 'factory', bg: '#F6D3D0', ink: '#8C2D25', name: 'つくりかた' },
];

export function RollingCards({ cards, label, height = 240, count = 7 }: { cards: Card[]; label?: string; height?: number; count?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const reduced = useReducedMotion();
  const [items] = useState<Item[]>(() => {
    const own = cards.slice(0, 12).map((c) => { const s = catStyle(c.category); return { key: c.id, img: c.illustration, icon: c.icon, name: c.name, bg: s.bg, ink: s.ink }; });
    const pool = [...own, ...PLACEHOLDERS];
    return Array.from({ length: count }, (_, i) => ({ ...pool[i % pool.length], key: `${pool[i % pool.length].key}-${i}` }));
  });

  useEffect(() => {
    if (reduced || !host.current) return;
    let raf = 0;
    let stopped = false;
    let cleanup = () => {};
    import('matter-js').then((M) => {
      if (stopped || !host.current) return;
      const { Engine, Bodies, Composite, Body } = M;
      const w = host.current.clientWidth, h = height;
      const engine = Engine.create({ gravity: { x: 0, y: 1.1 } });
      const cw = 74, ch = 98;
      const walls = [
        Bodies.rectangle(w / 2, h + 30, w * 3, 60, { isStatic: true, friction: 0.9 }),
        Bodies.rectangle(-30, h / 2, 60, h * 4, { isStatic: true }),
        Bodies.rectangle(w + 30, h / 2, 60, h * 4, { isStatic: true }),
      ];
      const bodies = items.map((_, i) =>
        Bodies.rectangle(w * (0.15 + Math.random() * 0.7), -ch - i * 90, cw, ch, {
          chamfer: { radius: 14 }, restitution: 0.35, friction: 0.6, frictionAir: 0.012, angle: (Math.random() - 0.5) * 1.2,
        }),
      );
      Composite.add(engine.world, [...walls, ...bodies]);
      let last = performance.now();
      let tick = 0;
      const loop = (now: number) => {
        Engine.update(engine, Math.min(32, now - last));
        last = now;
        tick++;
        if (tick % 150 === 0) {
          // A gentle nudge keeps the pile tumbling instead of settling.
          const b = bodies[Math.floor(Math.random() * bodies.length)];
          Body.setVelocity(b, { x: (Math.random() - 0.5) * 14, y: -10 - Math.random() * 6 });
          Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.5);
        }
        bodies.forEach((b, i) => {
          const el = els.current[i];
          if (el) el.style.transform = `translate(${b.position.x - cw / 2}px, ${b.position.y - ch / 2}px) rotate(${b.angle}rad)`;
        });
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        Engine.clear(engine);
        Composite.clear(engine.world, false);
      };
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [items, height, reduced]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }} ref={host} role="status" aria-live="polite">
      {items.map((it, i) => (
        <div
          key={it.key}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="absolute left-0 top-0 w-[74px] h-[98px] rounded-[14px] overflow-hidden border-[3px] border-white shadow-[var(--shadow-card)] will-change-transform"
          style={{
            background: it.bg,
            transform: reduced ? `translate(${12 + i * 60}px, ${height - 110}px) rotate(${((i % 3) - 1) * 6}deg)` : 'translate(-200px,-200px)',
          }}
        >
          {it.img ? (
            <img src={mediaUrl(it.img)} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full grid place-items-center" style={{ color: it.ink }}>
              <Icon name={it.icon} size={34} fill />
            </div>
          )}
        </div>
      ))}
      {label && (
        <div className="absolute inset-x-0 top-4 text-center text-[15px] font-bold text-ink-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-paper/80 backdrop-blur px-4 py-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
