/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Override Tailwind's default gray with a steel/blue-gray palette
        // Colors use CSS variables so they can be re-themed per mode (light / steel / dark).
        // Fallbacks match the original light-mode values.
        gray: {
          50: 'rgb(var(--steel-50, 248 250 252) / <alpha-value>)',
          100: 'rgb(var(--steel-100, 241 245 249) / <alpha-value>)',
          200: 'rgb(var(--steel-200, 226 232 240) / <alpha-value>)',
          300: 'rgb(var(--steel-300, 203 213 225) / <alpha-value>)',
          400: 'rgb(var(--steel-400, 148 163 184) / <alpha-value>)',
          500: 'rgb(var(--steel-500, 100 116 139) / <alpha-value>)',
          600: 'rgb(var(--steel-600, 71 85 105) / <alpha-value>)',
          700: 'rgb(var(--steel-700, 51 65 85) / <alpha-value>)',
          800: 'rgb(var(--steel-800, 30 41 59) / <alpha-value>)',
          900: 'rgb(var(--steel-900, 15 23 42) / <alpha-value>)',
        },
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        accent: {
          400: '#a3e635',
          500: '#84cc16',
          600: '#65a30d',
        },
        steel: {
          50: 'rgb(var(--steel-50, 248 250 252) / <alpha-value>)',
          100: 'rgb(var(--steel-100, 241 245 249) / <alpha-value>)',
          200: 'rgb(var(--steel-200, 226 232 240) / <alpha-value>)',
          300: 'rgb(var(--steel-300, 203 213 225) / <alpha-value>)',
          400: 'rgb(var(--steel-400, 148 163 184) / <alpha-value>)',
          500: 'rgb(var(--steel-500, 100 116 139) / <alpha-value>)',
          600: 'rgb(var(--steel-600, 71 85 105) / <alpha-value>)',
          700: 'rgb(var(--steel-700, 51 65 85) / <alpha-value>)',
          800: 'rgb(var(--steel-800, 30 41 59) / <alpha-value>)',
          900: 'rgb(var(--steel-900, 15 23 42) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['PT Sans', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        headline: ['Poppins', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card': '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
