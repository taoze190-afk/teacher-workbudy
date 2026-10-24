/** @type {import('next').NextConfig} */
// 本项目全部页面都是客户端组件，数据保存在用户浏览器（IndexedDB），
// 因此默认产出「纯静态」文件：服务器上零 Node 进程，任意静态网站托管即可。
//
// 如需以 Node 服务方式运行（Docker / 1Panel Node 项目），构建时设置 BUILD_MODE=server。
const serverMode = process.env.BUILD_MODE === 'server';

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(serverMode
    ? { output: 'standalone' }
    : {
        output: 'export',
        // 每个路由导出为 dir/index.html，静态托管无需额外的 try_files 回退配置
        trailingSlash: true,
      }),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
