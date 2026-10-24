// 生成演示用示例 Excel：学生名单（52人）+ 期中成绩（52人×7科，含缺考）
// 运行：node scripts/generate-demo-data.mjs
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', '示例文件');
mkdirSync(outDir, { recursive: true });

// 可复现的伪随机
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250901);

const males = [
  '张子轩', '李浩然', '王明轩', '刘一鸣', '陈思远', '杨博文', '赵天宇', '黄俊杰',
  '周子睿', '吴宇航', '徐晨阳', '孙浩宇', '胡嘉豪', '朱文博', '高俊熙', '林志强',
  '何俊贤', '罗文杰', '郑凯文', '梁宇轩', '谢子豪', '唐浩然', '许志明', '邓超文',
  '冯子墨', '曹俊豪',
];
const females = [
  '李雨欣', '王梓萱', '张欣怡', '刘诗涵', '陈静怡', '杨紫萱', '赵梦琪', '黄雅婷',
  '周雨彤', '吴思琪', '徐婉婷', '孙佳怡', '胡欣妍', '朱芷萱', '高晨曦', '林可欣',
  '何雨婷', '罗雅静', '郑思颖', '梁诗雨', '谢佳琪', '唐语嫣', '许静怡', '邓心怡',
  '冯若曦', '曹语桐',
];
const schools = ['实验小学', '第一小学', '阳光小学', '育才小学', '第二小学', '红星小学', '外国语小学', '双语小学', '中心一小', '实验二小', '花园小学', '三小'];
const structures = ['双亲', '双亲', '双亲', '双亲', '双亲', '双亲', '双亲', '单亲', '单亲', '留守', '离异', '离异'];
const tagsPool = ['住校', '需家访', '', ''];

// ---------- 1. 学生名单 ----------
const studentRows = [['学号', '姓名', '性别', '生日', '监护人电话', '家庭结构', '毕业小学', '住址', '标签']];
const students = [];
for (let i = 1; i <= 52; i++) {
  const isMale = i % 2 === 1; // 1,3,5... 男
  const pool = isMale ? males : females;
  const name = pool[Math.floor((i - 1) / 2)]; // 每人唯一
  const year = rand() < 0.5 ? 2012 : 2013;
  const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0');
  const birthday = `${year}-${month}-${day}`;
  // 示例专用号段（138-0000-xxxxx），不会与真实手机号重合
  const phone = `1380000${String(10000 + i).slice(-5)}`;
  const structure = structures[Math.floor(rand() * structures.length)];
  const school = schools[Math.floor(rand() * schools.length)];
  const tag = tagsPool[Math.floor(rand() * tagsPool.length)];
  studentRows.push([String(i).padStart(2, '0'), name, isMale ? '男' : '女', birthday, phone, structure, school, `${school}${i % 5 + 1}号院`, tag]);
  students.push({ no: String(i).padStart(2, '0'), name });
}

const ws1 = XLSX.utils.aoa_to_sheet(studentRows);
ws1['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, ws1, '学生名单');
XLSX.writeFile(wb1, join(outDir, '学生名单示例-52人.xlsx'));

// ---------- 2. 期中成绩（宽表：语文120/数学120/英语100/政治70/历史70/地理60/生物60） ----------
const subjects = [
  ['语文', 120, 96, 26],
  ['数学', 120, 88, 30],
  ['英语', 100, 78, 24],
  ['政治', 70, 56, 13],
  ['历史', 70, 54, 14],
  ['地理', 60, 46, 12],
  ['生物', 60, 45, 13],
];
const absent = { '08': '数学', '23': '语文', '41': '英语' }; // 3 处缺考

const gradeRows = [['学号', '姓名', ...subjects.map((s) => s[0])]];
for (const st of students) {
  const row = [st.no, st.name];
  for (const [sub, full, mean, spread] of subjects) {
    if (absent[st.no] === sub) {
      row.push('缺考');
    } else {
      const score = Math.max(0, Math.min(full, Math.round(mean + (rand() * 2 - 1) * spread)));
      row.push(String(score));
    }
  }
  gradeRows.push(row);
}

const ws2 = XLSX.utils.aoa_to_sheet(gradeRows);
ws2['!cols'] = [{ wch: 6 }, { wch: 10 }, ...subjects.map(() => ({ wch: 8 }))];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws2, '期中成绩');
XLSX.writeFile(wb2, join(outDir, '成绩示例-期中考试.xlsx'));

console.log('✅ 已生成：');
console.log('  ', join(outDir, '学生名单示例-52人.xlsx'), `（${studentRows.length - 1} 行学生数据）`);
console.log('  ', join(outDir, '成绩示例-期中考试.xlsx'), `（${gradeRows.length - 1} 行 × 7 科，含缺考：${Object.keys(absent).length} 人）`);
