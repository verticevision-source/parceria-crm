/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   '#080d17',
          secondary: '#0f1622',
          tertiary:  '#162035',
          hover:     '#1e2d4a',
          glass:     'rgba(15,22,34,0.85)',
        },
        // Aliases usados em modais e selects (bg-card, bg-background)
        card:       '#0f1622',
        background: '#080d17',
        primary: {
          DEFAULT: '#6366f1',
          hover:   '#5254cc',
          light:   '#818cf8',
          muted:   'rgba(99,102,241,0.15)',
        },
        gold: {
          DEFAULT: '#C9952A',
          light:   '#F5D06B',
          muted:   'rgba(201,149,42,0.15)',
        },
        success: {
          DEFAULT: '#10b981',
          muted:   'rgba(16,185,129,0.15)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted:   'rgba(245,158,11,0.15)',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted:   'rgba(239,68,68,0.15)',
        },
        border: {
          DEFAULT: '#1e2d4a',
          light:   '#2a3f66',
          gold:    'rgba(201,149,42,0.35)',
        },
        text: {
          primary:   '#f0f4ff',
          secondary: '#8fa3c8',
          muted:     '#4a6080',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl:  '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        card:    '0 4px 32px rgba(0,0,0,0.5)',
        modal:   '0 24px 80px rgba(0,0,0,0.7)',
        glow:    '0 0 24px rgba(99,102,241,0.35)',
        'glow-gold': '0 0 20px rgba(201,149,42,0.4)',
        'glow-green': '0 0 20px rgba(16,185,129,0.3)',
        inner:   'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'gradient-card':    'linear-gradient(135deg, #0f1622 0%, #162035 100%)',
        'gradient-primary': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        'gradient-gold':    'linear-gradient(135deg, #C9952A 0%, #F5D06B 50%, #C9952A 100%)',
        'gradient-success': 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        'gradient-dark':    'linear-gradient(180deg, #080d17 0%, #0a1020 100%)',
        'shine':            'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)',
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'slide-in':   'slideIn 0.2s ease-out',
        'pulse-soft': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':    'shimmer 2.5s infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity:'0' }, '100%': { opacity:'1' } },
        slideUp: { '0%': { transform:'translateY(12px)', opacity:'0' }, '100%': { transform:'translateY(0)', opacity:'1' } },
        slideIn: { '0%': { transform:'translateY(8px)', opacity:'0' }, '100%': { transform:'translateY(0)', opacity:'1' } },
        shimmer: { '0%': { backgroundPosition:'-200% 0' }, '100%': { backgroundPosition:'200% 0' } },
      },
    },
  },
  plugins: [],
}
