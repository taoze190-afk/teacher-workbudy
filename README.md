# 班主任工作台

初中班主任用的班级管理工具：学生档案、考勤、作业、值日、成绩分析、评语、打印。26 个功能模块，手机、iPad、电脑都能用，添加到主屏幕就是一个 App。

数据只存在你自己浏览器的 IndexedDB 里。不注册云服务，不配数据库，clone 下来装完依赖就能用。

技术栈：Next.js 14（App Router，构建成纯静态文件）、TypeScript、Tailwind CSS、ECharts、SheetJS。

## 功能与路由

| 模块 | 路由 | 说明 |
|---|---|---|
| 今日看板 | `/dashboard` | 当天的考勤异常、未交作业、到期跟进、待办、值日、生日 |
| 学生档案 | `/students`、`/students/detail` | 增删改查、搜索筛选、每个学生的成长时间线；转出用软删除 |
| 座位 | `/seating` | 桌面拖拽、触屏点选放置，支持锁定、轮换、男女交替，座位图导出 PNG |
| 我的课表 | `/schedule` | 周课表编辑与打印 |
| 考勤 | `/attendance` | 按节点考勤或每日总考勤，请假审批通过后自动生成记录，按月汇总 |
| 值日 | `/duty` | 自动均分、每周轮换、每日检查记录 |
| 作业 | `/homework` | 默认全员已交，点一下改成未交，可导出未交名单 |
| 课堂工具 | `/tools` | 随机点名，当天不重复 |
| 事件台账 | `/events` | 表扬、违纪、冲突、意外，记严重度与处理状态，生成家长通知文案 |
| 谈心谈话 | `/talks` | 结构化记录、跟进日期、逾期提醒 |
| 重点关注 | `/focus` | 红黄台账，进页面要 PIN，级别变更留日志 |
| 重点学生汇总 | `/focus-summary` | 健康、心理、家庭三类台账汇总 |
| 考试管理 | `/exams` | 建考试，每科满分单独设 |
| 成绩 | `/grades` | 五个页签：录入、排名、分析、临界生、分析报告 |
| 学习小组 | `/groups` | 分组，每组第一位是组长 |
| 家校联系 | `/contacts` | 电话、微信、面谈、家访记录，逾期提醒 |
| 家长会 | `/meetings` | 会议记录，预生成签到名单 |
| 班委 | `/leaders` | 按学期任命与解除 |
| 活动 | `/activities` | 活动记录与荣誉 |
| 评语 | `/reports` | 用平时记录生成评语草稿，另有评语素材库 |
| 备课教案 | `/lesson-prep` | 教案结构化编辑，可导出 PPT |
| 课堂 | `/classroom` | 课堂资源留档，可生成 OpenMAIC 的课堂提示词 |
| 导入中心 | `/import` | 名单、成绩宽表、问卷星导出表、课表：下载模板、识别表头同义词、预览纠错，重复导出不产生脏数据 |
| 打印中心 | `/print` | 座位表、成绩条、考勤汇总、家长会签到表、值日表，A4 打印或存 PDF |
| 安全中心 | `/security` | 审计日志、加密备份、应用锁 PIN、水印开关 |
| 设置 | `/settings` | 手机号打码开关、座位行列、AI 评语配置、家长告知文案复制 |

另有 `/login` 登录页、`/reset-password` 兼容旧链接（进入即跳回登录）、`/` 按登录状态跳转到看板或登录页。

## 开始使用

```bash
git clone https://github.com/taoze190-afk/teacher-workbudy.git
cd teacher-workbudy
npm install
npm run dev              # http://localhost:3000
```

首次打开是登录页。这里的账号只用来锁住你本机数据，用户名和密码都存在这台设备的浏览器里，不发送到任何地方。

登录后先在设置页建班级，再到导入中心下载模板、导入学生名单。

想先看看功能，登录页有演示模式：一套虚构班级数据，不落盘、不联网，退出即清空。

## 目录结构

```
app/                      页面（App Router，一个目录一个页面）
  (app)/                  登录后的 26 个模块，共用 AppShell 的导航与顶栏
  login/                  本机账号登录、演示模式入口
  page.tsx                按登录状态跳 /dashboard 或 /login
  reset-password/         兼容旧链接，进入即跳回登录页
  layout.tsx              根布局：水印、应用锁、Service Worker 注册
  manifest.ts             PWA 清单（图标与截图声明）
  globals.css             Tailwind 入口与全局样式

components/
  AppShell.tsx            侧栏与抽屉导航、顶栏；⌘K / Ctrl+K 打开命令面板
  CommandPalette.tsx      全局搜索跳转
  AppLockGate.tsx         敏感页的 PIN 锁外壳
  Watermark.tsx           半透明斜纹水印层，开关在设置页
  ImportFlow.tsx          导入中心的完整流程：模板 → 解析 → 预览纠错 → 写入
  ImportDialog.tsx        学生页、成绩页里就地调用的导入弹窗
  SurveyImport.tsx        新生调查表导入界面
  Chart.tsx               ECharts 封装，亮/暗两套主题在组件内注册
  PwaRegister.tsx         注册 Service Worker
  ui.tsx                  基础控件：Button、Card、Field、Input、Modal、Confirm 等
  grades/                 成绩页四个面板：排名、分析、临界生、分析报告（录入直接在页面里）

lib/
  supabase.ts             数据层门面，全站唯一入口。名字是早期遗留，实现已是本地
  local-core.ts           查询引擎：from / eq / insert / update / upsert / rpc 与视图
  local.ts                IndexedDB 快照、本机账号（PBKDF2）、附件存取
  demo.ts                 演示模式的数据集，复用同一套引擎
  importer.ts             Excel 解析：表头同义词、逐行校验、身份证号即取即弃
  survey.ts               问卷星原始导出表解析
  crypto.ts               加密备份：AES-GCM，密钥由用户口令派生
  ai.ts                   AI 评语草稿，走 OpenAI 兼容接口，密钥只存本机
  ocr.ts                  请假条拍照识字（tesseract.js 中文模型）
  rank.ts                 名次算法。成绩页与打印中心共用一份，避免两处口径不一致
  lesson.ts               备课：预设课文、模板教案、AI 生成、PPT 导出
  classroom-prompt.ts     把教案拼成 OpenMAIC 的课堂生成提示词
  export-students.ts      学生档案导出成一张 Excel
  constants.ts            导航表 NAV / NAV_GROUPS 与全局常量
  types.ts                实体类型，与 design-docs/supabase/schema.sql 对应
  chart-theme.ts          图表统一配色与字号
  utils.ts                cn() 等小工具
  node-stub.js            pptxgenjs 在浏览器用不到的 Node 内置模块空桩

public/
  icons/  favicon.ico     应用图标，由 npm run icons 生成
  sw.js                   Service Worker。刻意不缓存页面与产物，见文件内说明
  screenshots/            PWA 清单里声明的应用截图
  classroom-assets/       演示模式引用的课堂示例（课件与交互页）

示例文件/                  四个 xlsx 模板，数据全为虚构：52 人名单、期中成绩、课表、边界测试
vendor/                   xlsx-0.20.3.tgz，SheetJS 官方修复版。npm 渠道的 0.18 有原型污染，故内置
design-docs/              设计文档与早期数据模型，见 design-docs/README.md
scripts/                  生成图标、生成示例数据、导入解析自测、静态预览、打包部署

next.config.mjs           静态导出与 Node 服务的开关：BUILD_MODE=server 走 standalone
Dockerfile                standalone 模式镜像，容器内 3000 端口
docker-compose.yml        映射宿主 3100 端口
DEPLOY.md                 部署说明
SECURITY.md               安全政策与依赖告警的取舍说明
```

## 数据与隐私

学生数据属于敏感个人信息，这个项目按「数据不出本机」的思路做：

- 业务数据和学生照片都存在浏览器 IndexedDB，不上传任何服务器。
- 登录口令只存 PBKDF2-SHA256 哈希，明文密码不落盘。重点关注、安全中心这类页面另有 PIN 锁。
- 导入新生调查表时，身份证号只用来取生日和校验性别，解析完立即丢弃，不入库。
- 问卷平台自带的序号、提交时间、来源、IP 等列自动跳过。
- 打印输出可一键打码手机号，全屏水印可开关。
- 安全中心可导出 AES-GCM 加密的 `.dshbak` 备份，换设备或清浏览器数据靠它迁移。
- 登录、导入、删除、打印这类操作写入只追加的审计日志，可在安全中心自查。

浏览器清理「站点数据」会把这个应用的本地数据一起删掉。建议每周从安全中心导出一份加密备份。

## 构建与部署

```bash
npm run build            # 纯静态产物在 out/，任意静态托管均可
npm run preview          # 本地预览 out/
docker compose up -d --build    # 改用 Node 服务方式运行，访问宿主 3100 端口
```

静态托管、1Panel、Nginx、GitHub Pages 的具体做法见 [DEPLOY.md](DEPLOY.md)。

## 常用脚本

```bash
npm run icons                          # 重新生成 PWA 图标
node scripts/generate-demo-data.mjs    # 重新生成 示例文件/ 下的示例 Excel
node scripts/test-import-parse.mjs     # 导入解析器自测
npm run pack                           # 打包部署产物
```

## License

[MIT](LICENSE)
