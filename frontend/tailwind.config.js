export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  /*
   * The Button and Badge components build their class names at runtime
   * (`btn-${variant}`, `badge-${tone}`), so the scanner never sees the full
   * class name. Without this safelist Tailwind purges those component rules
   * from index.css and the buttons/badges render with no background at all.
   */
  safelist: [
    'btn-primary',
    'btn-danger',
    'btn-success',
    'badge-gray',
    'badge-blue',
    'badge-green',
    'badge-purple',
  ],
  theme: {
    borderRadius: {
      none: '0',
      sm: '0',
      DEFAULT: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      full: '0',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#F1F5F9',
          100: '#E2E8F0',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#475569',
          600: '#334155',
          700: '#1E293B',
          800: '#163858',
          900: '#0F2A4A',
          950: '#091A2F',
        },
      },
    },
  },
  plugins: [],
}
