import { themes, THEME_IDS, DEFAULT_THEME_ID } from '../../src/theme/themes';
import { spacing, radii, typography, shadows } from '../../src/theme/tokens';

describe('Theme System & Design Tokens', () => {
  test('defines standard theme IDs', () => {
    expect(THEME_IDS.MIDNIGHT).toBe('midnight');
    expect(THEME_IDS.OBSIDIAN).toBe('obsidian');
    expect(THEME_IDS.CYBERPUNK).toBe('cyberpunk');
    expect(THEME_IDS.DAYLIGHT).toBe('daylight');
    expect(DEFAULT_THEME_ID).toBe(THEME_IDS.MIDNIGHT);
  });

  test('provides all 4 theme presets with complete color palettes', () => {
    const themeList = Object.values(themes);
    expect(themeList).toHaveLength(4);

    const requiredColorKeys = [
      'background',
      'surface',
      'card',
      'cardSolid',
      'cardInteractive',
      'primary',
      'accent',
      'success',
      'warning',
      'danger',
      'text',
      'textSecondary',
      'textMuted',
      'border',
      'borderHighlight',
      'inputBg',
      'tabBar',
      'tabBarActive',
      'tabBarInactive',
      'statusBarStyle'
    ];

    themeList.forEach((theme) => {
      expect(theme).toHaveProperty('id');
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('mode');
      expect(theme).toHaveProperty('description');
      expect(theme).toHaveProperty('colors');

      requiredColorKeys.forEach((key) => {
        expect(theme.colors).toHaveProperty(key);
        expect(typeof theme.colors[key]).toBe('string');
        expect(theme.colors[key].length).toBeGreaterThan(0);
      });

      // Verify token attachments
      expect(theme.spacing).toBe(spacing);
      expect(theme.radii).toBe(radii);
      expect(theme.typography).toBe(typography);
      expect(theme.shadows).toBe(shadows);
    });
  });

  test('validates mode contracts (dark vs light)', () => {
    expect(themes[THEME_IDS.MIDNIGHT].mode).toBe('dark');
    expect(themes[THEME_IDS.OBSIDIAN].mode).toBe('dark');
    expect(themes[THEME_IDS.CYBERPUNK].mode).toBe('dark');
    expect(themes[THEME_IDS.DAYLIGHT].mode).toBe('light');

    expect(themes[THEME_IDS.MIDNIGHT].colors.statusBarStyle).toBe('light');
    expect(themes[THEME_IDS.DAYLIGHT].colors.statusBarStyle).toBe('dark');
  });

  test('OLED Obsidian has pure black background for AMOLED battery saving', () => {
    expect(themes[THEME_IDS.OBSIDIAN].colors.background).toBe('#000000');
    expect(themes[THEME_IDS.OBSIDIAN].colors.tabBar).toBe('#000000');
  });

  test('design tokens have coherent scales', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.lg).toBeLessThan(spacing.xl);

    expect(radii.xs).toBeLessThan(radii.sm);
    expect(radii.sm).toBeLessThan(radii.md);
    expect(radii.md).toBeLessThan(radii.lg);
    expect(radii.lg).toBeLessThan(radii.xl);

    expect(typeof shadows.glow).toBe('function');
    const glowStyle = shadows.glow('#38bdf8');
    expect(glowStyle.shadowColor).toBe('#38bdf8');
  });
});
