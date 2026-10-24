# 部署指南

## 先理解一件事：你的数据不在服务器上

本系统的所有数据（学生、成绩、考勤、教案…）都保存在**每个用户自己的浏览器（IndexedDB）**里，
浏览器直接读写本机数据，不上传任何服务器。

所以服务器只负责一件事：**把界面文件发给浏览器** —— 用静态网站方式托管即可，
不需要 Node 进程、不需要数据库、几乎不吃服务器内存。构建产物只有几 MB，1 核 1G 的服务器也毫无压力。

> 同一台设备 + 同一浏览器 = 一个独立的数据空间。换设备或清浏览器数据时，
> 用「安全中心 → 导出加密备份（.dshbak）」迁移。

## 方式一：静态托管（推荐）

```bash
npm install
npm run build          # 产物在 out/
```

把 `out/` 目录整体上传到任意静态托管：

- **Nginx / 1Panel / 宝塔**：新建静态网站，根目录指向 `out/`。
  每个路由导出为 `dir/index.html`，无需额外的 try_files 回退配置。
- **GitHub Pages / Cloudflare Pages / Vercel（静态模式）**：构建命令 `npm run build`，产物目录 `out`。

HTTPS 建议开启（PWA「添加到主屏幕」需要安全上下文）。

## 方式二：Docker

```bash
docker compose up -d --build
# 默认映射宿主机 3100 端口，浏览器访问 http://服务器IP:3100/
```

Dockerfile 使用 Next.js standalone 模式（`BUILD_MODE=server`），构建时不需要注入任何密钥或环境变量。

## 手机 / iPad 使用

部署后在 Safari/Chrome 打开网址 → 「添加到主屏幕」，即可像 App 一样全屏使用。

首次使用建议路径：初始化本机账号 → 设置页调整座位行列 → 安全中心设置 PIN →
导入中心导入学生 → 安全中心导出第一份加密备份。

## 更新版本

```bash
git pull
npm install           # 依赖有变动时
npm run build         # 重新构建并替换 out/
```

升级不会触碰浏览器里的本地数据；但仍建议升级前先导出一份加密备份。
