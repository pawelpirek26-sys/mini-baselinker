/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#c2d0ff',
          300: '#9cb1ff',
          400: '#7488fc',
          500: '#5461f5',
          600: '#3e3fe9',
          700: '#332fce',
          800: '#2b29a7',
          900: '#282884',
          950: '#18174e',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
