// 导入引擎：学生名单 / 成绩宽表 / 新生调查表 的解析与写入（导入中心与各页面共用）
import * as XLSX from 'xlsx';
import { getSupabase, audit } from '@/lib/supabase';
import {
  parseSurveyRow,
  type SurveyProfile,
} from '@/lib/survey';

export type ImportType = 'students' | 'grades' | 'survey';

export interface RowError {
  row: number;
  field: string;
  reason: string;
}

export interface ParsedRow {
  row: number;
  values: Record<string, string>;
  errors: RowError[];
  /** 不阻断导入的提醒（如个别分数写法异常），仍会导入该行其余科目 */
  warnings?: RowError[];
}

export const NON_SUBJECT_HEADERS = [
  '学号',
  '学籍号',
  '编号',
  '学生编号',
  '姓名',
  '学生姓名',
  '名字',
  '序号',
  '名次',
  '总分',
  '排名',
];

// 非科目列识别：学校系统导出的成绩表常带「班级 / 总分 / 班级排名 / 年级排名 / 等级 / 备注」等列，
// 这些列若被当成科目，会写进不存在的科目里（界面永远看不到，还污染数据），因此这里用
// 「包含」匹配而非精确匹配：只要列名里出现下列任一词，就不作为科目列。
const NON_SUBJECT_KEYWORDS = [
  ...NON_SUBJECT_HEADERS,
  '考号',
  '准考证',
  '座号',
  '座位',
  '考场',
  '试室',
  '班级',
  '校区',
  '学校',
  '年级',
  '学部',
  '总成绩',
  '总得分',
  '平均分',
  '均分',
  '得分率',
  '等级',
  '评级',
  '评价',
  '评语',
  '注释',
  '备注',
  '说明',
  '小结',
  '教师',
  '老师',
  '班主任',
  '任课',
  '性别',
  '出生',
  '家长',
  '电话',
  '学籍',
];

/** 去掉列名里的括号补充与「分数/成绩」后缀：「语文（120）」→「语文」 */
export function normalizeSubjectHeader(h: string): string {
  return String(h ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\u3000]/g, '')
    .replace(/(分数|成绩|得分|分值|卷面)$/g, '')
    .trim();
}

/** 该列是否不是科目列（学号/排名/等级/备注等） */
export function isNonSubjectColumn(h: string): boolean {
  const raw = String(h ?? '').replace(/[\s\u3000]/g, '');
  if (!raw) return true;
  const norm = normalizeSubjectHeader(h);
  return NON_SUBJECT_KEYWORDS.some((k) => raw.includes(k) || norm.includes(k));
}

/** 「88分」「93.5」「９３」→ 数字；无法识别返回 null */
function parseScoreValue(raw: string): number | null {
  const s = String(raw ?? '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)))
    .replace(/(分|点)$/g, '')
    .replace(/[%％]$/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** 视为缺考的写法（is_absent = true） */
const ABSENT_WORDS = ['缺考', '请假', '缓考', '未考', '免考', '弃考', '未参加', '未考勤', '／', 'x'];
/** 视为「本次无此项」的写法（不写入该科，也不算错误） */
const BLANK_WORDS = ['—', '–', '-', '－', '/', '\\', '无', '空', '暂无', 'n/a', 'na', 'null'];

export type ScoreCellKind = 'absent' | 'blank' | 'score' | 'bad';

/** 判断成绩单元格属于哪种情况（缺考 / 空 / 正常分数 / 无法识别） */
export function classifyScoreCell(raw: string): { kind: ScoreCellKind; score: number | null } {
  const v = String(raw ?? '').trim();
  if (v === '') return { kind: 'blank', score: null };
  if (ABSENT_WORDS.includes(v.toLowerCase())) return { kind: 'absent', score: null };
  if (BLANK_WORDS.includes(v.toLowerCase())) return { kind: 'blank', score: null };
  const n = parseScoreValue(v);
  if (n === null) return { kind: 'bad', score: null };
  return { kind: 'score', score: n };
}

// 成绩表末尾常见「班级平均分 / 年级平均分 / 合计 / 最高分」等汇总行。
// 若不跳过，这些行会被当成学生姓名自动建档 —— 名单里凭空多出「班级平均分」这样的假学生，
// 该行的平均分还会被写成这些"学生"的成绩，进而污染班级均分与排名。
const SUMMARY_ROW_KEYWORDS = [
  '平均',
  '合计',
  '总计',
  '小计',
  '最高',
  '最低',
  '及格率',
  '优秀率',
  '班级',
  '年级',
  '全校',
  '全班',
  '全体',
  '统计',
  '汇总',
  '任课',
  '教师',
  '制表',
  '备注',
];

export function isSummaryRowName(name: string): boolean {
  const n = String(name ?? '').replace(/[\s\u3000]/g, '');
  if (!n) return false;
  return SUMMARY_ROW_KEYWORDS.some((k) => n.includes(k));
}

/** 姓名匹配键：去掉半角/全角空格。文件侧与数据库侧必须用同一个函数，
 *  否则库里「李 明」与文件里「李明」会被当成两个人，凭空重复建档。 */
export function nameKey(name: string): string {
  return String(name ?? '').replace(/[\s\u3000]/g, '');
}

// students.family_structure 在数据库上有 CHECK 约束，只允许这几个值。
// PostgreSQL 的 CHECK 违反会让整批插入回滚 —— 名单里只要有一行写了「三代同堂」，
// 整个班的学生都导不进来。所以这里统一归一化，非法写法归入「其他」并提醒老师。
export const FAMILY_STRUCTURES = ['双亲', '单亲', '留守', '离异', '其他'];

export function normalizeFamilyStructure(v: string): { value: string | null; adjusted: boolean } {
  const s = String(v ?? '').trim();
  if (!s) return { value: null, adjusted: false };
  if (FAMILY_STRUCTURES.includes(s)) return { value: s, adjusted: false };
  const contains = FAMILY_STRUCTURES.find((x) => x !== '其他' && s.includes(x));
  if (contains) return { value: contains, adjusted: true };
  return { value: '其他', adjusted: true };
}

function normalizeGender(v: string): string {
  if (['男', '男生', 'M', 'm', '1'].includes(v.trim())) return '男';
  if (['女', '女生', 'F', 'f', '0'].includes(v.trim())) return '女';
  return '';
}

function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return '';
  // 支持 2013-02-03 / 2013/2/3 / 2013.2.3 / 2013年2月3日
  const m = s.match(/^(\d{4})\s*[\/\-\.年]\s*(\d{1,2})\s*[\/\-\.月]\s*(\d{1,2})\s*日?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // 用本地时间格式化：toISOString() 会按 UTC 输出，东八区下 "2013/2/3" 会被算成 2 月 2 日
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return '';
}

/** 找表头行：扫描前 20 行，按「像不像表头」打分取最高分（兼容表头前有多行标题的学校表格） */
function findHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 20);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? '').trim());
    const filled = cells.filter((c) => c !== '');
    if (filled.length < 2) continue;
    let score = 0;
    const flat = cells.map((c) => c.replace(/[\s\u3000]/g, ''));
    if (flat.some((c) => ['姓名', '学生姓名', '名字'].includes(c))) score += 4;
    if (flat.some((c) => ['学号', '学籍号', '编号', '学生编号'].includes(c))) score += 2;
    score += Math.min(filled.filter((c) => !isNonSubjectColumn(c)).length, 5);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
    if (bestScore >= 7) break;
  }
  if (best >= 0) return best;
  // 退化：仍按旧规则找第一个含「学号 / 姓名」的行
  for (let i = 0; i < limit; i++) {
    const joined = (rows[i] ?? []).join('|');
    if (joined.includes('学号') || joined.includes('姓名')) return i;
  }
  return 0;
}

export const HEADER_SYNONYMS: Record<string, string[]> = {
  student_no: ['学号', '学籍号', '编号', '学生编号'],
  name: ['姓名', '学生姓名', '名字'],
  gender: ['性别'],
  ethnicity: ['民族'],
  birthday: ['生日', '出生日期', '出生年月'],
  guardian_name: ['监护人姓名', '家长姓名', '监护人', '父亲姓名', '母亲姓名'],
  guardian_phone: ['监护人电话', '家长电话', '联系电话', '手机号', '电话', '父亲电话', '母亲电话'],
  family_structure: ['家庭结构', '家庭情况'],
  address: ['住址', '家庭住址', '地址'],
  primary_school: ['毕业小学', '小学', '原学校'],
  is_boarding: ['是否住校', '住校', '住宿', '寄宿'],
  pickup_person: ['主要接送人', '接送人', '接送'],
  health_notes: ['健康备注', '健康状况', '健康情况', '疾病', '过敏', '既往病史'],
};

export function downloadTemplate(type: ImportType) {
  const ws =
    type === 'students'
      ? XLSX.utils.aoa_to_sheet([
          ['学号', '姓名', '性别', '生日', '监护人电话', '家庭结构', '毕业小学', '住址'],
          ['01', '张三', '男', '2013-09-01', '13800000000', '双亲', '育才小学', '幸福路1号'],
          ['02', '李四', '女', '2013-05-12', '13900000000', '单亲', '实验一小', ''],
        ])
      : XLSX.utils.aoa_to_sheet([
          ['姓名', '语文', '数学', '英语'],
          ['张三', '98', '85', '92'],
          ['李四', '76', '88', '79'],
        ]);
  ws['!cols'] = type === 'students' ? Array(8).fill({ wch: 14 }) : Array(4).fill({ wch: 12 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === 'students' ? '学生名单' : '成绩');
  XLSX.writeFile(wb, type === 'students' ? '学生名单模板.xlsx' : '成绩模板.xlsx');
}

export interface ParseResult {
  header: string[];
  rows: ParsedRow[];
  message?: string;
  /** 中性提示（不是错误），如"已跳过 N 行汇总行" */
  notice?: string;
  /** 成绩表专用：文件里的科目列 → 归一化后的科目名（用于与考试的科目对齐） */
  subjectMap?: { raw: string; subject: string }[];
}

export async function parseFile(type: ImportType, file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
  const hIdx = findHeaderRow(rows);
  const headerRow = rows[hIdx] ?? [];
  const header = headerRow.map((h, i) => h || `列${i + 1}`);

  if (type === 'students') {
    // 两轮匹配：先全表精确匹配，再做包含匹配。
    // 同一列只能归给一个字段：否则「监护人电话」列会被 guardian_name 的「监护人」同义词抢走，
    // 导致监护人姓名里存进一串手机号。
    const colMap: Record<string, number> = {};
    const assign = (exact: boolean) => {
      const taken = new Set(Object.values(colMap));
      headerRow.forEach((h, i) => {
        // 去掉半角/全角空格：「姓 名」也能认出是「姓名」
        const hh = String(h ?? '').replace(/[\s\u3000]/g, '');
        if (!hh || taken.has(i)) return;
        const key = Object.entries(HEADER_SYNONYMS).find(([, syns]) =>
          syns.some((x) => (exact ? hh === x : hh.includes(x)))
        )?.[0];
        if (key && colMap[key] === undefined) {
          colMap[key] = i;
          taken.add(i);
        }
      });
    };
    assign(true);
    assign(false);
    if (colMap.student_no === undefined || colMap.name === undefined) {
      return { header, rows: [], message: '未找到「学号」「姓名」列，请使用模板格式' };
    }
    const parsed: ParsedRow[] = [];
    const seen = new Map<string, number>();
    let skippedSummary = 0;
    for (let r = hIdx + 1; r < rows.length; r++) {
      const raw = rows[r];
      if (!raw.some((c) => String(c).trim() !== '')) continue;
      const values: Record<string, string> = {};
      for (const [key, ci] of Object.entries(colMap)) values[key] = String(raw[ci] ?? '').trim();
      // 名单末尾的「合计 / 班级平均分」等汇总行不是学生，直接跳过
      if (values.name && isSummaryRowName(values.name)) {
        skippedSummary++;
        continue;
      }
      const errors: RowError[] = [];
      const warnings: RowError[] = [];
      if (!values.student_no) errors.push({ row: r + 1, field: '学号', reason: '学号为空' });
      if (!values.name) errors.push({ row: r + 1, field: '姓名', reason: '姓名为空' });
      if (seen.has(values.student_no) && values.student_no) {
        errors.push({ row: r + 1, field: '学号', reason: `学号与第 ${seen.get(values.student_no)} 行重复` });
      }
      if (values.student_no) seen.set(values.student_no, r + 1);
      if (values.gender) {
        const rawGender = values.gender;
        values.gender = normalizeGender(values.gender);
        // 性别/生日/电话写得不规范时只丢这一个字段，不整行作废
        // （学号、姓名才是必填；否则一个格式错误就会让这名学生整行导不进来）
        if (!values.gender) {
          warnings.push({
            row: r + 1,
            field: '性别',
            reason: `「${rawGender}」无法识别，已留空（该行其他信息照常导入）`,
          });
        }
      }
      if (values.birthday) {
        const rawBirthday = values.birthday;
        values.birthday = normalizeDate(values.birthday);
        if (!values.birthday) {
          warnings.push({
            row: r + 1,
            field: '生日',
            reason: `「${rawBirthday}」无法识别为日期，已留空（该行其他信息照常导入）`,
          });
        }
      }
      if (values.guardian_phone && !/^1\d{10}$/.test(values.guardian_phone.replace(/[- ]/g, ''))) {
        warnings.push({
          row: r + 1,
          field: '电话',
          reason: `「${values.guardian_phone}」不是 11 位手机号，已留空（该行其他信息照常导入）`,
        });
        values.guardian_phone = '';
      }
      if (values.family_structure) {
        const rawFamily = values.family_structure;
        const fam = normalizeFamilyStructure(rawFamily);
        values.family_structure = fam.value ?? '';
        if (fam.adjusted) {
          warnings.push({
            row: r + 1,
            field: '家庭结构',
            reason: `「${rawFamily}」不是标准写法，已按「${fam.value}」保存（仅支持 双亲/单亲/留守/离异/其他）`,
          });
        }
      }
      parsed.push(
        warnings.length > 0 ? { row: r + 1, values, errors, warnings } : { row: r + 1, values, errors }
      );
    }
    return {
      header,
      rows: parsed,
      notice:
        skippedSummary > 0
          ? `已自动跳过 ${skippedSummary} 行汇总统计行（如「合计」「班级平均分」），它们不会被当成学生导入。`
          : undefined,
    };
  }

  // 成绩宽表：只按「姓名」匹配学生。学号 01 与 1 会被当成两个人导致重复建档/漏匹配，
  // 因此学号列彻底不参与匹配（有该列时仅原样显示在预览里）。
  // 科目列识别：排除「班级 / 总分 / 班级排名 / 年级排名 / 等级 / 备注」等非科目列，
  // 并把「语文（120）」这类带满分标注的列名归一化成「语文」。
  const rawSubjectCols: { raw: string; subject: string; idx: number }[] = [];
  headerRow.forEach((h, i) => {
    const hh = String(h ?? '').trim();
    if (!hh || isNonSubjectColumn(hh)) return;
    rawSubjectCols.push({ raw: hh, subject: normalizeSubjectHeader(hh) || hh, idx: i });
  });
  // 归一化后同名的科目（同表出现「语文」与「语文（120）」）只保留第一列，避免互相覆盖
  const subjectCols: { raw: string; subject: string; idx: number }[] = [];
  const seenSubject = new Set<string>();
  for (const c of rawSubjectCols) {
    if (seenSubject.has(c.subject)) continue;
    seenSubject.add(c.subject);
    subjectCols.push(c);
  }
  const noIdx = headerRow.findIndex((h) =>
    ['学号', '学籍号', '编号', '学生编号'].includes(String(h ?? '').replace(/[\s\u3000]/g, ''))
  );
  const nameIdx = headerRow.findIndex((h) =>
    ['姓名', '学生姓名', '名字'].includes(String(h ?? '').replace(/[\s\u3000]/g, ''))
  );
  if (nameIdx === -1 || subjectCols.length === 0) {
    return {
      header,
      rows: [],
      message: '未找到「姓名」列或科目列（学生只按姓名匹配，学号列会自动忽略）',
    };
  }
  const parsed: ParsedRow[] = [];
  const seenName = new Map<string, number>();
  let skippedSummary = 0;
  for (let r = hIdx + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw.some((c) => String(c).trim() !== '')) continue;
    const values: Record<string, string> = {};
    const errors: RowError[] = [];
    const warnings: RowError[] = [];
    // 姓名去掉半角/全角空格：「张子轩 」与「张子轩」视为同一人
    const nameVal = String(raw[nameIdx] ?? '')
      .trim()
      .replace(/[\s\u3000]/g, '');
    // 成绩表末尾常有「班级平均分 / 年级平均分 / 合计 / 最高分」等汇总行：
    // 必须跳过，否则会被当成姓名自动建档 —— 名单里凭空多出「班级平均分」这种假学生，
    // 该行的平均分还会被写成这些"学生"的成绩，直接污染班级均分与排名。
    if (nameVal && isSummaryRowName(nameVal)) {
      skippedSummary++;
      continue;
    }
    if (!nameVal) {
      errors.push({ row: r + 1, field: '姓名', reason: '为空' });
    } else if (seenName.has(nameVal)) {
      errors.push({ row: r + 1, field: '姓名', reason: `与第 ${seenName.get(nameVal)} 行重名，无法确定是哪位学生` });
    } else {
      seenName.set(nameVal, r + 1);
    }
    values['_key'] = nameVal;
    values['_name'] = nameVal;
    if (noIdx > -1) values['_no'] = String(raw[noIdx] ?? '').trim();
    for (const sc of subjectCols) {
      const v = String(raw[sc.idx] ?? '').trim();
      const cls = classifyScoreCell(v);
      // 关键：单科分数写错只跳过这一科，不再让整行成绩作废
      if (cls.kind === 'blank') continue;
      if (cls.kind === 'absent') {
        values[sc.raw] = '缺考';
        continue;
      }
      if (cls.kind === 'bad') {
        warnings.push({
          row: r + 1,
          field: sc.subject,
          reason: `「${v}」不是有效分数，已跳过该科（该生其他科目照常导入）`,
        });
        continue;
      }
      values[sc.raw] = String(cls.score);
    }
    parsed.push(
      warnings.length > 0 ? { row: r + 1, values, errors, warnings } : { row: r + 1, values, errors }
    );
  }
  return {
    header,
    rows: parsed,
    subjectMap: subjectCols.map((c) => ({ raw: c.raw, subject: c.subject })),
    notice:
      skippedSummary > 0
        ? `已自动跳过 ${skippedSummary} 行汇总统计行（如「班级平均分」「合计」），它们不会被当成学生导入。`
        : undefined,
  };
}

export interface ImportResult {
  ok: number;
  err: number;
  /** 成绩导入：文件里有、但本场考试没配置而被跳过的科目 */
  skippedSubjects?: string[];
  /** 成绩导入：文件里没在名单上、已自动建档的学生姓名 */
  createdStudents?: string[];
  /** 错误/提示明细（最多 50 条，供界面展示） */
  details?: { row: number; field: string; reason: string }[];
  /** 不阻断导入的提醒条数（如个别分数写法异常已跳过） */
  warnings?: number;
  /** 中性说明（如"某列已按语文导入"） */
  notes?: string[];
}

export async function runImport(
  type: ImportType,
  classId: string,
  examId: string,
  fileName: string,
  parsed: ParsedRow[],
  header: string[],
  subjectMap?: { raw: string; subject: string }[]
): Promise<ImportResult> {
  const sb = getSupabase();
  let ok = 0;
  let err = 0;
  const errorDetail: { row: number; field: string; reason: string }[] = [];
  const skippedSubjects: string[] = [];
  const createdStudents: string[] = [];
  const notes: string[] = [];
  let warningCount = 0;
  for (const row of parsed) warningCount += row.warnings?.length ?? 0;

  if (type === 'students') {
    const { data: existing, error: le } = await sb
      .from('students')
      .select('id,student_no')
      .eq('class_id', classId)
      .is('deleted_at', null);
    if (le) throw new Error(`读取现有学生失败：${le.message}`);
    const byNo = new Map<string, string>(
      (existing ?? []).map((s: any) => [String(s.student_no), String(s.id)])
    );
    const toInsert: any[] = [];
    const toUpdate: { id: string; payload: any; name: string }[] = [];
    for (const row of parsed) {
      if (row.errors.length > 0) {
        err++;
        errorDetail.push({ row: row.row, field: row.errors[0].field, reason: row.errors[0].reason });
        continue;
      }
      // 「是否住校」列的写法很多（是/住校/寄宿/Y…），统一转成布尔值
      const boarding = ['是', '住校', '住宿', '寄宿', 'true', '1', 'y', 'Y'].includes(
        String(row.values.is_boarding ?? '').trim()
      );
      const payload = {
        student_no: row.values.student_no,
        name: row.values.name,
        gender: row.values.gender || null,
        ethnicity: row.values.ethnicity || null,
        birthday: row.values.birthday || null,
        guardian_name: row.values.guardian_name || null,
        guardian_phone: row.values.guardian_phone || null,
        family_structure: row.values.family_structure || null,
        address: row.values.address || null,
        primary_school: row.values.primary_school || null,
        pickup_person: row.values.pickup_person || null,
        health_notes: row.values.health_notes || null,
        ...(row.values.is_boarding ? { is_boarding: boarding } : {}),
      };
      const id = byNo.get(row.values.student_no);
      if (id) {
        // 更新已有学生时只覆盖「文件里真的填了」的字段。
        // 之前的写法会把没填的列一并写成 null，导致重新导入一份只有姓名学号的名单时，
        // 把之前录入的电话、住址、家庭结构等全部清空。
        const patch: Record<string, string | boolean> = { name: row.values.name };
        for (const k of [
          'gender',
          'ethnicity',
          'birthday',
          'guardian_name',
          'guardian_phone',
          'family_structure',
          'address',
          'primary_school',
          'pickup_person',
          'health_notes',
        ]) {
          const v = row.values[k];
          if (v) patch[k] = v;
        }
        if (row.values.is_boarding) patch.is_boarding = boarding;
        toUpdate.push({ id, payload: patch, name: row.values.name });
      } else {
        toInsert.push({ ...payload, class_id: classId });
      }
    }
    // 批量新增：必须检查错误，否则会出现「提示导入成功、数据库里却没有」的静默失败
    if (toInsert.length > 0) {
      const { error: ie } = await sb.from('students').insert(toInsert);
      if (ie) {
        err += toInsert.length;
        errorDetail.push({ row: 0, field: '新增学生', reason: `写入失败：${ie.message}` });
      } else {
        ok += toInsert.length;
      }
    }
    // 更新（逐条，通常只有少数已有学号需要覆盖）
    for (const u of toUpdate) {
      const { error: ue } = await sb.from('students').update(u.payload).eq('id', u.id);
      if (ue) {
        err++;
        errorDetail.push({ row: 0, field: '更新学生', reason: `${u.name} 更新失败：${ue.message}` });
      } else {
        ok++;
      }
    }
  } else {
    // 成绩宽表：一次批量 upsert（不再逐格请求）。学生只按「姓名」匹配；
    // 名单里没有的姓名自动建档，学号接续本班最大号自动编（不使用导入文件里的学号）。
    const { data: existing, error: le } = await sb
      .from('students')
      .select('id,name,student_no')
      .eq('class_id', classId)
      .is('deleted_at', null);
    if (le) throw new Error(`读取现有学生失败：${le.message}`);
    const list = (existing ?? []) as any[];
    // 姓名匹配键：库里已有同名多人时记入 dupNames —— 这种情况宁可不导，
    // 也不能把成绩写到错误的学生身上（静默串号是最难发现的一类事故）。
    const byName = new Map<string, string>();
    const dupNames = new Set<string>();
    for (const s of list) {
      const k = nameKey(s.name);
      if (byName.has(k)) dupNames.add(k);
      else byName.set(k, s.id);
    }

    // 本场考试已配置的科目与满分。只写入已配置的科目：否则「班级」「总分」「年级排名」
    // 这类列会写进并不存在的科目里，界面上永远看不到，还污染数据。
    const { data: examSubs } = await sb
      .from('exam_subjects')
      .select('subject,full_score')
      .eq('exam_id', examId);
    const examSubjectMap = new Map<string, number>(
      ((examSubs ?? []) as any[]).map((s) => [s.subject, Number(s.full_score) || 100])
    );

    const cols: { raw: string; subject: string }[] = subjectMap?.length
      ? subjectMap
      : header
          .filter((h) => h && !isNonSubjectColumn(h))
          .map((h) => ({ raw: h, subject: normalizeSubjectHeader(h) || h }));

    const usable: { raw: string; subject: string; full: number }[] = [];
    for (const c of cols) {
      const full = examSubjectMap.get(c.subject);
      if (full === undefined) {
        if (!skippedSubjects.includes(c.subject)) skippedSubjects.push(c.subject);
        continue;
      }
      usable.push({ raw: c.raw, subject: c.subject, full });
    }
    // 任教班常见：从教务拷来的表只有「姓名 | 成绩」两列，列名不是具体科目名。
    // 本场考试只配置了一科时，把这个分数列直接按该科导入，否则老师根本导不进来。
    if (usable.length === 0 && examSubjectMap.size === 1 && cols.length === 1) {
      const [onlySubject, onlyFull] = [...examSubjectMap.entries()][0];
      usable.push({ raw: cols[0].raw, subject: onlySubject, full: onlyFull });
      skippedSubjects.length = 0;
      notes.push(`文件里的「${cols[0].raw}」列已按本场考试唯一的科目「${onlySubject}」导入`);
    }
    if (usable.length === 0) {
      const configured = [...examSubjectMap.keys()];
      throw new Error(
        `文件里的科目（${cols.map((c) => c.raw).join('、') || '未识别到科目列'}）在本场考试中没有配置，无法导入。` +
          `请先到「考试管理」编辑这场考试，把科目补齐（当前已配置：${configured.join('、') || '无'}）`
      );
    }

    let maxNo = list.reduce((m, s) => Math.max(m, parseInt(String(s.student_no), 10) || 0), 0);
    const toCreate: any[] = [];
    for (const row of parsed) {
      if (row.errors.length > 0) continue;
      const name = row.values['_name'];
      if (name && !byName.has(nameKey(name)) && !toCreate.some((c) => c.name === name)) {
        maxNo += 1;
        toCreate.push({
          class_id: classId,
          student_no: String(maxNo).padStart(2, '0'),
          name,
          active: true,
        });
      }
    }
    if (toCreate.length > 0) {
      const { data: created, error: ce } = await sb.from('students').insert(toCreate).select('id,name');
      if (ce) throw new Error(`自动补齐名单失败：${ce.message}`);
      for (const c of (created ?? []) as any[]) {
        byName.set(nameKey(c.name), c.id);
        createdStudents.push(c.name);
      }
    }

    const rowsToUpsert: any[] = [];
    for (const row of parsed) {
      if (row.errors.length > 0) {
        err++;
        errorDetail.push({ row: row.row, field: row.errors[0].field, reason: row.errors[0].reason });
        continue;
      }
      const key = nameKey(row.values['_name']);
      if (dupNames.has(key)) {
        err++;
        errorDetail.push({
          row: row.row,
          field: '姓名',
          reason: `本班有多个「${row.values['_name']}」，无法确定成绩属于谁，已跳过（请先到学生档案区分）`,
        });
        continue;
      }
      const sid = byName.get(key);
      if (!sid) {
        err++;
        errorDetail.push({ row: row.row, field: '姓名', reason: `「${row.values['_name']}」不在本班且无法创建` });
        continue;
      }
      let wrote = 0;
      for (const c of usable) {
        const v = row.values[c.raw];
        if (!v) continue;
        if (v === '缺考') {
          rowsToUpsert.push({
            exam_id: examId,
            class_id: classId,
            student_id: sid,
            subject: c.subject,
            score: null,
            is_absent: true,
          });
          wrote++;
          continue;
        }
        const num = Number(v);
        if (Number.isNaN(num)) continue;
        if (num < 0 || num > c.full) {
          errorDetail.push({
            row: row.row,
            field: c.subject,
            reason: `「${num}」超出 0~${c.full}，已跳过该科（如需保留请先修改本场考试的满分）`,
          });
          continue;
        }
        rowsToUpsert.push({
          exam_id: examId,
          class_id: classId,
          student_id: sid,
          subject: c.subject,
          score: num,
          is_absent: false,
        });
        wrote++;
      }
      if (wrote > 0) ok++;
      else {
        err++;
        errorDetail.push({ row: row.row, field: '整行', reason: '该行没有可导入的分数' });
      }
    }
    if (rowsToUpsert.length > 0) {
      // 分批（每批 500 行），一次性覆盖已有成绩
      for (let i = 0; i < rowsToUpsert.length; i += 500) {
        const batch = rowsToUpsert.slice(i, i + 500);
        const { error } = await sb
          .from('grade_records')
          .upsert(batch, { onConflict: 'exam_id,student_id,subject' });
        if (error) throw new Error(`成绩写入失败：${error.message}`);
      }
    }
  }

  // 导入日志：即使记录日志失败，也不能让「已成功写入的数据」被报成失败
  try {
    const { data: u } = await sb.auth.getUser();
    const uid = u?.user?.id;
    if (uid) {
      await sb.from('import_logs').insert({
        user_id: uid,
        import_type: type === 'students' ? '学生名单' : '成绩',
        file_name: fileName,
        total_rows: parsed.length,
        ok_rows: ok,
        err_rows: err,
        errors: errorDetail,
      });
    }
  } catch {
    // 忽略：导入结果本身不受影响
  }
  await audit('import', 'import', type, { ok, err });
  return {
    ok,
    err,
    skippedSubjects,
    createdStudents,
    details: errorDetail.slice(0, 50),
    warnings: warningCount,
    notes: notes.length > 0 ? notes : undefined,
  };
}

/* ---------- 新生调查表（问卷导出）导入 ----------
 * 列识别：表头以「N、」开头的列视为调查题（第 1-28 题），自动跳过序号/提交时间/
 * 来源/IP 等问卷系统列（对应 A-F 列）。隐私：身份证号仅用于提取出生日期并校验性别，
 * 解析后立即丢弃，绝不入库（见 lib/survey.ts）。
 */

export interface SurveyRow extends SurveyProfile {
  fileRow: number; // 文件中的行号（1-based，含表头偏移）
}

export interface SurveyParseResult {
  profiles: SurveyRow[];
  message?: string;
}

export async function parseSurveyFile(file: File): Promise<SurveyParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];

  // 表头行：含「1、」的行
  let hIdx = rows.findIndex((r) => r.some((c) => /^\s*1、/.test(String(c))));
  if (hIdx === -1) {
    return { profiles: [], message: '未识别到调查表表头（表头需为「1、…」「2、…」编号格式，问卷星等平台的原始导出文件可直接导入）' };
  }
  const header = rows[hIdx] ?? [];
  const noCols: Record<number, number[]> = {};
  header.forEach((h, i) => {
    const m = String(h).trim().match(/^(\d+)、/);
    if (m) (noCols[Number(m[1])] = noCols[Number(m[1])] ?? []).push(i);
  });
  if (Object.keys(noCols).length < 10) {
    return { profiles: [], message: `题目列仅识别到 ${Object.keys(noCols).length} 个，请确认上传的是调查表原始导出文件` };
  }

  const profiles: SurveyRow[] = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw.some((c) => String(c).trim() !== '')) continue;
    const q: Record<number, string> = {};
    for (const [no, cols] of Object.entries(noCols)) {
      q[Number(no)] = cols.map((c) => String(raw[c] ?? '').trim()).join('|');
    }
    const p = parseSurveyRow(q);
    if (p) profiles.push({ ...p, fileRow: r + 1 });
  }
  if (profiles.length === 0) return { profiles: [], message: '文件中没有可识别的学生作答行' };
  return { profiles };
}

export interface SurveyImportResult {
  created: number;
  updated: number;
  err: number;
}

export async function runSurveyImport(
  classId: string,
  fileName: string,
  profiles: SurveyRow[]
): Promise<SurveyImportResult> {
  const sb = getSupabase();
  let created = 0;
  let updated = 0;
  let err = 0;
  const errorDetail: { row: number; field: string; reason: string }[] = [];

  const { data: existing } = await sb
    .from('students')
    .select('id,name,student_no')
    .eq('class_id', classId)
    .is('deleted_at', null);
  const byName = new Map<string, { id: string }>(
    ((existing ?? []) as any[]).map((s) => [s.name as string, { id: s.id as string }])
  );
  let nextNo =
    Math.max(0, ...((existing ?? []) as any[]).map((s) => Number(s.student_no) || 0)) + 1;

  for (const p of profiles) {
    // 结构化字段 + 全量作答（survey jsonb；身份证号已在解析时丢弃）
    const payload: Record<string, unknown> = {
      name: p.name,
      gender: p.gender || null,
      birthday: p.birthday || null,
      primary_school: p.primarySchool || null,
      health_notes: p.healthNotes || null,
      family_structure: p.familyStructure || null,
      pickup_person: p.pickup || null,
      guardian_relation: p.guardian1.relation || null,
      guardian_phone: p.guardian1.phone || null,
      guardian2_relation: p.guardian2.relation || null,
      guardian2_phone: p.guardian2.phone || null,
      address: p.address || null,
      survey: p.answers,
    };
    try {
      const found = byName.get(p.name);
      if (found) {
        // 按姓名幂等更新：已在本班的学生补全/覆盖档案字段与调查作答
        const { error } = await sb.from('students').update(payload).eq('id', found.id);
        if (error) throw error;
        updated++;
      } else {
        const studentNo = String(nextNo++).padStart(2, '0');
        const { data, error } = await sb
          .from('students')
          .insert({ ...payload, class_id: classId, student_no: studentNo, tags: [], active: true })
          .select('id')
          .single();
        if (error) throw error;
        byName.set(p.name, { id: (data as any).id });
        created++;
      }
    } catch (e) {
      err++;
      errorDetail.push({ row: p.fileRow, field: p.name, reason: (e as Error).message });
    }
  }

  // 与 runImport 保持一致：日志写入失败不能影响导入结果（学生数据此时已经写完），
  // 也不能用 u!.user!.id —— 会话过期时 getUser() 返回 null，会抛 TypeError
  // 让老师看到"导入失败"，而数据其实已经入库，从而导致重复导入。
  try {
    const { data: u } = await sb.auth.getUser();
    const uid = u?.user?.id;
    if (uid) {
      await sb.from('import_logs').insert({
        user_id: uid,
        // import_logs.import_type 有 CHECK 白名单（学生名单/成绩/座位表/家长信息/考勤），
        // 写「新生调查表」会违反约束、日志永远存不进去
        import_type: '家长信息',
        file_name: fileName,
        total_rows: profiles.length,
        ok_rows: created + updated,
        err_rows: err,
        errors: errorDetail,
      });
    }
  } catch {
    // 忽略
  }
  await audit('import', 'survey', classId, { created, updated, err });
  return { created, updated, err };
}
