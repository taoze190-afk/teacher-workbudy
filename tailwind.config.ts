import type { Config } from 'tailwindcss';

/**
 * 设计令牌：参照 DeepSeek 开放平台
 * - 主色 #4D6BFE（品牌蓝），选中态用浅蓝底 + 蓝字
 * - 中性灰阶取代原来的蓝灰 slate：深色用 #1a1a1a / #212121，浅色用 #f9fafb / #ffffff
 * - 圆角收敛到 8/10/14px，阴影改为极浅投影（扁平、靠色差和描边分层，不用重阴影）
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#8b9cfb',
          500: '#4d6bfe',
          600: '#3f5ae8',
          700: '#3245c4',
          800: '#2a389e',
          900: '#232f7e',
        },
        // 中性灰阶（DeepSeek 风格的冷调中性灰，替代 Tailwind 默认蓝灰）
        slate: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#212121',
          900: '#1a1a1a',
          950: '#141414',
        },
      },
      borderRadius: {
        xl: '10px',
        '2xl': '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        cardhover: '0 4px 14px -4px rgba(16,24,40,.10)',
        float: '0 16px 40px -12px rgba(16,24,40,.28)',
      },
    },
  },
  plugins: [],
};

export default config;
