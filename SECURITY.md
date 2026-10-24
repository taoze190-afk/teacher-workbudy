# 安全政策 / Security Policy

## 支持版本

| 版本 | 状态 |
|---|---|
| main 分支最新提交 | ✅ 支持 |

## 报告漏洞

本项目包含学生个人信息处理逻辑，我们非常重视安全问题。

**请勿在公开 Issue 中报告安全漏洞。** 请使用 GitHub 的
[私密漏洞报告](https://docs.github.com/zh/code-security/security-advisories/guidance-for-reporting-and-writing-security-advisories)（仓库页 → Security → Report a vulnerability）私下报告。

我们会在 7 天内回复确认，并在修复发布前对你致谢（如果你愿意）。

## 架构安全模型（先读这个）

本应用的数据面与普通 Web 应用不同，这决定了漏洞的实际影响面：

- **无自建后端、无数据库服务**：所有业务数据保存在用户浏览器 IndexedDB，服务器只托管静态文件；
- **无服务端渲染逻辑**：全部页面为客户端组件，静态导出（`output: 'export'`）；
- **未使用** Next.js Middleware / Server Actions / Server Components / 图片优化 API（`images.unoptimized: true`）；
- 敏感信息（学生档案、身份证号）不经过任何网络传输。

## 已知未修复的依赖告警（npm audit 说明）

以下告警经评估后**暂不升级**，理由与缓解措施如下（升级涉及大版本破坏性变更）：

| 依赖 | 告警 | 不升级理由 | 缓解 |
|---|---|---|---|
| next 14.2.x | 多个 critical/high（Server Actions / Middleware / RSC / 图片优化 API 等） | 修复版在 Next 16（破坏性升级）。本应用为纯静态导出，上述受攻击面全部未使用 | Docker standalone 模式仅提供静态文件；若你的部署开启了图片优化或 Middleware，请自行升级 Next 16 |
| postcss（next 传递依赖） | high | 同上，随 next 16 修复 | 仅构建期使用，产物为应用自身 CSS，不处理不可信输入 |
| tailwindcss 3.x / postcss-selector-parser | moderate（构建期 CPU 耗尽） | 修复在 tailwind 4（破坏性升级） | 仅构建期使用 |
| echarts | 6.0 以下有 XSS | 已升级至 6.1.0 ✅ | — |
| xlsx | 原型污染 / ReDoS | 已换用 SheetJS 官方 0.20.3 修复版（`vendor/`，npm 渠道无修复版）✅ | — |

## 数据安全设计要点

- 登录口令仅存 PBKDF2-SHA256 哈希（15 万次迭代），明文密码不落盘；
- 加密备份使用 Web Crypto AES-GCM，密钥由用户口令派生，服务端/仓库永远接触不到；
- 身份证号在导入解析后立即丢弃，不写入数据库（见 `lib/importer.ts`）；
- 敏感操作（登录/导入/删除/打印）写入只追加审计日志。

## 仓库卫生

- 本仓库历史中不应出现任何真实学生数据、密钥或密码；
- 不要把导出的 `.dshbak` 备份文件提交进仓库或上传到公开位置（它本身含全部学生数据）。
