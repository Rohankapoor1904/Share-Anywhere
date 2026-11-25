/**
 * Core design tokens for LocalShare.
 * Spacing, radii, type and elevation shared by every theme. Elevation is kept
 * deliberately low: surfaces are separated by hairline borders, not shadows.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48
};

export const radii = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
  pill: 999,
  full: 9999
};

export const typography = {
  fontSizes: {
    micro: 10,
    caption: 11,
    sub: 12,
    bodySm: 13,
    body: 15,
    bodyLg: 16,
    headline: 17,
    titleSm: 18,
    title: 20,
    titleLg: 24,
    display: 30
  },
  // heavy/black are capped at 700: very heavy weights read as shouting on mobile.
  fontWeights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '700',
    black: '700'
  },
  tabularNums: {
    fontVariant: ['tabular-nums']
  }
};

export const shadows = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  // A faint tinted lift, not a glow.
  glow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2
  })
};
