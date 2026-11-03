import React, { createContext, useContext, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { themeColors as colors, fontSizes, spacing, radii, elevations, touchTarget } from '@sidprep/design-tokens';

export type ThemePalette = typeof colors.light | typeof colors.dark;

interface ThemeContextType {
  theme: ThemePalette;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
  scaledFontSize: (size: keyof typeof fontSizes) => number;
  spacing: typeof spacing;
  radii: typeof radii;
  elevations: typeof elevations;
  touchTarget: typeof touchTarget;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const [fontScale, setFontScale] = useState<number>(1.0);

  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const scaledFontSize = (size: keyof typeof fontSizes) => {
    return Math.round(fontSizes[size] * fontScale);
  };

  const value = useMemo(
    () => ({
      theme,
      isDark,
      themeMode,
      setThemeMode,
      fontScale,
      setFontScale,
      scaledFontSize,
      spacing,
      radii,
      elevations,
      touchTarget
    }),
    [theme, isDark, themeMode, fontScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
