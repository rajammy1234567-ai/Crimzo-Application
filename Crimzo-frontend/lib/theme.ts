/** Shared Crimzo UI tokens */
export const colors = {
  bg: '#06060F',
  bgElevated: '#0C0C18',
  bgCard: '#12121E',
  surface: 'rgba(255,255,255,0.06)',
  surfaceBorder: 'rgba(255,255,255,0.08)',
  primary: '#FF2D55',
  primarySoft: '#FF6B8A',
  accent: '#FF6B35',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.45)',
  textSubtle: 'rgba(255,255,255,0.28)',
  success: '#4CD964',
  gold: '#FFD700',
  diamond: '#00BFFF',
  bean: '#FF9500',
};

export const gradients = {
  primary: ['#FF2D55', '#FF6B8A'] as const,
  primaryWide: ['#FF2D55', '#FF6B35'] as const,
  screen: ['#06060F', '#0A0A16', '#06060F'] as const,
  card: ['#1a0a2e', '#15151f', '#0e0e18'] as const,
  story: ['#DE0046', '#F7A34B'] as const,
};

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 24,
  full: 999,
};

export const shadow = {
  primary: {
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
};

/** Must match tab bar height in app/(tabs)/_layout.tsx */
export const getTabBarHeight = (bottomInset: number) => 58 + bottomInset;