/**
 * SidPrep 2.0 Official Color Palette — Ink & Moss v2
 * Designed for focused, high-contrast, accessible EdTech mobile and web UI.
 * Pure Ink & Moss system: Forest (#28563F), Charcoal Hero (#1E3C2C), Warm Canvas (#F4F3EE / #F7F7F2),
 * Citrus Highlight (#DFF19B), Near-black Ink (#20291F), Muted borders (#E6E8DE).
 */

export const colors = {
  light: {
    // Brand & Core Actions
    primary: '#28563F', // Forest Primary
    primaryPressed: '#183D2B', // Pressed action state / dark nav
    primaryLight: '#EAF1E6', // Forest soft tint
    primaryDark: '#1E3C2C', // Dark charcoal hero
    primaryContainer: '#EAF1E6',
    hero: '#1E3C2C', // Dark focus hero card
    highlight: '#DFF19B', // Restrained citrus accent

    // Canvas & Surfaces
    background: '#F7F7F2', // Mobile canvas (warm paper)
    canvas: '#F4F3EE', // Desk / public canvas
    surface: '#FFFFFF', // Clean white card surface
    surfaceVariant: '#EFF1E9', // Secondary subtle surface
    surfaceSubtle: '#EFF1E9',

    // Text & Content
    text: '#20291F', // Near-black forest ink
    textMuted: '#66716A', // Description & metadata
    textSubtle: '#66716A',
    textDisabled: '#9AA39C',
    textInverse: '#F7F7F2',

    // Borders & Dividers
    border: '#E6E8DE', // Subtle border
    borderStrong: '#D1D6C5',
    borderFocus: '#28563F',

    // Status Colors (WCAG 2.2 AA conformant)
    success: '#24734E',
    successBg: '#E9F4E7',
    successBorder: '#C1E3C9',

    warning: '#9B642D',
    warningBg: '#FFF2DE',
    warningBorder: '#F5DCB5',

    error: '#B5483F',
    errorBg: '#FBEFEB',
    errorBorder: '#F3CCC7',

    info: '#28563F',
    infoBg: '#EAF1E6',
    infoBorder: '#D2E2CC',

    // Verified Official Badge
    verified: '#24734E',
    verifiedBg: '#E9F4E7',

    // Offline / Sync Indicators
    synced: '#24734E',
    pendingSync: '#9B642D',
    offline: '#66716A',
  },
  dark: {
    // Brand & Core Actions
    primary: '#DFF19B', // Citrus primary on dark
    primaryPressed: '#BFCF7D',
    primaryLight: '#3B4A2C',
    primaryDark: '#304839',
    primaryContainer: '#3B4A2C',
    hero: '#304839',
    highlight: '#DFF19B',

    // Canvas & Surfaces
    background: '#151D18', // Deep forest dark canvas
    canvas: '#151D18',
    surface: '#1D2B22', // Dark card surface
    surfaceVariant: '#29372D',
    surfaceSubtle: '#29372D',

    // Text & Content
    text: '#F4F5EE', // Light cream text
    textMuted: '#B5C1B1',
    textSubtle: '#8F9E8B',
    textDisabled: '#5F6F5E',
    textInverse: '#151D18',

    // Borders & Dividers
    border: '#38463B',
    borderStrong: '#4E5F52',
    borderFocus: '#DFF19B',

    // Status Colors
    success: '#87D2A2',
    successBg: '#1C3829',
    successBorder: '#2E553F',

    warning: '#EABC76',
    warningBg: '#3B2A16',
    warningBorder: '#5F4425',

    error: '#E79C92',
    errorBg: '#3D1C1A',
    errorBorder: '#632F2B',

    info: '#DFF19B',
    infoBg: '#2D3A20',
    infoBorder: '#485C34',

    // Verified Official Badge
    verified: '#87D2A2',
    verifiedBg: '#1C3829',

    // Offline / Sync Indicators
    synced: '#87D2A2',
    pendingSync: '#EABC76',
    offline: '#B5C1B1',
  },
} as const;

export type ColorTheme = typeof colors.light;
