/**
 * SidPrep 2.0 Typography System
 * Headings & metrics: Manrope
 * Body copy: Inter
 * Fallbacks: Noto Sans Devanagari (Hindi) and Noto Sans Bengali (Bengali)
 */

export const fontFamilies = {
  heading: 'Manrope-Bold',
  headingMedium: 'Manrope-SemiBold',
  metric: 'Manrope-ExtraBold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodyBold: 'Inter-SemiBold',
  fallbackHindi: 'NotoSansDevanagari-Regular',
  fallbackBengali: 'NotoSansBengali-Regular',
  monospace: 'Courier'
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36
} as const;

export const lineHeights = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 28,
  xl: 28,
  '2xl': 32,
  '3xl': 38,
  '4xl': 44
} as const;

export const letterSpacings = {
  tight: -0.4,
  normal: 0,
  wide: 0.2,
  wider: 0.5
} as const;
