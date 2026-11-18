import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { themes, THEME_IDS, DEFAULT_THEME_ID } from './themes';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;
const STORAGE_KEY = '@localshare:theme_id';

const ThemeContext = createContext(/** @type {any} */ (null));

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedId) => {
        if (isMounted && storedId && themes[storedId]) {
          setThemeIdState(storedId);
        }
      })
      .catch((err) => {
        logger.warn('Failed to load persisted theme preference:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeId = useCallback((newId) => {
    if (!themes[newId]) {
      logger.warn(`Unknown theme id "${newId}". Falling back to default.`);
      return;
    }
    setThemeIdState(newId);
    AsyncStorage.setItem(STORAGE_KEY, newId).catch((err) => {
      logger.error('Failed to persist theme preference:', err);
    });
  }, []);

  const currentTheme = themes[themeId] || themes[DEFAULT_THEME_ID];
  const isDark = currentTheme.mode === 'dark';

  const navTheme = useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      dark: isDark,
      colors: {
        ...baseTheme.colors,
        primary: currentTheme.colors.primary,
        background: currentTheme.colors.background,
        card: currentTheme.colors.surface,
        text: currentTheme.colors.text,
        border: currentTheme.colors.border
      }
    };
  }, [currentTheme, isDark]);

  const availableThemes = useMemo(() => Object.values(themes), []);

  const value = useMemo(
    () => ({
      theme: currentTheme,
      themeId,
      setThemeId,
      availableThemes,
      isDark,
      navTheme
    }),
    [currentTheme, themeId, setThemeId, availableThemes, isDark, navTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    const fallbackTheme = themes[DEFAULT_THEME_ID];
    return {
      theme: fallbackTheme,
      themeId: DEFAULT_THEME_ID,
      setThemeId: () => {},
      availableThemes: Object.values(themes),
      isDark: true,
      navTheme: DarkTheme
    };
  }
  return context;
}

export { THEME_IDS, DEFAULT_THEME_ID };
