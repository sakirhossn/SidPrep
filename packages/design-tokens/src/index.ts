/**
 * SidPrep 2.0 Official Design Tokens
 * Target: Accessible, focused, lightweight EdTech interface (Web & Mobile shared)
 */

export * from './typography.js';
export * from './spacing.js';
export { colors as themeColors, type ColorTheme } from './colors.js';

export const colors = {
  primary: {
    DEFAULT: '#3B4CCA', // SidPrep signature indigo
    50: '#EEF0FD',
    100: '#E0E3FB',
    200: '#C2C8F7',
    300: '#9BA6F2',
    400: '#6E7EED',
    500: '#3B4CCA',
    600: '#2A3AB8',
    700: '#1F2C94',
    800: '#182273',
    900: '#131B58',
  },
  background: {
    light: '#F6F7FB',
    dark: '#0B0F19',
  },
  surface: {
    light: '#FFFFFF',
    dark: '#111827',
    card: '#FFFFFF',
    muted: '#F1F5F9',
  },
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#64748B',
    inverted: '#FFFFFF',
  },
  accent: {
    teal: '#0F766E', // Green/Teal for success & accuracy
    tealLight: '#CCFBF1',
    amber: '#F59E0B', // Amber for streaks & warnings
    amberLight: '#FEF3C7',
    error: '#EF4444', // Red reserved only for genuine errors
    errorLight: '#FEE2E2',
    info: '#2563EB',
  },
  border: {
    subtle: '#E2E8F0',
    strong: '#CBD5E1',
    focus: '#3B4CCA',
  },
} as const;

export const typography = {
  fontFamily: {
    heading: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    hindi: '"Noto Sans Devanagari", sans-serif',
    bengali: '"Noto Sans Bengali", sans-serif',
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  },
} as const;
