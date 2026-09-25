/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Page & surface
        page:    { DEFAULT: '#F5F6F8', dark: '#0D1F17' },
        surface: { DEFAULT: '#FFFFFF', dark: '#132B20' },

        // Sidebar — brighter institutional green
        sidebar: {
          DEFAULT: '#006937',
          dark:    '#004D29',
        },

        // Primary accent — SRNHS bright green (inspired by DLSU)
        primary: {
          DEFAULT: '#006937',
          light:   '#008C4A',
          lighter: '#00A85A',
          50:      '#E6F5ED',
          100:     '#B3E0C7',
          700:     '#004D29',
          900:     '#002E18',
        },

        // Gold accent — for institutional branding (seal, badges)
        gold: {
          DEFAULT: '#C4962C',
          light:   '#E8C54A',
          50:      '#FBF5E5',
        },

        // Semantic status colors (brighter, cleaner)
        success: { DEFAULT: '#16A34A', light: '#DCFCE7', dark: '#14532D' },
        warning: { DEFAULT: '#D97706', light: '#FEF3C7', dark: '#78350F' },
        danger:  { DEFAULT: '#DC2626', light: '#FEE2E2', dark: '#7F1D1D' },
        info:    { DEFAULT: '#2563EB', light: '#DBEAFE', dark: '#1E3A5F' },
        // Custom institutional slate blending deep pine with readable neutral tones
        slate: {
          800: '#143828',
          850: '#0E2A1E',
          900: '#092116',
          950: '#05140D',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Libre Baskerville"', 'Georgia', 'serif'],
      },
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'xs':   '0 1px 2px 0 rgba(0,0,0,0.04)',
        'sm':   '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card': '0 2px 8px -2px rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.06)',
        'md':   '0 4px 12px -4px rgba(0,0,0,0.1)',
        'float': '0 12px 32px -4px rgba(0, 105, 55, 0.12), 0 4px 12px -2px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
