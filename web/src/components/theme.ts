// Shared motion presets, surface classes and color tokens. Screens use these instead of their own numbers.
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;
export const sheetSpring = { type: 'spring', stiffness: 300, damping: 34 } as const;

// Pressing: buttons, cards and chips shrink a little; round icon-only buttons a little more.
export const press = { whileTap: { scale: 0.97 }, transition: spring } as const;
export const pressIcon = { whileTap: { scale: 0.92 }, transition: spring } as const;

// Centred dialogs pop up; bottom sheets slide up from the edge.
export const dialogMotion = {
  initial: { y: 24, scale: 0.94, opacity: 0 },
  animate: { y: 0, scale: 1, opacity: 1 },
  exit: { y: 16, scale: 0.96, opacity: 0 },
  transition: { type: 'spring', stiffness: 340, damping: 28 },
} as const;
export const sheetMotion = { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: sheetSpring } as const;
export const popIn = { initial: { scale: 0.6, rotate: -10 }, animate: { scale: 1, rotate: 0 }, transition: { type: 'spring', stiffness: 380, damping: 16 } } as const;

// Radii: sheets and dialogs 32px, panels rounded-3xl, items inside a panel rounded-2xl, buttons and chips rounded-full.
// Side padding: px-6 inside sheets and dialogs, px-4 (sm:px-6) on full pages.
export const ui = {
  scrim: 'absolute inset-0 bg-black/45 backdrop-blur-[2px]',
  overlay: 'fixed inset-0 flex justify-center p-3 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)]',
  dialog: 'relative w-full max-w-[420px] rounded-[32px] bg-paper text-ink shadow-[var(--shadow-float)] paper-grain',
  sheet: 'relative flex w-full flex-col overflow-hidden rounded-t-[32px] bg-paper text-ink shadow-[var(--shadow-float)] paper-grain lg:rounded-[32px]',
  sheetHeader: 'relative flex h-14 shrink-0 items-start justify-center pt-3',
  handle: 'h-1.5 w-10 rounded-full bg-ink/15 lg:hidden',
  sheetClose: 'absolute right-3 top-2',
  sheetBody: 'overflow-y-auto overscroll-contain px-6 pb-[max(env(safe-area-inset-bottom),24px)] no-scrollbar',
  heroIcon: 'mx-auto mt-2 grid h-16 w-16 place-items-center rounded-[22px]',
  title: 'text-[24px] font-black leading-snug',
  lead: 'mt-2 text-[14px] leading-relaxed text-ink-2',
  section: 'flex items-center gap-2 text-[18px] font-black',
  panel: 'rounded-3xl bg-paper-2 p-4',
  notice: 'rounded-2xl bg-paper-2 px-4 py-3',
  tile: 'rounded-2xl bg-paper shadow-[var(--shadow-card)]',
  segmented: 'flex rounded-full bg-paper-2 p-1',
  segment: 'relative flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-[14px] font-bold',
  segmentPill: 'absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-card)]',
  chip: 'relative h-9 shrink-0 rounded-full px-4 text-[14px] font-bold',
  tag: 'rounded-full px-2.5 text-[12px] font-black leading-6',
  floatBottom: 'pb-[max(env(safe-area-inset-bottom),24px)]',
  headerTop: 'pt-[max(env(safe-area-inset-top),14px)]',
} as const;

// Buttons (Button in ui.tsx, and anything that has to look like one).
export type Tone = 'accent' | 'ink' | 'ghost' | 'subtle' | 'paper' | 'glass' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const tones: Record<Tone, string> = {
  accent: 'bg-accent text-accent-ink',
  ink: 'bg-ink text-paper',
  ghost: 'bg-transparent text-ink hover:bg-ink/6',
  subtle: 'bg-transparent text-ink-2 hover:bg-ink/6',
  paper: 'bg-paper text-ink shadow-[var(--shadow-card)] hover:bg-paper-2',
  glass: 'glass bg-black/35 text-white backdrop-blur-xl border border-white/15 hover:bg-black/45',
  outline: 'border border-ink/15 bg-transparent text-ink hover:bg-ink/5',
  danger: 'bg-[#c2410c] text-white',
};

// lg: the one full-width call to action of a screen or sheet. md: everyday buttons. sm: inside forms, panels and rows.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 gap-1.5 px-4 text-[14px] font-bold',
  md: 'h-12 gap-2 px-5 text-[15px] font-bold',
  lg: 'h-13 gap-2 px-6 text-[16px] font-black',
};
export const buttonIcon: Record<ButtonSize, number> = { sm: 20, md: 22, lg: 22 };

export function buttonClass(tone: Tone = 'accent', size: ButtonSize = 'md') {
  return `group inline-flex items-center justify-center rounded-full select-none transition-colors disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${tones[tone]}`;
}

export const CATEGORY_STYLE: Record<string, { bg: string; ink: string; icon: string }> = {
  くらし: { bg: '#F9D9C4', ink: '#8A3B12', icon: 'home' },
  たべもの: { bg: '#FBE3A8', ink: '#7A5300', icon: 'restaurant' },
  しぜん: { bg: '#CDE8D2', ink: '#25603F', icon: 'forest' },
  いきもの: { bg: '#D6EBC0', ink: '#3F6A14', icon: 'pets' },
  のりもの: { bg: '#CFE0F4', ink: '#1F4F82', icon: 'directions_car' },
  どうぐ: { bg: '#F6D3D0', ink: '#8C2D25', icon: 'construction' },
  きかい: { bg: '#D9D6F2', ink: '#423A8C', icon: 'computer' },
  たてもの: { bg: '#E8DCCB', ink: '#5E4527', icon: 'museum' },
  そざい: { bg: '#E3E0D8', ink: '#4A463D', icon: 'diamond' },
  からだ: { bg: '#F8D5E1', ink: '#8A2752', icon: 'health_and_safety' },
  あそび: { bg: '#FCE2C0', ink: '#87470A', icon: 'sports_soccer' },
  そのほか: { bg: '#E6E1F0', ink: '#4F4466', icon: 'auto_awesome' },
};

export const catStyle = (c: string) => CATEGORY_STYLE[c] ?? CATEGORY_STYLE['そのほか'];

export const TOPIC_COLORS: [string, string][] = [
  ['#FDE3D6', '#B4441B'], ['#D9EFE6', '#23684F'], ['#DCE8F7', '#2A5C93'], ['#FBEBC2', '#8A6206'], ['#EADFF5', '#5B3F8C'], ['#F8DCE5', '#9A2F57'],
];
