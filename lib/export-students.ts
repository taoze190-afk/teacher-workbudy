// 学生档案导出：把档案（基本信息 + 新生调查表 + 重点学生汇总台账 + 自写条目）导成一张 Excel
//   · 一行一名学生，一列一个字段，方便筛选、排序、交给学校存档
//   · 调查表按题目名做列名；身份证号这类「解析用但不入库」的题目天然不会出现
//   · 隐私：数据只在本机浏览器中，导出由本机已登录账号发起
import * as XLSX from 'xlsx';
import { getSupabase } from '@/lib/supabase';
import { SURVEY_QUESTIONS } from '@/lib/survey';
import { compareStudentNo, formatDate, today } from '@/lib/utils';
import type { FocusSummaryNote, Student } from '@/lib/types';

export type ExportFormat = 'detail' | 'school';

export interface ClassInfo {
  name?: string;
  grade?: string | null;
  term?: string | null;
  school_year?: string | null;
}

export interface ExportProfilesOptions {
  classId: string;
  className?: string;
  /** 班级信息：学校格式要用到年级/届/班级号 */
  classInfo?: ClassInfo;
  /** 要导出的学生（通常是列表当前筛选结果） */
  students: Student[];
  /** detail = 详细版（全部字段）；school = 学校学生档案表格式（固定 9 列） */
  format?: ExportFormat;
  includeSurvey?: boolean;
  includeFocus?: boolean;
  includeCustom?: boolean;
}

export interface ExportProfilesResult {
  rows: number;
  cols: number;
  fileName: string;
  focusCount: number;
}

/** 多值合并成一个单元格：用全角竖线分隔，避免依赖 Excel 的自动换行 */
const joinParts = (parts: string[]) => parts.filter(Boolean).join(' ｜ ');

const CN_NUM: Record<string, string> = {
  一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10',
};

/** 从班级名里取班级号：「初一4班」→ 4，「初一 一班」→ 1 */
export function classNumberOf(name?: string | null): string {
  const s = (name ?? '').trim();
  const arabic = s.match(/(\d+)\s*班/);
  if (arabic) return arabic[1];
  const cn = s.match(/([一二三四五六七八九十]+)\s*班/);
  if (cn) return CN_NUM[cn[1]] ?? cn[1];
  return s;
}

/** 入学届别：「2025秋」/「2025-2026」→ 2025级 */
export function entryYearOf(info?: ClassInfo): string {
  const raw = (info?.term ?? '').match(/^(\d{4})/)?.[1] ?? (info?.school_year ?? '').match(/^(\d{4})/)?.[1];
  return raw ? `${raw}级` : '';
}

export async function exportStudentProfiles(opts: ExportProfilesOptions): Promise<ExportProfilesResult> {
  const { classId, className = '', students } = opts;
  const includeSurvey = opts.includeSurvey ?? true;
  const includeFocus = opts.includeFocus ?? true;
  const includeCustom = opts.includeCustom ?? true;

  // 重点关注台账（与「重点学生汇总」同一张表，按姓名关联）
  let focusByStudent: Record<string, FocusSummaryNote[]> = {};
  if (includeFocus) {
    const { data } = await getSupabase()
      .from('focus_summary_notes')
      .select('*')
      .eq('class_id', classId)
      .order('created_at');
    for (const n of (data ?? []) as FocusSummaryNote[]) {
      (focusByStudent[n.student_name] ??= []).push(n);
    }
  }

  const surveyQuestions = SURVEY_QUESTIONS.filter((q) => !q.noStore);
  const sorted = [...students].sort((a, b) => compareStudentNo(a.student_no, b.student_no));
  const info = opts.classInfo;

  /* ---------- 学校学生档案表格式：固定 9 列，顺序与学校表格一致 ---------- */
  if ((opts.format ?? 'detail') === 'school') {
    const schoolHeaders = ['姓名', '家长手机号', '身份证号', '性别', '民族', '级', '年级', '班级', '出生日期'];
    const schoolRows: (string | number)[][] = [schoolHeaders];
    for (const s of sorted) {
      schoolRows.push([
        s.name,
        s.guardian_phone || s.guardian2_phone || '',
        // 身份证号按隐私设计不入库（调查表解析后立即丢弃），这里留空，由学籍系统补齐
        '',
        s.gender ?? '',
        s.ethnicity ?? '',
        entryYearOf(info),
        info?.grade ?? '',
        classNumberOf(info?.name ?? className),
        s.birthday ? formatDate(s.birthday) : '',
      ]);
    }
    const wsSchool = XLSX.utils.aoa_to_sheet(schoolRows);
    wsSchool['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 22 }, { wch: 6 }, { wch: 10 },
      { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 14 },
    ];
    const wbSchool = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbSchool, wsSchool, '学生档案');
    const schoolFile = `学生档案-${className || '本班'}-${today()}.xlsx`;
    XLSX.writeFile(wbSchool, schoolFile);
    return { rows: sorted.length, cols: schoolHeaders.length, fileName: schoolFile, focusCount: 0 };
  }

  const headers: string[] = [
    '学号',
    '姓名',
    '性别',
    '民族',
    '生日',
    '年龄',
    '家庭结构',
    '住校',
    '毕业小学',
    '入学成绩',
    '住址',
    '监护人',
    '关系',
    '监护人电话',
    '第二监护人',
    '第二电话',
    '主要接送人',
    '健康备注',
    '关注级别',
    '关注原因',
    '备注',
  ];
  if (includeCustom) headers.push('自写条目（基本信息）');
  if (includeSurvey) headers.push(...surveyQuestions.map((q) => q.label));
  if (includeCustom) headers.push('自写题目（调查表）');
  if (includeFocus) headers.push('关注台账条数', '重点关注（汇总台账）');

  const ageOf = (birthday?: string | null): string => {
    if (!birthday) return '';
    const b = new Date(birthday);
    if (isNaN(b.getTime())) return '';
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
    return age >= 0 && age < 30 ? String(age) : '';
  };

  const rows: (string | number)[][] = [headers];
  for (const s of sorted) {
    const survey = (s.survey ?? {}) as Record<string, string>;
    const custom = s.custom_fields ?? [];
    const row: (string | number)[] = [
      s.student_no,
      s.name,
      s.gender ?? '',
      s.ethnicity ?? '',
      s.birthday ? formatDate(s.birthday) : '',
      ageOf(s.birthday),
      s.family_structure ?? '',
      s.is_boarding ? '是' : '否',
      s.primary_school ?? '',
      s.entrance_score ?? '',
      s.address ?? '',
      s.guardian_name ?? '',
      s.guardian_relation ?? '',
      s.guardian_phone ?? '',
      s.guardian2_name ?? '',
      s.guardian2_phone ?? '',
      s.pickup_person ?? '',
      s.health_notes ?? '',
      s.special_level === '无' ? '普通' : `重点关注（${s.special_level}）`,
      s.special_reason ?? '',
      s.notes ?? '',
    ];
    if (includeCustom) {
      row.push(
        joinParts(
          custom.filter((c) => c.section === 'basic' && (c.label || c.value)).map((c) => `${c.label}：${c.value}`)
        )
      );
    }
    if (includeSurvey) {
      for (const q of surveyQuestions) row.push(survey[String(q.no)] ?? '');
    }
    if (includeCustom) {
      row.push(
        joinParts(
          custom.filter((c) => c.section === 'survey' && (c.label || c.value)).map((c) => `${c.label}：${c.value}`)
        )
      );
    }
    if (includeFocus) {
      const notes = focusByStudent[s.name] ?? [];
      row.push(notes.length);
      row.push(
        joinParts(
          notes.map((n) => `【${n.category}】${n.detail ?? ''}${n.advice ? `（建议：${n.advice}）` : ''}`)
        )
      );
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 列宽：基本信息窄一点，长文本列（住址/备注/调查表/台账）给宽一些
  const wideCols = new Set(['住址', '健康备注', '备注', '重点关注（汇总台账）', '自写条目（基本信息）', '自写题目（调查表）']);
  ws['!cols'] = headers.map((h) => ({ wch: wideCols.has(h) ? 28 : includeSurvey && h.length > 6 ? 18 : 12 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '学生档案');

  const fileName = `学生档案（详细版）-${className || '本班'}-${today()}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rows: sorted.length, cols: headers.length, fileName, focusCount: Object.keys(focusByStudent).length };
}
