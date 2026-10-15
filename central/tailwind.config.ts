import type { Config } from 'tailwindcss'

// Tokens do padrão Central v4.1: toda cor de texto/superfície vem de variável
// de tema (globals.css), para claro e escuro nunca divergirem.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: v('--ink-rgb'),
        'body-light': v('--body-light-rgb'),
        'body-mid': v('--body-mid-rgb'),
        'body-muted': v('--body-muted-rgb'),
        'body-faint': v('--body-faint-rgb'),
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        border: 'hsl(var(--border))',
        cyan: { DEFAULT: '#06b6d4' },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        space: ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jet)', 'ui-monospace', 'monospace'],
      },
      animation: { 'pulse-slow': 'pulse 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite' },
    },
  },
  plugins: [],
} satisfies Config
