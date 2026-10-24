# 部署说明

所有业务数据（学生、成绩、考勤、教案）都存在每个用户自己的浏览器 IndexedDB 里，浏览器直接读写本机数据，不上传服务器。

因此服务器只需要把静态文件发出去：不需要 Node 进程，不需要数据库，内存占用可以忽略，1 核 1G 的机器也能跑。

一台设备加一个浏览器就是一个独立的数据空间。换设备或要清理浏览器数据之前，用「安全中心 → 导出加密备份」迁移。

## 静态托管（推荐）

```bash
npm install
npm run build          # 产物在 out/
```

把 `out/` 整个目录交给任意静态托管：

- Nginx / 1Panel / 宝塔：新建静态网站，根目录指向 `out/`。每个路由导出成 `dir/index.html`，不需要额外的 `try_files` 回退配置。
- GitHub Pages / Cloudflare Pages / Vercel：构建命令 `npm run build`，产物目录 `out`。

建议上 HTTPS，PWA 的「添加到主屏幕」要求安全上下文。

## Docker

```bash
docker compose up -d --build
# 容器内 3000 端口，映射到宿主 3100，访问 http://服务器IP:3100/
```

Dockerfile 走 Next.js standalone 模式（构建时设 `BUILD_MODE=server`），不需要注入任何密钥或环境变量。

## 手机和 iPad

部署后用 Safari 或 Chrome 打开网址，选「添加到主屏幕」，就能全屏当 App 用。

第一次使用的顺序建议是：初始化本机账号 → 设置页调整座位行列 → 安全中心设 PIN → 导入中心导入学生 → 安全中心导出第一份加密备份。

## 更新版本

```bash
git pull
npm install            # 依赖有变动时
npm run build          # 重新构建并替换 out/
```

升级不会动浏览器里的本地数据，但升级前先导出一份加密备份更稳妥。
