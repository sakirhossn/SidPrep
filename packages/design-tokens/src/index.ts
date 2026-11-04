/**
 * SidPrep 2.0 Official Design Tokens — Ink & Moss v2
 * Target: Accessible, focused, lightweight EdTech interface (Web & Mobile shared)
 * Visual direction: Warm paper (#F7F7F2), near-black text (#20291F), forest primary (#28563F),
 * charcoal hero (#1E3C2C), restrained citrus highlight (#DFF19B), muted borders (#E6E8DE).
 */

export * from './typography.js';
export * from './spacing.js';
export { colors as themeColors, type ColorTheme } from './colors.js';

export const colors = {
  primary: {
    DEFAULT: '#28563F', // Forest Primary
    50: '#F4F7F2',
    100: '#EAF1E6',
    200: '#CBE0C4',
    300: '#A4C699',
    400: '#5C9150',
    500: '#28563F', // Canonical Primary
    600: '#214734',
    700: '#183D2B', // Pressed
    800: '#1E3C2C', // Charcoal Hero
    900: '#13281E',
  },
  hero: {
    DEFAULT: '#1E3C2C', // Dark Focus Card
    dark: '#304839',
  },
  highlight: {
    DEFAULT: '#DFF19B', // Restrained Citrus Accent
    soft: '#F2F9D3',
    dark: '#BFCF7D',
  },
  background: {
    light: '#F7F7F2', // Warm paper canvas
    canvas: '#F4F3EE',
    dark: '#151D18',
  },
  surface: {
    light: '#FFFFFF',
    dark: '#1D2B22',
    card: '#FFFFFF',
    subtle: '#EFF1E9',
    muted: '#EFF1E9',
  },
  text: {
    primary: '#20291F', // Near-black forest ink
    secondary: '#66716A', // Description & metadata
    muted: '#66716A',
    inverted: '#F7F7F2',
  },
  accent: {
    forest: '#28563F',
    citrus: '#DFF19B',
    success: '#24734E',
    successLight: '#E9F4E7',
    amber: '#9B642D',
    amberLight: '#FFF2DE',
    error: '#B5483F',
    errorLight: '#FBEFEB',
  },
  border: {
    subtle: '#E6E8DE',
    strong: '#D1D6C5',
    focus: '#28563F',
  },
} as const;

export const typography = {
  fontFamily: {
    heading: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    body: 'Manrope, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    hindi: '"Noto Sans Devanagari", sans-serif',
    bengali: '"Noto Sans Bengali", sans-serif',
  },
  fontSize: {
    micro: ['0.625rem', { lineHeight: '0.875rem' }], // 10sp
    xs: ['0.75rem', { lineHeight: '1rem' }], // 12sp
    sm: ['0.875rem', { lineHeight: '1.25rem' }], // 14sp body
    base: ['0.9375rem', { lineHeight: '1.4rem' }], // 15sp comfortable body
    lg: ['1rem', { lineHeight: '1.5rem' }], // 16sp subtitle
    xl: ['1.125rem', { lineHeight: '1.625rem' }], // 18sp section title
    '2xl': ['1.4375rem', { lineHeight: '1.75rem' }], // 23sp screen title
    '3xl': ['1.625rem', { lineHeight: '2rem' }], // 26sp hero title
    '4xl': ['2rem', { lineHeight: '2.5rem' }],
  },
} as const;
