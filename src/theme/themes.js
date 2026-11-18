/**
 * Themed color palettes and style contracts for LocalShare.
 */

import { spacing, radii, typography, shadows } from './tokens';

export const THEME_IDS = {
  MIDNIGHT: 'midnight',
  OBSIDIAN: 'obsidian',
  CYBERPUNK: 'cyberpunk',
  DAYLIGHT: 'daylight'
};

export const themes = {
  [THEME_IDS.MIDNIGHT]: {
    id: THEME_IDS.MIDNIGHT,
    name: 'Midnight Slate',
    mode: 'dark',
    description: 'Deep navy-slate with electric cyan accents',
    colors: {
      background: '#0a0f1d',
      surface: '#0f172a',
      card: 'rgba(30, 41, 59, 0.78)',
      cardSolid: '#1e293b',
      cardInteractive: 'rgba(51, 65, 85, 0.65)',
      primary: '#38bdf8',
      primaryHover: '#0ea5e9',
      primaryGlow: 'rgba(56, 189, 248, 0.22)',
      accent: '#818cf8',
      accentGlow: 'rgba(129, 140, 248, 0.2)',
      success: '#10b981',
      successGlow: 'rgba(16, 185, 129, 0.2)',
      warning: '#f59e0b',
      warningGlow: 'rgba(245, 158, 11, 0.2)',
      danger: '#ef4444',
      dangerGlow: 'rgba(239, 68, 68, 0.2)',
      text: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      border: 'rgba(255, 255, 255, 0.08)',
      borderHighlight: 'rgba(56, 189, 248, 0.35)',
      inputBg: 'rgba(15, 23, 42, 0.85)',
      tabBar: '#0b1120',
      tabBarActive: '#38bdf8',
      tabBarInactive: '#64748b',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.OBSIDIAN]: {
    id: THEME_IDS.OBSIDIAN,
    name: 'OLED Obsidian',
    mode: 'dark',
    description: 'Pure 100% black optimized for AMOLED battery savings',
    colors: {
      background: '#000000',
      surface: '#080808',
      card: 'rgba(20, 20, 20, 0.88)',
      cardSolid: '#141414',
      cardInteractive: 'rgba(35, 35, 35, 0.75)',
      primary: '#00f2fe',
      primaryHover: '#4facfe',
      primaryGlow: 'rgba(0, 242, 254, 0.25)',
      accent: '#00e676',
      accentGlow: 'rgba(0, 230, 118, 0.2)',
      success: '#00e676',
      successGlow: 'rgba(0, 230, 118, 0.2)',
      warning: '#ffab00',
      warningGlow: 'rgba(255, 171, 0, 0.2)',
      danger: '#ff1744',
      dangerGlow: 'rgba(255, 23, 68, 0.2)',
      text: '#ffffff',
      textSecondary: '#a3a3a3',
      textMuted: '#737373',
      border: 'rgba(255, 255, 255, 0.12)',
      borderHighlight: 'rgba(0, 242, 254, 0.45)',
      inputBg: 'rgba(18, 18, 18, 0.95)',
      tabBar: '#000000',
      tabBarActive: '#00f2fe',
      tabBarInactive: '#525252',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.CYBERPUNK]: {
    id: THEME_IDS.CYBERPUNK,
    name: 'Cyber Neon',
    mode: 'dark',
    description: 'High-voltage electric ultraviolet & hot pink matrix',
    colors: {
      background: '#0c0717',
      surface: '#150d28',
      card: 'rgba(34, 18, 58, 0.82)',
      cardSolid: '#23133c',
      cardInteractive: 'rgba(56, 28, 98, 0.7)',
      primary: '#f43f5e',
      primaryHover: '#fb7185',
      primaryGlow: 'rgba(244, 63, 94, 0.28)',
      accent: '#c084fc',
      accentGlow: 'rgba(192, 132, 252, 0.25)',
      success: '#06b6d4',
      successGlow: 'rgba(6, 182, 212, 0.25)',
      warning: '#f59e0b',
      warningGlow: 'rgba(245, 158, 11, 0.2)',
      danger: '#ff2d55',
      dangerGlow: 'rgba(255, 45, 85, 0.25)',
      text: '#fdf4ff',
      textSecondary: '#d8b4fe',
      textMuted: '#9333ea',
      border: 'rgba(244, 63, 94, 0.22)',
      borderHighlight: 'rgba(244, 63, 94, 0.5)',
      inputBg: 'rgba(21, 13, 40, 0.9)',
      tabBar: '#0a0514',
      tabBarActive: '#f43f5e',
      tabBarInactive: '#7e22ce',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.DAYLIGHT]: {
    id: THEME_IDS.DAYLIGHT,
    name: 'Daylight Pristine',
    mode: 'light',
    description: 'Clean, crisp high-contrast light glass aesthetics',
    colors: {
      background: '#f1f5f9',
      surface: '#ffffff',
      card: 'rgba(255, 255, 255, 0.88)',
      cardSolid: '#ffffff',
      cardInteractive: 'rgba(241, 245, 249, 0.85)',
      primary: '#0284c7',
      primaryHover: '#0369a1',
      primaryGlow: 'rgba(2, 132, 199, 0.2)',
      accent: '#6366f1',
      accentGlow: 'rgba(99, 102, 241, 0.2)',
      success: '#059669',
      successGlow: 'rgba(5, 150, 105, 0.2)',
      warning: '#d97706',
      warningGlow: 'rgba(217, 119, 6, 0.2)',
      danger: '#dc2626',
      dangerGlow: 'rgba(220, 38, 38, 0.2)',
      text: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
      border: 'rgba(15, 23, 42, 0.08)',
      borderHighlight: 'rgba(2, 132, 199, 0.4)',
      inputBg: 'rgba(255, 255, 255, 0.95)',
      tabBar: '#ffffff',
      tabBarActive: '#0284c7',
      tabBarInactive: '#94a3b8',
      statusBarStyle: 'dark'
    },
    spacing,
    radii,
    typography,
    shadows
  }
};

export const DEFAULT_THEME_ID = THEME_IDS.MIDNIGHT;
