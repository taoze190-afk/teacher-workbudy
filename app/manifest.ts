import type { MetadataRoute } from 'next';

// PWA 清单：由 Next 在构建时输出为 /manifest.webmanifest，并自动在 <head> 注入
// <link rel="manifest" href="/manifest.webmanifest">
//
// 部署形态决定了这里的路径写法：本项目是纯静态导出（out/ 直接挂在网站根目录），
// 线上地址形如 https://域名:端口/，各页面在根路径下（/dashboard/、/students/ …）。
// 所以 → scope 用 '/'（覆盖全部页面），start_url 用 '/dashboard/'（登录后的首页）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard/',
    name: '班主任工作台',
    short_name: '班主任',
    description: '学生档案 · 考勤 · 成绩分析 · 评语 · 课表，班主任日常工作台',
    lang: 'zh-CN',
    dir: 'ltr',
    start_url: '/dashboard/',
    scope: '/',
    // 独立窗口打开，保留系统状态栏；不要用 fullscreen（会盖掉状态栏与手势区）
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#0a1020',
    background_color: '#0a1020',
    prefer_related_applications: false,
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // 长按桌面图标可直接进入常用页面
    shortcuts: [
      { name: '今日考勤', short_name: '考勤', url: '/attendance/' },
      { name: '学生档案', short_name: '学生', url: '/students/' },
      { name: '成绩分析', short_name: '成绩', url: '/grades/' },
    ],
    // Chrome 的「更丰富的安装弹窗」需要一张 form_factor: 'narrow' 的手机截图；
    // Next 的 MetadataRoute.Manifest 类型还没跟上规范里的这个字段，故此处显式断言
    screenshots: [
      {
        src: '/screenshots/phone-narrow.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
      } as unknown as { src: string; sizes?: string; type?: string },
    ],
  };
}
