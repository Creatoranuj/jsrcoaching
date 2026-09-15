import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
export default {
  darkMode: ["class"],
  // Prevents sticky :hover styles on touch devices (Capacitor WebView, mobile web).
  // Hover utilities only apply on devices that actually support hover (mouse/trackpad).
  future: { hoverOnlyWhenSupported: true },
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
			},
  			whatsapp: {
  				DEFAULT: 'hsl(var(--whatsapp))',
  				foreground: 'hsl(var(--whatsapp-foreground))'
  			},
  			'gold-soft': {
  				DEFAULT: 'hsl(var(--gold-soft))',
  				foreground: 'hsl(var(--gold-soft-foreground))'
  			},
  			'brand-accent': {
  				DEFAULT: 'hsl(var(--brand-accent))',
  				hover: 'hsl(var(--brand-accent-hover))',
  				foreground: 'hsl(var(--brand-accent-foreground))'
  			},
  			'brand-telegram': {
  				DEFAULT: 'hsl(var(--brand-telegram))',
  				hover: 'hsl(var(--brand-telegram-hover))'
  			},
  			'brand-youtube': {
  				DEFAULT: 'hsl(var(--brand-youtube))',
  				hover: 'hsl(var(--brand-youtube-hover))'
  			},
  			'reading-sepia': {
  				DEFAULT: 'hsl(var(--reading-sepia-bg))',
  				foreground: 'hsl(var(--reading-sepia-fg))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			gold: {
  				DEFAULT: 'hsl(var(--gold))',
  				foreground: 'hsl(var(--gold-foreground))'
  			},
  			ink: {
  				DEFAULT: 'hsl(var(--ink))',
  				foreground: 'hsl(var(--ink-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			float: {
  				'0%,100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-8px)' },
  			},
  			'fade-in-up': {
  				from: { opacity: '0', transform: 'translateY(14px)' },
  				to: { opacity: '1', transform: 'translateY(0)' },
  			},
  			'marquee': {
  				from: { transform: 'translateX(0)' },
  				to: { transform: 'translateX(-50%)' },
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
  			'marquee': 'marquee 30s linear infinite',
  		},
  		spacing: {
  			'safe': 'env(safe-area-inset-bottom)',
  			'safe-t': 'env(safe-area-inset-top)',
  			'safe-b': 'env(safe-area-inset-bottom)',
  			'safe-l': 'env(safe-area-inset-left)',
  			'safe-r': 'env(safe-area-inset-right)',
  		},
  		boxShadow: {
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			'2xl': 'var(--shadow-2xl)'
  		},
		fontSize: {
			nav: ['10px', { lineHeight: '12px' }],
			'display-sm': ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
			'display-md': ['3rem',    { lineHeight: '1.02', letterSpacing: '-0.022em' }],
			'display-lg': ['3.75rem', { lineHeight: '1.0',  letterSpacing: '-0.025em' }],
			'display-xl': ['5rem',    { lineHeight: '0.98', letterSpacing: '-0.028em' }],
		},
		fontFamily: {
			sans: [
				'Poppins',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'Noto Sans',
  				'sans-serif'
  			],
  			mono: [
  				'SF Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			],
  			serif: [
  				'Crimson Pro',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			display: [
  				'Archivo Black',
  				'Impact',
  				'Haettenschweiler',
  				'Arial Black',
  				'sans-serif'
  			]
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
