import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3B4CCA',
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
        canvas: '#F6F7FB',
        accent: {
          teal: '#0F766E',
          tealLight: '#CCFBF1',
          amber: '#F59E0B',
          amberLight: '#FEF3C7',
          error: '#EF4444',
          errorLight: '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
