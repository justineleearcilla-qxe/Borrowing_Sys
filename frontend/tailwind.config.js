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
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
          950: '#0f172f',
        },
      },
    },
  },
  plugins: [],
}
