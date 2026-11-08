import { motion, type HTMLMotionProps } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { buttonClass, buttonIcon, popIn, press, pressIcon, tones, ui, type ButtonSize, type Tone } from './theme';

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

export function Button({ tone = 'accent', size = 'md', icon, children, className = '', iconFill, ...rest }: HTMLMotionProps<'button'> & {
  tone?: Tone; size?: ButtonSize; icon?: string; iconFill?: boolean; children?: ReactNode;
}) {
  return (
    <motion.button {...press} whileHover={{ y: -1 }} className={`${buttonClass(tone, size)} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={buttonIcon[size]} fill={iconFill} className="group-active:[--fill:1]" />}
      {children}
    </motion.button>
  );
}

export function IconButton({ icon, label, tone = 'ghost', size = 44, fill, className = '', ...rest }: HTMLMotionProps<'button'> & {
  icon: string; label: string; tone?: Tone; size?: number; fill?: boolean;
}) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      {...pressIcon}
      className={`group grid place-items-center rounded-full shrink-0 transition-colors ${tones[tone]} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} fill={fill} className="group-hover:[--fill:1]" />
    </motion.button>
  );
}

// The round badge above a sheet's or dialog's title.
export function HeroIcon({ icon, tone = 'accent', pop = true }: { icon: string; tone?: 'accent' | 'leaf'; pop?: boolean }) {
  return (
    <motion.div {...(pop ? popIn : {})} className={`${ui.heroIcon} ${tone === 'leaf' ? 'bg-leaf-soft text-leaf' : 'bg-accent-soft text-accent'}`}>
      <Icon name={icon} size={36} fill />
    </motion.div>
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
