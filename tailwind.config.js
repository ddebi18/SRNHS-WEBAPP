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
        cream: '#FAF6F0',
        sidebar: '#1B4332',
        palette: {
          darkGreen:   '#1B4332',
          forestGreen: '#2D6A4F',
          midGreen:    '#40916C',
          lightBrown:  '#D4A373',
          creamBrown:  '#E6CCB2',
          amberTan:    '#DDA15E',
        },
        card: {
          darkGreen:   '#1B4332',
          forestGreen: '#2D6A4F',
          midGreen:    '#40916C',
          lightBrown:  '#D4A373',
          creamBrown:  '#E6CCB2',
          amberTan:    '#DDA15E',
          peach:       '#D4A373',
          cyan:        '#2D6A4F',
          yellow:      '#DDA15E',
          sage:        '#40916C',
          teal:        '#2D6A4F',
          lavender:    '#E6CCB2',
          blue:        '#40916C',
        },
        brand: {
          DEFAULT: '#2D6A4F',
          50: '#F2F9F5',
          100: '#E2F2E9',
          200: '#52B788',
          500: '#2D6A4F',
          600: '#1B4332',
          700: '#D4A373',
          800: '#C68B59',
          900: '#E6CCB2',
        },
        brown: {
          light: '#E6CCB2',
          tan:   '#D4A373',
          amber: '#DDA15E',
          toffee:'#C68B59',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'card': '4px 4px 0px 0px rgba(0,0,0,0.12)',
        'card-sm': '2px 2px 0px 0px rgba(0,0,0,0.08)',
        'inner-sm': 'inset 0 1px 2px 0 rgba(0,0,0,0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
