// Shared motion presets and color tokens used across components.
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

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
