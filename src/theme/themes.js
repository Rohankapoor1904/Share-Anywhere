/**
 * Colour palettes for LocalShare.
 * One accent per theme, neutral grays, hairline borders. The *Glow keys are
 * soft tints for tinted backgrounds (badges, selected rows), not glows.
 * Theme ids are unchanged so saved preferences still resolve:
 * midnight = Dark, obsidian = Black, cyberpunk = Dim, daylight = Light.
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
    name: 'Dark',
    mode: 'dark',
    description: 'Neutral dark gray',
    colors: {
      background: '#0e0e10',
      surface: '#141417',
      card: '#18181c',
      cardSolid: '#18181c',
      cardInteractive: '#1e1e23',
      primary: '#7b93f5',
      primaryHover: '#93a7f8',
      primaryGlow: 'rgba(123, 147, 245, 0.14)',
      accent: '#7b93f5',
      accentGlow: 'rgba(123, 147, 245, 0.14)',
      success: '#4cc38a',
      successGlow: 'rgba(76, 195, 138, 0.13)',
      warning: '#f0a54a',
      warningGlow: 'rgba(240, 165, 74, 0.13)',
      danger: '#f2655c',
      dangerGlow: 'rgba(242, 101, 92, 0.13)',
      text: '#ececef',
      textSecondary: '#a3a3ad',
      textMuted: '#6c6c77',
      border: 'rgba(255, 255, 255, 0.07)',
      borderHighlight: 'rgba(255, 255, 255, 0.12)',
      fill: 'rgba(255, 255, 255, 0.05)',
      fillStrong: 'rgba(255, 255, 255, 0.09)',
      onPrimary: '#0e0e10',
      inputBg: '#18181c',
      tabBar: '#0e0e10',
      tabBarActive: '#ececef',
      tabBarInactive: '#6c6c77',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.OBSIDIAN]: {
    id: THEME_IDS.OBSIDIAN,
    name: 'Black',
    mode: 'dark',
    description: 'True black for OLED screens',
    colors: {
      background: '#000000',
      surface: '#070708',
      card: '#0e0e10',
      cardSolid: '#0e0e10',
      cardInteractive: '#151518',
      primary: '#7b93f5',
      primaryHover: '#93a7f8',
      primaryGlow: 'rgba(123, 147, 245, 0.14)',
      accent: '#7b93f5',
      accentGlow: 'rgba(123, 147, 245, 0.14)',
      success: '#4cc38a',
      successGlow: 'rgba(76, 195, 138, 0.13)',
      warning: '#f0a54a',
      warningGlow: 'rgba(240, 165, 74, 0.13)',
      danger: '#f2655c',
      dangerGlow: 'rgba(242, 101, 92, 0.13)',
      text: '#f2f2f4',
      textSecondary: '#a3a3ad',
      textMuted: '#6a6a74',
      border: 'rgba(255, 255, 255, 0.075)',
      borderHighlight: 'rgba(255, 255, 255, 0.13)',
      fill: 'rgba(255, 255, 255, 0.05)',
      fillStrong: 'rgba(255, 255, 255, 0.09)',
      onPrimary: '#000000',
      inputBg: '#0e0e10',
      tabBar: '#000000',
      tabBarActive: '#f2f2f4',
      tabBarInactive: '#5f5f69',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.CYBERPUNK]: {
    id: THEME_IDS.CYBERPUNK,
    name: 'Dim',
    mode: 'dark',
    description: 'Soft slate for low light',
    colors: {
      background: '#1b1f26',
      surface: '#22272f',
      card: '#272d36',
      cardSolid: '#272d36',
      cardInteractive: '#2d343e',
      primary: '#6cb6ff',
      primaryHover: '#8cc6ff',
      primaryGlow: 'rgba(108, 182, 255, 0.14)',
      accent: '#6cb6ff',
      accentGlow: 'rgba(108, 182, 255, 0.14)',
      success: '#57ab5a',
      successGlow: 'rgba(87, 171, 90, 0.15)',
      warning: '#daaa3f',
      warningGlow: 'rgba(218, 170, 63, 0.15)',
      danger: '#e5534b',
      dangerGlow: 'rgba(229, 83, 75, 0.15)',
      text: '#cdd9e5',
      textSecondary: '#96a3b1',
      textMuted: '#6c7a89',
      border: 'rgba(205, 217, 229, 0.09)',
      borderHighlight: 'rgba(205, 217, 229, 0.15)',
      fill: 'rgba(205, 217, 229, 0.06)',
      fillStrong: 'rgba(205, 217, 229, 0.1)',
      onPrimary: '#1b1f26',
      inputBg: '#272d36',
      tabBar: '#1b1f26',
      tabBarActive: '#cdd9e5',
      tabBarInactive: '#6c7a89',
      statusBarStyle: 'light'
    },
    spacing,
    radii,
    typography,
    shadows
  },

  [THEME_IDS.DAYLIGHT]: {
    id: THEME_IDS.DAYLIGHT,
    name: 'Light',
    mode: 'light',
    description: 'Neutral and bright',
    colors: {
      background: '#f5f5f7',
      surface: '#ffffff',
      card: '#ffffff',
      cardSolid: '#ffffff',
      cardInteractive: '#ffffff',
      primary: '#3e63dd',
      primaryHover: '#3557c7',
      primaryGlow: 'rgba(62, 99, 221, 0.1)',
      accent: '#3e63dd',
      accentGlow: 'rgba(62, 99, 221, 0.1)',
      success: '#18864b',
      successGlow: 'rgba(24, 134, 75, 0.1)',
      warning: '#b8650a',
      warningGlow: 'rgba(184, 101, 10, 0.1)',
      danger: '#d4342c',
      dangerGlow: 'rgba(212, 52, 44, 0.08)',
      text: '#18181b',
      textSecondary: '#5b5b66',
      textMuted: '#9a9aa5',
      border: 'rgba(20, 20, 28, 0.08)',
      borderHighlight: 'rgba(20, 20, 28, 0.14)',
      fill: 'rgba(20, 20, 28, 0.045)',
      fillStrong: 'rgba(20, 20, 28, 0.08)',
      onPrimary: '#ffffff',
      inputBg: '#ffffff',
      tabBar: '#ffffff',
      tabBarActive: '#18181b',
      tabBarInactive: '#9a9aa5',
      statusBarStyle: 'dark'
    },
    spacing,
    radii,
    typography,
    shadows
  }
};

export const DEFAULT_THEME_ID = THEME_IDS.MIDNIGHT;
