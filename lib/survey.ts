// 新生基本情况调查表：题目定义 / 敏感标记 / 行解析
// 解析为纯函数（浏览器与 Node 通用，便于离线测试）。
// 隐私设计核心：身份证号（第 5 题）仅用于提取出生日期与校验性别，解析后立即丢弃，绝不入库。

export type SurveyGroup = 'basic' | 'family' | 'health' | 'mind' | 'expect';

export interface SurveyQuestion {
  no: number;
  label: string;
  group: SurveyGroup;
  sensitive?: boolean; // 展示时默认模糊，点击揭示并记录审计
  noStore?: boolean;   // 解析使用但绝不持久化（身份证号）
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { no: 1, label: '学生姓名', group: 'basic' },
  { no: 2, label: '性别', group: 'basic' },
  { no: 3, label: '所在班级', group: 'basic' },
  { no: 4, label: '出生年月', group: 'basic' },
  { no: 5, label: '身份证号', group: 'basic', sensitive: true, noStore: true },
  { no: 6, label: '毕业小学', group: 'basic' },
  { no: 7, label: '特殊体质/过敏史', group: 'health', sensitive: true },
  { no: 8, label: '既往病史', group: 'health', sensitive: true },
  { no: 9, label: '特长/爱好', group: 'basic' },
  { no: 10, label: '小学阶段班干部经历', group: 'basic' },
  { no: 11, label: '班级管理意向', group: 'basic' },
  { no: 12, label: '上学方式', group: 'basic' },
  { no: 13, label: '家庭结构', group: 'family' },
  { no: 14, label: '主要照料人', group: 'family' },
  { no: 15, label: '监护人1（关系/电话）', group: 'family' },
  { no: 16, label: '监护人2（关系/电话）', group: 'family' },
  { no: 17, label: '家庭住址', group: 'family', sensitive: true },
  { no: 18, label: '低收入家庭', group: 'family', sensitive: true },
  { no: 19, label: '自主学习习惯', group: 'mind' },
  { no: 20, label: '电子产品日均使用', group: 'mind' },
  { no: 21, label: '与家人沟通情况', group: 'mind' },
  { no: 22, label: '性格特点', group: 'mind' },
  { no: 23, label: '与同伴相处', group: 'mind' },
  { no: 24, label: '面对挫折/批评的反应', group: 'mind' },
  { no: 25, label: '睡眠问题', group: 'health', sensitive: true },
  { no: 26, label: '焦虑/抑郁/厌学史', group: 'mind', sensitive: true },
  { no: 27, label: '家长最关注的三个方面', group: 'expect' },
  { no: 28, label: '需要老师特别关注的地方', group: 'expect', sensitive: true },
];

export const SURVEY_GROUP_LABEL: Record<SurveyGroup, string> = {
  basic: '基本信息',
  family: '家庭情况',
  health: '健康信息',
  mind: '习惯与心理',
  expect: '家长期望',
};

export const SENSITIVE_QNOS = SURVEY_QUESTIONS.filter((q) => q.sensitive).map((q) => q.no);
export const NO_STORE_QNOS = SURVEY_QUESTIONS.filter((q) => q.noStore).map((q) => q.no);
export const surveyLabel = (no: number) => SURVEY_QUESTIONS.find((q) => q.no === no)?.label ?? `第${no}题`;

/* ---------- 解析工具 ---------- */

const ID_RE = /^\d{17}[\dXx]$/;

// 身份证号 → 生日（YYYY-MM-DD）；不合法返回空串。仅用于填充生日字段。
export function birthdayFromIdCard(id: string): string {
  const s = id.trim();
  if (!ID_RE.test(s)) return '';
  const y = s.slice(6, 10);
  const m = s.slice(10, 12);
  const d = s.slice(12, 14);
  const mm = Number(m);
  const dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  const year = Number(y);
  if (year < 1990 || year > 2030) return '';
  return `${y}-${m}-${d}`;
}

// 身份证号 → 性别（第 17 位奇数=男）；不合法返回空串
export function genderFromIdCard(id: string): string {
  const s = id.trim();
  if (!ID_RE.test(s)) return '';
  return Number(s[16]) % 2 === 1 ? '男' : '女';
}

// 身份证号脱敏（仅用于导入预览展示）
export function maskIdCard(id: string): string {
  const s = id.trim();
  if (s.length < 10) return s ? '***' : '';
  return s.slice(0, 3) + '*'.repeat(Math.max(4, s.length - 7)) + s.slice(-4);
}

// 监护人字段解析：「与学生关系:〖母女〗┋联系电话〖13800000000〗」（冒号全半角、有无"联系"前缀均兼容）
export function parseGuardian(v: string): { relation: string; phone: string } {
  const s = v.trim();
  if (!s || s === '无') return { relation: '', phone: '' };
  const relM = s.match(/关系\s*[：:]\s*[〖\[(【]?([^〗\]）】]*)/);
  const telM = s.match(/(?:联系电话|电话)\s*[：:]?\s*[〖\[(【]?\s*(1\d{10})\s*[〗\]）】]?/);
  return { relation: (relM?.[1] ?? '').trim(), phone: (telM?.[1] ?? '').trim() };
}

// 「是，担任过的职务：〖英语课代表〗」→ 职务；「否」→ 空串
export function parseLeaderDuty(v: string): string {
  const s = v.trim();
  if (!s || /^否/.test(s)) return '';
  const m = s.match(/[〖【\[(]([^〗】\]）)]+)/);
  if (m) return m[1].trim();
  return s.replace(/^是[，,。]?\s*/, '').replace(/.*担任过的职务\s*[：:]?/, '').trim();
}

// 家庭结构归一到 students.family_structure 的取值
export function normalizeFamily(v: string): string {
  const s = v.trim();
  if (s.includes('双亲')) return '双亲';
  if (s.includes('单亲')) return '单亲';
  if (s.includes('留守')) return '留守';
  if (s.includes('离异')) return '离异';
  if (!s || s === '无') return '';
  return '其他';
}

export interface SurveyProfile {
  name: string;
  gender: string;
  classNameHint: string; // 「1班」→ 提示用，不写入学生字段
  birthday: string;      // 优先身份证号，其次出生年月（日缺省 01）
  birthdayFromId: boolean;
  idMasked: string;      // 仅用于导入预览；绝不入库
  primarySchool: string;
  healthNotes: string;   // 7 + 8
  guardian1: { relation: string; phone: string };
  guardian2: { relation: string; phone: string };
  familyStructure: string;
  pickup: string;
  address: string;
  pastDuty: string;      // 10 提取的职务
  answers: Record<string, string>; // 题号 → 原始作答（第 5 题丢弃不入库）
  warnings: string[];
}

// 题号 → 原始作答（同一题占多列时用「|」连接，如出生年月「2013|9」）
export function parseSurveyRow(q: Record<number, string>): SurveyProfile | null {
  const get = (no: number) => (q[no] ?? '').trim();
  const name = get(1);
  if (!name) return null;

  const warnings: string[] = [];
  const genderRaw = get(2);
  const gender = genderRaw === '男' ? '男' : genderRaw === '女' ? '女' : '';
  const id = get(5);

  let birthday = birthdayFromIdCard(id);
  const birthdayFromId = Boolean(birthday);
  if (!birthday) {
    const raw = get(4);
    const parts = raw.split('|').map((s) => s.replace(/[年月日\s]/g, '').trim()).filter(Boolean);
    if (parts.length >= 2 && /^\d{4}$/.test(parts[0]) && Number(parts[1]) >= 1 && Number(parts[1]) <= 12) {
      birthday = `${parts[0]}-${parts[1].padStart(2, '0')}-01`;
    } else {
      const m = raw.match(/(\d{4})\s*[\/\-.年]\s*(\d{1,2})/);
      if (m) birthday = `${m[1]}-${m[2].padStart(2, '0')}-01`;
    }
  }

  if (id && !ID_RE.test(id)) warnings.push('身份证号格式异常（仅校验，不入库）');
  if (!gender) warnings.push('性别未识别');
  if (id && gender && genderFromIdCard(id) && genderFromIdCard(id) !== gender)
    warnings.push('身份证性别与填写性别不一致');
  if (!birthday) warnings.push('出生日期缺失');

  const g1 = parseGuardian(get(15));
  const g2 = parseGuardian(get(16));
  if (get(15) && get(15) !== '无' && !g1.phone) warnings.push('监护人1电话未识别');
  if (get(16) && get(16) !== '无' && !g2.phone) warnings.push('监护人2电话未识别');

  const healthParts = [get(7), get(8)].filter((s) => s && s !== '无' && s !== '/');
  const healthNotes = healthParts
    .map((s, i) => `${i === 0 ? '特殊体质/过敏' : '既往病史'}：${s}`)
    .join('；');

  // 作答明细（身份证号丢弃，不入库）
  const answers: Record<string, string> = {};
  for (const [noStr, v] of Object.entries(q)) {
    const no = Number(noStr);
    if (SURVEY_QUESTIONS.find((x) => x.no === no)?.noStore) continue;
    answers[noStr] = (v ?? '').trim();
  }

  return {
    name,
    gender,
    classNameHint: get(3),
    birthday,
    birthdayFromId,
    idMasked: id ? maskIdCard(id) : '',
    primarySchool: get(6),
    healthNotes,
    guardian1: g1,
    guardian2: g2,
    familyStructure: normalizeFamily(get(13)),
    pickup: get(14),
    address: get(17),
    pastDuty: parseLeaderDuty(get(10)),
    answers,
    warnings,
  };
}
