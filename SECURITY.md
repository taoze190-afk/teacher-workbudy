# 安全政策

## 支持版本

main 分支的最新提交。

## 报告漏洞

这个应用处理学生个人信息，安全问题请按私密渠道报告，不要发公开 Issue。

用 GitHub 的私密漏洞报告：仓库页 → Security → Report a vulnerability。
[报告与撰写安全公告的官方说明](https://docs.github.com/zh/code-security/security-advisories/guidance-for-reporting-and-writing-security-advisories)。

收到后 7 天内回复确认。修复发布前会致谢，你要求匿名就不署名。

## 影响面：评估漏洞前先读这段

本应用的数据面和普通 Web 应用不同，这决定了漏洞的实际影响范围：

- 没有自建后端，没有数据库服务。业务数据存在用户浏览器的 IndexedDB 里，服务器只负责发静态文件。
- 没有服务端渲染。全部页面是客户端组件，默认静态导出（`output: 'export'`）。
- 未使用 Next.js Middleware、Server Actions、Server Components，图片优化也是关掉的（`images.unoptimized: true`）。
- 学生档案、身份证号这类信息不经过网络传输。

## 已知未修复的依赖告警

`npm audit` 报的下列告警，评估后暂不升级。共同原因是修复版本属于大版本破坏性升级，而本应用没有用到受影响的攻击面。

| 依赖 | 告警 | 暂不升级的理由 |
|---|---|---|
| next 14.2.x | 多个 critical / high，集中在 Server Actions、Middleware、RSC、图片优化接口 | 修复版在 Next 16。本应用纯静态导出，这些攻击面一个都没用到；Docker 模式下的 standalone 服务也只发静态文件。如果你自己的部署启用了图片优化或 Middleware，请升到 Next 16 |
| postcss（next 的传递依赖） | high | 同上，随 Next 16 修复。只在构建期使用，产物是本应用自己的 CSS，不处理不可信输入 |
| tailwindcss 3.x / postcss-selector-parser | moderate，构建期 CPU 耗尽 | 修复在 Tailwind 4，属破坏性升级。只在构建期使用 |

已处理的：echarts 升到 6.1.0（6.0 以下有 XSS）；xlsx 改用 SheetJS 官方 0.20.3 修复版并放在 `vendor/`，因为 npm 渠道拿不到修复版。

## 数据安全要点

- 登录口令只存 PBKDF2-SHA256 哈希，15 万次迭代，明文密码不落盘。
- 加密备份用 Web Crypto 的 AES-GCM，密钥由用户口令现场派生（10 万次迭代），服务端和仓库都接触不到它。
- 身份证号在调查表解析阶段就丢弃，不入库，见 `lib/survey.ts` 的 `noStore` 标记。
- 登录、导入、删除、打印这类操作写入只追加的审计日志。

## 仓库卫生

- 仓库历史里不应出现真实学生数据、密钥或口令。
- 不要把导出的 `.dshbak` 提交进仓库或传到公开位置，它里面是全部学生数据。
