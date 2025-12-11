import type { Config } from 'tailwindcss';

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './utils/**/*.{js,ts}',
    './app.vue',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary - Iridescent Blue
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9ddff',
          300: '#7cc4ff',
          400: '#36a9ff',
          500: '#0a8fff',
          600: '#006dd4',
          700: '#0058ab',
          800: '#054a8d',
          900: '#0a3f74',
          950: '#06274d',
        },
        // Accent - Holographic Purple
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6d28d9',
          900: '#5b21b6',
          950: '#3b0764',
        },
        // Success - Mint Glass
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Warning - Amber Chrome
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Error - Ruby Glass
        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // Surface colors for liquid glass on black
        surface: {
          DEFAULT: '#000000',
          50: '#0a0a0c',
          100: '#121216',
          200: '#1a1a1e',
          300: '#242428',
          400: '#2e2e34',
          500: '#3a3a40',
          600: '#4a4a52',
          700: '#6a6a74',
          800: '#9a9aa4',
          900: '#cacad4',
          950: '#ffffff',
        },
        // Glass specific colors
        glass: {
          white: 'rgba(255, 255, 255, 0.1)',
          'white-strong': 'rgba(255, 255, 255, 0.2)',
          border: 'rgba(255, 255, 255, 0.15)',
          'border-strong': 'rgba(255, 255, 255, 0.25)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
      },
      borderRadius: {
        'none': '0',
        'sm': '0.375rem',
        'DEFAULT': '0.625rem',
        'md': '0.625rem',
        'lg': '1rem',
        'xl': '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        'full': '9999px',
      },
      boxShadow: {
        // Glass inner highlights
        'glass-inner': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        'glass-inner-strong': 'inset 0 2px 4px 0 rgba(255, 255, 255, 0.15)',
        // Chrome shadows
        'chrome-sm': '0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
        'chrome-md': '0 4px 16px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
        'chrome-lg': '0 8px 32px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4)',
        'chrome-xl': '0 16px 64px rgba(0, 0, 0, 0.7), 0 8px 16px rgba(0, 0, 0, 0.5)',
        // Liquid drop shadow
        'liquid': '0 20px 40px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        // Glass card shadows
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-hover': '0 16px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        // Glow effects
        'glow-white': '0 0 20px rgba(255, 255, 255, 0.2), 0 0 40px rgba(255, 255, 255, 0.1)',
        'glow-blue': '0 0 20px rgba(10, 143, 255, 0.3), 0 0 40px rgba(10, 143, 255, 0.15)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(168, 85, 247, 0.15)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'chrome-shine': 'chromeShine 3s ease-in-out infinite',
        'liquid-flow': 'liquidFlow 8s ease infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        chromeShine: {
          '0%': { transform: 'translateX(-100%)' },
          '50%, 100%': { transform: 'translateX(200%)' },
        },
        liquidFlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(255, 255, 255, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 255, 255, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      transitionTimingFunction: {
        'fluid': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'apple': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '400ms',
        'slower': '600ms',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
    },
  },
  plugins: [],
} satisfies Config;
