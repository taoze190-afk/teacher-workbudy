import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: '班主任工作台',
  description: '初一班主任管理系统 · 数据私有 · 三端适配',
  // PWA：<link rel="manifest"> 由 app/manifest.ts 自动注入；
  // 这里补齐 iOS 主屏图标与"独立窗口打开"所需标签
  applicationName: '班主任工作台',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: '班主任工作台',
    // 用 default 而不是 black-translucent：后者会让页面顶到状态栏下面，粘性顶栏会被遮住
    statusBarStyle: 'default',
  },
  // 学生信息里全是电话号码，禁止手机浏览器把数字自动识别成拨号链接
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 独立窗口打开时状态栏/任务切换卡片的颜色，跟随主题
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 全站只保留浅色主题：在首帧前就把 light 类挂上，避免先按深色画一帧再跳变 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('light');`,
          }}
        />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
