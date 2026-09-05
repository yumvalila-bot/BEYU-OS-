import type { Config } from 'tailwindcss';

/**
 * BEYU brand palette: dark navy and gold.
 *
 * Colours are declared as CSS custom properties in globals.css and referenced
 * here through `rgb(var(--...) / <alpha-value>)`, so light and dark mode are a
 * single class swap on <html> rather than two parallel sets of utilities
 * that can drift apart.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050b18',
          900: '#0a1428',
          800: '#0f1e3a',
          700: '#16294d',
          600: '#1e3661',
          500: '#2a4677',
        },
        gold: {
          600: '#a8801f',
          500: '#c9a227',
          400: '#d9b641',
          300: '#e6cd77',
          200: '#f0e0aa',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--ink-subtle) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        caution: 'rgb(var(--caution) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
