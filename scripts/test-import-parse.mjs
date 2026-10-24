// 导入解析的真实测试：直接调用应用里的 parseFile（经 tsc 编译），喂真实/刁钻 Excel
// 准备：npx tsc -p .tmp/tsconfig.import-test.json
// 运行：node scripts/test-import-parse.mjs
import Module from 'node:module';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp', 'imp');

// 让编译产物里的 "@/lib/xxx" 指向 .tmp/imp/lib/xxx
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) return origResolve.call(this, path.join(OUT, request.slice(2)), ...rest);
  return origResolve.call(this, request, ...rest);
};

const { parseFile } = require(path.join(OUT, 'lib/importer.js'));
const XLSX = require('xlsx');

console.log('Node:', process.version, '| File 全局可用:', typeof File !== 'undefined');

const f = (buf, name) => new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

function aoaToFile(rows, name, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return f(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), name);
}

const line = (c = '─') => console.log(c.repeat(78));

async function show(title, file, type, opts = {}) {
  line('=');
  console.log('▶', title);
  let r;
  try {
    r = await parseFile(type, file);
  } catch (e) {
    console.log('  ❌ parseFile 抛异常：', e.message);
    return null;
  }
  console.log('  表头识别:', JSON.stringify(r.header));
  console.log('  解析行数:', r.rows.length, '| message:', r.message ?? '(无)');
  if (r.notice) console.log('  提示:', r.notice);
  const errRows = r.rows.filter((x) => x.errors.length > 0);
  console.log('  报错行数:', errRows.length);
  if (errRows.length > 0 && opts.showErrors !== false) {
    errRows.slice(0, 6).forEach((x) => console.log(`    行${x.row}: ${x.errors.map((e) => `${e.field}=${e.reason}`).join('; ')}`));
    if (errRows.length > 6) console.log(`    …另有 ${errRows.length - 6} 行`);
  }
  if (r.rows.length > 0 && opts.showSample !== false) {
    console.log('  首行解析:', JSON.stringify(r.rows[0].values));
  }
  // 科目列 = 表头里被当作科目的（成绩表）
  if (type === 'grades') {
    console.log('  科目映射(raw → 归一化):', JSON.stringify(r.subjectMap ?? []));
  }
  if (opts.showWarnings !== false && r.rows.some((x) => x.warnings?.length)) {
    const w = r.rows.filter((x) => x.warnings?.length);
    console.log(`  提醒(不阻断导入) ${w.length} 行，示例:`, JSON.stringify(w[0].warnings));
  }
  return r;
}

const real = (name) => f(readFileSync(path.join(ROOT, '示例文件', name)), name);

// ───────────── 用例 1：真实示例成绩表 ─────────────
await show('用例1 · 你的示例成绩表（52人×7科）', real('成绩示例-期中考试.xlsx'), 'grades');

// ───────────── 用例 2：真实示例学生名单 ─────────────
await show('用例2 · 你的示例学生名单（52人，含「标签」列）', real('学生名单示例-52人.xlsx'), 'students');

// ───────────── 用例 3：学生边界测试文件 ─────────────
await show('用例3 · 学生边界文件（缺学号/重号/坏生日）', real('边界测试-学生.xlsx'), 'students');

// ───────────── 用例 4：学校系统常见成绩表格式 ─────────────
const sysExport = [
  ['初一(1)班期中考试成绩表'],            // 标题行
  ['制表人：教务处  2024-11-10'],          // 说明行
  ['班级', '学号', '姓名', '语文（120）', '数学（120）', '英语（120）', '总分', '班级排名', '年级排名', '等级', '备注'],
  ['1班', '01', '张子轩', '88', '87', '99', '540', '5', '32', 'B', ''],
  ['1班', '02', '李雨欣', '105', '80', '82', '510', '12', '88', 'B', ''],
  ['1班', '03', '李浩然', '119', '68', '88', '498', '18', '150', 'C', ''],
];
await show('用例4 · 学校系统导出的成绩表（带班级/总分/排名/等级/满分括号）', aoaToFile(sysExport, '系统导出.xlsx'), 'grades');

// ───────────── 用例 5：表头在第 6 行以后 ─────────────
const lateHeader = [
  ['XX中学2024学年第一学期'],
  ['期中考试成绩统计'],
  ['考试时间：2024-11-08'],
  ['说明：本次考试语文数学英语满分均为120分'],
  ['制表：教务处'],
  ['发榜日期：2024-11-12'],
  ['学号', '姓名', '语文', '数学', '英语'],
  ['01', '张子轩', '88', '87', '99'],
];
await show('用例5 · 表头在第 7 行（前面 6 行标题）', aoaToFile(lateHeader, '晚表头.xlsx'), 'grades');

// ───────────── 用例 6：分数写成各种非纯数字 ─────────────
const messyScores = [
  ['姓名', '语文', '数学', '英语', '政治'],
  ['张子轩', '88分', '87', '缺考', '—'],
  ['李雨欣', '105', '请假', '82', '/'],
  ['李浩然', '119', '68', '88', '　'],   // 全角空格
  ['王小二', '93.5', '无', '88', ''],
];
await show('用例6 · 分数写成「88分 / 缺考 / 请假 / — / / / 无 / 小数 / 全角空格」', aoaToFile(messyScores, '脏数据.xlsx'), 'grades');

// ───────────── 用例 7：姓名带空格 + 重名 ─────────────
const nameIssues = [
  ['学号', '姓名', '语文', '数学'],
  ['01', '张子轩', '88', '87'],
  ['02', '张子轩 ', '80', '80'],          // 尾部空格（trim 后重名）
  ['03', '李 雨欣', '105', '80'],         // 中间空格
  ['04', '李雨欣', '100', '70'],          // 与上一行 trim 后不同名 → 会新建学生？
];
await show('用例7 · 姓名带空格与重名', aoaToFile(nameIssues, '姓名问题.xlsx'), 'grades');

// ───────────── 用例 8：单科表（只有语文，如任教班） ─────────────
const onlyChinese = [
  ['姓名', '语文'],
  ['张子轩', '88'],
  ['李雨欣', '105'],
];
await show('用例8 · 单科成绩表（只有语文）', aoaToFile(onlyChinese, '单科.xlsx'), 'grades');

// ───────────── 用例 9：成绩表末尾带汇总行 ─────────────
const withSummary = [
  ['学号', '姓名', '语文', '数学', '英语'],
  ['01', '张子轩', '88', '87', '99'],
  ['02', '李雨欣', '105', '80', '82'],
  ['', '班级平均分', '96.5', '83.5', '90.5'],
  ['', '年级最高分', '119', '105', '99'],
  ['', '合计', '192', '167', '181'],
];
await show('用例9 · 成绩表末尾带「班级平均分 / 年级最高分 / 合计」行', aoaToFile(withSummary, '带汇总行.xlsx'), 'grades');

// ───────────── 用例 10：名单含非标准家庭结构 + 合计行 ─────────────
const badFamily = [
  ['学号', '姓名', '性别', '家庭结构'],
  ['01', '张子轩', '男', '三代同堂'],
  ['02', '李雨欣', '女', '重组家庭'],
  ['03', '李浩然', '男', '双亲'],
  ['', '合计', '', '3人'],
];
await show('用例10 · 名单含非标准家庭结构（三代同堂/重组家庭）+ 合计行', aoaToFile(badFamily, '家庭结构.xlsx'), 'students');

line('=');
console.log('测试结束');