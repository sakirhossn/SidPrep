/**
 * SidPrep 2.0 Color Palette
 * Designed for focused, high-contrast, accessible EdTech mobile and web UI.
 */

export const colors = {
  light: {
    primary: '#3B4CCA', // SidPrep signature Indigo
    primaryLight: '#4F62E0',
    primaryDark: '#2C3A9E',
    primaryContainer: '#EEF2FF',
    
    background: '#F6F7FB', // Light clean canvas
    surface: '#FFFFFF', // Card/sheet surface
    surfaceVariant: '#F1F5F9', // Secondary background
    surfaceSubtle: '#F8FAFC',
    
    text: '#0F172A', // Slate 900
    textMuted: '#475569', // Slate 600
    textSubtle: '#64748B', // Slate 500
    textDisabled: '#94A3B8', // Slate 400
    textInverse: '#FFFFFF',
    
    border: '#E2E8F0', // Slate 200
    borderStrong: '#CBD5E1', // Slate 300
    borderFocus: '#3B4CCA',
    
    success: '#0F766E', // Teal/Green 700 (accessible contrast)
    successBg: '#F0FDFA',
    successBorder: '#99F6E4',
    
    warning: '#D97706', // Amber 600
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    
    error: '#DC2626', // Red 600 (strictly real errors)
    errorBg: '#FEF2F2',
    errorBorder: '#FECACA',
    
    info: '#0284C7', // Sky 600
    infoBg: '#F0F9FF',
    infoBorder: '#BAE6FD',

    // Verified Official Badge
    verified: '#0F766E',
    verifiedBg: '#CCFBF1',

    // Offline / Sync indicators
    synced: '#0F766E',
    pendingSync: '#D97706',
    offline: '#64748B'
  },
  dark: {
    primary: '#6366F1', // Accessible Indigo for dark backgrounds
    primaryLight: '#818CF8',
    primaryDark: '#4338CA',
    primaryContainer: '#1E1B4B',
    
    background: '#0B0F19', // Dark deep canvas
    surface: '#151C2C', // Dark surface
    surfaceVariant: '#1E293B', // Secondary dark surface
    surfaceSubtle: '#111827',
    
    text: '#F8FAFC', // Slate 50
    textMuted: '#94A3B8', // Slate 400
    textSubtle: '#64748B', // Slate 500
    textDisabled: '#475569', // Slate 600
    textInverse: '#0F172A',
    
    border: '#1E293B', // Slate 800
    borderStrong: '#334155', // Slate 700
    borderFocus: '#818CF8',
    
    success: '#2DD4BF', // Teal 400
    successBg: '#042F2E',
    successBorder: '#115E59',
    
    warning: '#FBBF24', // Amber 400
    warningBg: '#451A03',
    warningBorder: '#78350F',
    
    error: '#F87171', // Red 400
    errorBg: '#450A0A',
    errorBorder: '#991B1B',
    
    info: '#38BDF8', // Sky 400
    infoBg: '#082F49',
    infoBorder: '#0369A1',

    // Verified Official Badge
    verified: '#2DD4BF',
    verifiedBg: '#134E4A',

    // Offline / Sync indicators
    synced: '#2DD4BF',
    pendingSync: '#FBBF24',
    offline: '#94A3B8'
  }
} as const;

export type ColorTheme = typeof colors.light;
