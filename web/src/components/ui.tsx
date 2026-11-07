import { motion, type HTMLMotionProps } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { spring } from './theme';


export function Icon({ name, fill = false, size = 24, weight, className = '', style }: {
  name: string; fill?: boolean; size?: number; weight?: number; className?: string; style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`ms ${className}`}
      style={{ fontSize: size, width: size, height: size, ['--fill' as string]: fill ? 1 : 0, ['--wght' as string]: weight, ...style }}
    >
      {name}
    </span>
  );
}

type Tone = 'accent' | 'ink' | 'ghost' | 'paper' | 'glass';

const tones: Record<Tone, string> = {
  accent: 'bg-accent text-accent-ink shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--accent)_70%,transparent)]',
  ink: 'bg-ink text-paper',
  ghost: 'bg-transparent text-ink hover:bg-ink/6',
  paper: 'bg-paper text-ink shadow-[var(--shadow-card)] hover:bg-paper-2',
  glass: 'glass bg-black/35 text-white backdrop-blur-xl border border-white/15 hover:bg-black/45',
};

export function Button({ tone = 'accent', icon, children, className = '', iconFill, ...rest }: HTMLMotionProps<'button'> & {
  tone?: Tone; icon?: string; iconFill?: boolean; children?: ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -1 }}
      transition={spring}
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-5 h-12 font-bold text-[15px] select-none transition-colors disabled:opacity-50 disabled:pointer-events-none ${tones[tone]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={22} fill={iconFill} className="group-active:[--fill:1]" />}
      {children}
    </motion.button>
  );
}

export function IconButton({ icon, label, tone = 'ghost', size = 48, fill, className = '', ...rest }: HTMLMotionProps<'button'> & {
  icon: string; label: string; tone?: Tone; size?: number; fill?: boolean;
}) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.88 }}
      transition={spring}
      className={`group grid place-items-center rounded-full shrink-0 transition-colors ${tones[tone]} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} fill={fill} className="group-hover:[--fill:1]" />
    </motion.button>
  );
}


export function Chip({ children, icon, color, className = '' }: { children: ReactNode; icon?: string; color?: { bg: string; ink: string }; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold leading-6 ${className}`}
      style={color ? { background: color.bg, color: color.ink } : undefined}
    >
      {icon && <Icon name={icon} size={15} fill />}
      {children}
    </span>
  );
}
