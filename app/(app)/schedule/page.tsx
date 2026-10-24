'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Download, Printer, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { SchoolClass, ScheduleEntry } from '@/lib/types';
import { Badge, Button, Card, CardTitle, ErrorBox, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { cn } from '@/lib/utils';

// 星期标签（按 weekday 索引取用）；实际显示哪几天由 visibleWeekdays 动态决定
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// 蜀城中学课时结构：早自习 + 上午第1~5节 + 下午第6~9节 + 晚自习两节
const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);
const PERIOD_LABEL: Record<number, string> = {
  1: '早自习',
  2: '第1节',
  3: '第2节',
  4: '第3节',
  5: '第4节',
  6: '第5节',
  7: '第6节',
  8: '第7节',
  9: '第8节',
  10: '第9节',
  11: '晚自习一',
  12: '晚自习二',
};

function periodOf(label: string): number | null {
  const s = label.trim();
  if (/早自习|早读/.test(s)) return 1;
  // 「自习第2节」这类晚自习行 → 晚自习一/二
  const zt = s.match(/自习第(\d)节/);
  if (zt) return Number(zt[1]) <= 2 ? 10 + Number(zt[1]) : null; // 自习第1节=11? 注意：晚自习一=11
  if (/晚自习一|晚自习1|晚自习第一节/.test(s)) return 11;
  if (/晚自习二|晚自习2|晚自习第二节/.test(s)) return 12;
  if (/晚自习/.test(s)) return 11;
  const m = s.match(/^(?:第)?(\d{1,2})节$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return n + 1; // 第1节=period 2 … 第9节=period 10
  }
  return null;
}

function parseSchedule(rows: string[][]) {
  // 1. 表头行：含 3 个以上「周X / 星期X」单元格（班名可能嵌在表头，如「初一1班 星期五」）
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].filter((c) => /周[一二三四五六日]|星期[一二三四五六日]/.test(String(c).trim())).length >= 3) {
      hIdx = i;
      break;
    }
  }
  if (hIdx === -1) return { ok: false as const, msg: '未找到表头（应包含 周一 ~ 周六 列）' };

  // 2. 按出现顺序收集星期列（列上可能有班名前缀，只取周几）
  const header = rows[hIdx].map((c) => String(c).trim());
  const weekdayCols: { index: number; weekday: number }[] = [];
  header.forEach((h, ci) => {
    const m = h.match(/[周|星期]([一二三四五六日])/);
    if (m) weekdayCols.push({ index: ci, weekday: '一二三四五六日'.indexOf(m[1]) + 1 });
  });
  // 去重（同一列不会重复），按列序排列
  const seen = new Set<number>();
  const wds = weekdayCols.filter((w) => (seen.has(w.weekday) ? false : (seen.add(w.weekday), true)));
  if (wds.length < 3) return { ok: false as const, msg: '表头至少需要 3 个星期列（周一~周六）' };

  // 从表头提取班名（如「初一1班」）
  const classHint = header.find((h) => /初一|初二|初三|高[一二三]/.test(h))?.match(/(初一|初二|初三|高[一二三])?\s*\d+班/)?.[0] ?? '';

  // 3. 科目清洗 + 教师提取：如「语文 （刘晓燕)」→ 科目「语文」、教师「刘晓燕」
  const cleanSubject = (v: string) => {
    const beforeParen = v.replace(/\s+/g, '').split(/[（(]/)[0];
    return beforeParen.trim();
  };
  const extractTeacher = (v: string) => {
    const groups = [...v.matchAll(/[（(]([^）)]{1,12})[）)]?/g)].map((m) => m[1].trim());
    return groups.length ? groups[groups.length - 1] : '';
  };

  // 4. 数据行：找到「第N节 / 早自习 / 晚自习」单元格，其后依次是各星期列的科目
  const entries: { weekday: number; period: number; subject: string; teacher: string }[] = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const cells = rows[r].map((c) => String(c).replace(/\s+/g, '').trim());
    if (!cells.some(Boolean)) continue;
    // 找节次单元格索引
    let pi = -1;
    let period: number | null = null;
    for (let ci = 0; ci < cells.length; ci++) {
      const p = periodOf(cells[ci]);
      if (p != null) {
        pi = ci;
        period = p;
        break;
      }
    }
    if (pi === -1 || period == null) continue; // 早读/午餐/升旗等非上课行自动跳过
    // 节次单元格之后的单元格依次对应星期列（部分表有「上 午」分段列在节次之前，不影响）
    // 用表头里记录的真实列索引取值，而不是按「节次列之后第 k 格」推算：
    // 课表里一旦有空列、多出的分段列（上午/下午）或列顺序不同，推算就会整体错位，
    // 导致部分格子取空或取串 —— 这正是「有些课没显示出来」的原因。
    wds.forEach((w) => {
      const raw = cells[w.index] ?? '';
      const subject = cleanSubject(raw);
      if (!subject || ['-', '/', '—', '无'].includes(subject)) return;
      entries.push({ weekday: w.weekday, period, subject, teacher: extractTeacher(raw) });
    });
  }
  if (entries.length === 0) return { ok: false as const, msg: '没有解析到有效课程（请确认节次列和科目单元格）' };
  return { ok: true as const, entries, classHint };
}

// 崇州市蜀城中学作息时间表（秋季）——按学校发布的表格转录，供参考
const SCHOOL_TIMETABLE: {
  section?: string;
  item: string;
  mon: string;
  tueFri: string;
  sat: string;
  note?: string;
}[] = [
  { section: '早间', item: '起床', mon: '6:40', tueFri: '', sat: '' },
  { item: '早餐', mon: '6:50-7:30', tueFri: '', sat: '' },
  { item: '早读', mon: '7:30-7:50', tueFri: '', sat: '' },
  { section: '上午', item: '升旗仪式', mon: '7:50-8:20', tueFri: '无', sat: '' },
  { item: '第1节', mon: '8:20-9:00', tueFri: '8:00-8:35', sat: '第二节 8:10-8:50' },
  { item: '第2节', mon: '9:10-9:50', tueFri: '8:45-9:25', sat: '' },
  { item: '大课间', mon: '无', tueFri: '9:25-10:00', sat: '第三节 9:00-9:40' },
  { item: '第3节', mon: '10:00-10:40', tueFri: '', sat: '第四节 9:50-10:30' },
  { item: '第4节', mon: '10:50-11:30', tueFri: '', sat: '第五节 10:40-11:20' },
  { item: '第5节', mon: '11:40-12:10 第一轮 / 11:40-12:25 第二轮', tueFri: '', sat: '第六节 11:30-12:10', note: '错时就餐' },
  { section: '午间', item: '午餐', mon: '12:15-13:00', tueFri: '', sat: '12:10-13:00' },
  { item: '午休', mon: '13:00-14:00', tueFri: '', sat: '13:00-14:00' },
  { section: '下午', item: '课前十分钟', mon: '14:00-14:10', tueFri: '', sat: '14:00-14:10' },
  { item: '眼保健操', mon: '14:10-14:15', tueFri: '', sat: '' },
  { item: '第6节', mon: '14:15-14:55', tueFri: '', sat: '第七节 14:10-14:50' },
  { item: '第7节', mon: '15:05-15:45', tueFri: '', sat: '第八节 15:00-15:40' },
  { item: '第8节', mon: '15:55-16:35', tueFri: '', sat: '' },
  { item: '第9节', mon: '16:45-17:20 第一轮 / 16:45-17:30 第二轮', tueFri: '', sat: '', note: '错时就餐' },
  { item: '活动、晚餐', mon: '17:20-18:00', tueFri: '', sat: '' },
  { section: '晚间', item: '时事学习', mon: '18:00-18:20', tueFri: '', sat: '' },
  { item: '自习第1节', mon: '18:20-19:00', tueFri: '', sat: '' },
  { item: '自习第2节', mon: '19:10-19:50', tueFri: '', sat: '19:50 初中通校生放学' },
  { item: '自习第3节', mon: '20:00-20:40', tueFri: '', sat: '' },
  { item: '自习第4节', mon: '20:50-21:50', tueFri: '', sat: '21:30 高一高二通校生放学' },
  { item: '宿舍关大门', mon: '22:05', tueFri: '', sat: '' },
  { item: '熄灯就寝', mon: '22:15', tueFri: '', sat: '' },
];

export default function SchedulePage() {
  const { currentClassId, classes, currentClass, refresh } = useClass();
  const toast = useToast();
  const [clsId, setClsId] = useState(currentClassId);
  const [grid, setGrid] = useState<Record<string, { subject: string; teacher: string }>>({});
  const [allClasses, setAllClasses] = useState<SchoolClass[]>([]);
  const [otherGrids, setOtherGrids] = useState<Record<string, Record<string, { subject: string; teacher: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // 导入弹窗状态
  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [parsed, setParsed] = useState<{ weekday: number; period: number; subject: string; teacher: string }[] | null>(null);
  const [teacherInput, setTeacherInput] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('bzh_teacher_name') ?? '' : ''));
  // 课表格子编辑：编辑键 = 「weekday-period」，空值=新增
  const [editingCell, setEditingCell] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editTeacher, setEditTeacher] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentClassId) setClsId(currentClassId);
  }, [currentClassId]);

  const editingClass = classes.find((c) => c.id === clsId) ?? null;

  useEffect(() => {
    if (!clsId) return;
    setLoading(true);
    getSupabase()
      .from('schedule_entries')
      .select('*')
      .eq('class_id', clsId)
      .then(({ data }) => {
        const g: Record<string, { subject: string; teacher: string }> = {};
        for (const e of (data ?? []) as ScheduleEntry[]) {
          g[`${e.weekday}-${e.period}`] = { subject: e.subject ?? '', teacher: (e as any).teacher ?? '' };
        }
        setGrid(g);
        setLoading(false);
      });
  }, [clsId, tick]);

  // 所有班级课表（语文教学视图）
  useEffect(() => {
    if (!clsId) return;
    const sb = getSupabase();
    (async () => {
      const { data: cls } = await sb.from('school_classes').select('*').eq('archived', false);
      const list = (cls ?? []) as SchoolClass[];
      setAllClasses(list);
      const gs: Record<string, Record<string, { subject: string; teacher: string }>> = {};
      for (const c of list) {
        const { data: entries } = await sb.from('schedule_entries').select('*').eq('class_id', c.id);
        const g: Record<string, { subject: string; teacher: string }> = {};
        for (const e of (entries ?? []) as ScheduleEntry[]) {
          g[`${e.weekday}-${e.period}`] = { subject: e.subject ?? '', teacher: (e as any).teacher ?? '' };
        }
        gs[c.id] = g;
      }
      setOtherGrids(gs);
    })();
  }, [clsId, tick]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['节次', '周一', '周二', '周三', '周四', '周五'],
      ['早自习', '语文（刘晓燕）', '数学', '英语', '', ''],
      ['第1节', '数学', '语文（刘晓燕）', '', '', ''],
      ['第2节', '', '', '数学', '语文（刘晓燕）', ''],
      ['第3节', '英语', '', '', '', '数学'],
      ['第4节', '', '英语', '语文（刘晓燕）', '', ''],
      ['第5节', '语文（刘晓燕）', '', '', '数学', ''],
      ['第6节', '', '数学', '', '英语', '语文（刘晓燕）'],
      ['第7节', '', '', '英语', '', ''],
      ['晚自习一', '语文（刘晓燕）', '', '', '', ''],
      ['晚自习二', '', '', '', '', ''],
    ]);
    ws['!cols'] = [{ wch: 10 }, ...Array(5).fill({ wch: 16 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '课表');
    XLSX.writeFile(wb, '课表导入模板.xlsx');
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setImportMsg('');
    setParsed(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
      const res = parseSchedule(rows);
      if (!res.ok) {
        setImportMsg(res.msg);
        return;
      }
      setParsed(res.entries);
    } catch (e) {
      setImportMsg('文件解析失败：' + (e as Error).message);
    }
  };

  const doImport = async () => {
    if (!clsId || !parsed) return;
    setImporting(true);
    const sb = getSupabase();
    await sb.from('schedule_entries').delete().eq('class_id', clsId);
    // 完整课表全量入库（含每节课的任课教师）；「我的课」按教师姓名在前端筛选
    const rows = parsed.map((e) => ({ class_id: clsId, weekday: e.weekday, period: e.period, subject: e.subject, teacher: e.teacher || null }));
    const { error } = await sb.from('schedule_entries').insert(rows);
    if (error) {
      setImportMsg('导入失败：' + error.message);
      setImporting(false);
      return;
    }
    await audit('import', 'schedule', clsId, { count: rows.length });
    setImporting(false);
    setImportOpen(false);
    setParsed(null);
    setFileName('');
    toast(`「${editingClass?.name ?? ''}」课表导入成功：${rows.length} 节课`);
    reload();
  };

  // 课表格子保存：有科目 upsert（科目+任课教师），清空则删除
  const saveCell = async (w: number, p: number, subject: string, teacher: string) => {
    const key = `${w}-${p}`;
    setEditingCell('');
    const old = grid[key];
    const sb = getSupabase();
    if (!subject.trim()) {
      if (!old) return;
      await sb.from('schedule_entries').delete().match({ class_id: clsId, weekday: w, period: p });
      const g = { ...grid };
      delete g[key];
      setGrid(g);
      toast('已清除该节课');
      return;
    }
    const t = teacher.trim();
    await sb.from('schedule_entries').upsert(
      { class_id: clsId, weekday: w, period: p, subject: subject.trim(), teacher: t || null },
      { onConflict: 'class_id,weekday,period' }
    );
    setGrid({ ...grid, [key]: { subject: subject.trim(), teacher: t } });
    toast('课表已更新');
  };

  // 我的课（所有班级 · 周一至周日全覆盖）
  // 判定规则：优先按「任课教师姓名」匹配；格子里没写教师时，若科目正好是你任教的科目
  // （任教班=该班科目，班主任班默认语文）也算你的课 ——
  // 很多教务课表只在部分格子写了教师名，只按教师名筛会漏掉课。
  const teacherName = teacherInput.trim();
  const mySubjects = currentClass?.subjects?.length ? currentClass.subjects : ['语文'];
  const myLessons: {
    weekday: number;
    period: number;
    classes: { name: string; subject: string; teacher: string; noTeacher: boolean }[];
  }[] = [];
  for (const w of ALL_WEEKDAYS) {
    for (const p of PERIODS) {
      const hits = allClasses
        .map((c) => {
          const cell = otherGrids[c.id]?.[`${w}-${p}`];
          if (!cell) return null;
          const noTeacher = !cell.teacher;
          // 双向包含 + 忽略「老师/先生」后缀：课表里写「刘晓燕老师」或只写「晓燕」都能匹配上
          const t = cell.teacher.replace(/老师|先生|女士/g, '').trim();
          const byTeacher = teacherName
            ? Boolean(t) && (t.includes(teacherName) || teacherName.includes(t))
            : false;
          const bySubject = mySubjects.includes(cell.subject);
          const mine = teacherName ? byTeacher || (noTeacher && bySubject) : bySubject;
          return mine ? { name: c.name, subject: cell.subject, teacher: cell.teacher, noTeacher } : null;
        })
        .filter(Boolean) as { name: string; subject: string; teacher: string; noTeacher: boolean }[];
      if (hits.length > 0) myLessons.push({ weekday: w, period: p, classes: hits });
    }
  }

  // 课表里出现过的所有任课教师名：用来诊断"为什么我的课没显示全"，
  // 点一下即可填入 —— 省得因为名字写法不一致（多个空格、带「老师」、错别字）而筛不出课。
  const allTeachers = (() => {
    const set = new Set<string>();
    for (const g of Object.values(otherGrids)) {
      for (const cell of Object.values(g)) {
        const t = String(cell.teacher ?? '')
          .replace(/老师|先生|女士/g, '')
          .trim();
        if (t) set.add(t);
      }
    }
    return [...set].sort();
  })();

  // 只显示"真的有课"的星期：周一至周五固定保留（方便对照），
  // 周六 / 周日仅当课表里确实有课时才出现，避免空列空行占地方。
  const visibleWeekdays = (() => {
    const days = [1, 2, 3, 4, 5];
    for (const w of [6, 7]) {
      const has = Object.values(otherGrids).some((g) =>
        Object.keys(g).some((k) => k.startsWith(`${w}-`) && g[k]?.subject)
      );
      if (has) days.push(w);
    }
    return days;
  })();

  // 课表视图：全部课程 / 只看我的课。按班级分别记住 ——
  // 任教班（只教这一科）默认只看自己的课，班主任班默认看全班完整课表。
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
  const viewStorageKey = `bzh_sched_view_${clsId}`;
  useEffect(() => {
    if (!clsId) return;
    const saved = localStorage.getItem(viewStorageKey);
    if (saved === 'all' || saved === 'mine') setViewMode(saved);
    else setViewMode(currentClass?.role === '任教' ? 'mine' : 'all');
  }, [clsId, currentClass?.role, viewStorageKey]);
  const changeView = (v: 'all' | 'mine') => {
    setViewMode(v);
    if (clsId) localStorage.setItem(viewStorageKey, v);
  };

  // 合并周课表的编辑：定位到「哪个班的哪一节」再改（合并视图一格可能对应多个班）
  const [myEdit, setMyEdit] = useState<{ classId: string; clsName: string; w: number; p: number } | null>(null);
  const [myEditSubject, setMyEditSubject] = useState('');
  const [myEditTeacher, setMyEditTeacher] = useState('');

  const saveMyCell = async () => {
    if (!myEdit) return;
    const sb = getSupabase();
    const { classId, clsName, w, p } = myEdit;
    const subject = myEditSubject.trim();
    const teacher = myEditTeacher.trim();
    if (!subject) {
      await sb.from('schedule_entries').delete().match({ class_id: classId, weekday: w, period: p });
      toast(`已删除「${clsName}」${DAYS[w - 1]}${PERIOD_LABEL[p]}的课`);
    } else {
      await sb.from('schedule_entries').upsert(
        { class_id: classId, weekday: w, period: p, subject, teacher: teacher || null },
        { onConflict: 'class_id,weekday,period' }
      );
      toast(`已更新「${clsName}」${DAYS[w - 1]}${PERIOD_LABEL[p]}`);
    }
    setMyEdit(null);
    setTick((n) => n + 1); // 重新拉取所有班级课表，合并视图随之刷新
  };

  // 只打印指定的那张表：给 body 打一个标记，CSS 据此隐藏另一张；打印结束自动清掉
  const printArea = (target: 'class' | 'mine') => {
    document.body.dataset.print = target;
    window.print();
  };
  useEffect(() => {
    const clear = () => {
      delete document.body.dataset.print;
    };
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  // 判断课表格子是否"我的课"，与下方「我的课」卡片用同一套规则，
  // 避免出现「卡片里有、表格里却没标色」的不一致。
  //   返回 'teacher'：格子写了教师名且匹配（实心蓝底 + 标注"我的课"）
  //   返回 'subject'：格子没写教师名，按科目推断（浅蓝底，颜色稍淡）
  const myMark = (cell?: { subject: string; teacher: string } | null): 'teacher' | 'subject' | null => {
    if (!cell) return null;
    const t = String(cell.teacher ?? '')
      .replace(/老师|先生|女士/g, '')
      .trim();
    if (teacherName) {
      if (t && (t.includes(teacherName) || teacherName.includes(t))) return 'teacher';
      if (!t && mySubjects.includes(cell.subject)) return 'subject';
      return null;
    }
    return mySubjects.includes(cell.subject) ? 'subject' : null;
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          emoji="🗓️"
        title="我的课表"
        subtitle="从教务课表导入 · 每节课显示科目与任课老师 · 点击格子可改"
        color={{ chip: 'bg-brand-500/15 text-brand-300', soft: 'bg-brand-500/15', text: 'text-brand-300' }}
      >
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> 导入课表
        </Button>
        </PageHeader>
      </div>

      {/* 班级切换 */}
      <Card className="no-print !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">当前班级：</span>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setClsId(c.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                clsId === c.id ? 'bg-brand-700 text-white' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              )}
            >
              {c.name}（{c.role === '班主任' ? '班主任' : '任教'}）
            </button>
          ))}
          {classes.length === 1 && (
            <span className="text-xs text-amber-300">
              💡 你教两个班的语文：再创建一个任教班（顶栏「创建班级」→ 角色选「任教」、科目只勾语文），就能分别给两个班导入课表
            </span>
          )}
        </div>
      </Card>

      {/* 课表（标准格式，只读展示） */}
      <Card className="print-area print-area--class">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-100">
            {editingClass?.name ?? ''} 课程表
            <span className="no-print text-xs font-normal text-slate-400">（由导入管理）</span>
            {teacherName && (
              <span className="no-print flex flex-wrap items-center gap-2 text-[11px] font-normal text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm bg-brand-500/20 ring-1 ring-inset ring-brand-500/40" />
                  我的课
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm bg-brand-500/10" />
                  未标教师、按科目推断
                </span>
              </span>
            )}
          </h3>
          <div className="no-print flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', '全部课程'],
                ['mine', '只看我的课'],
              ] as ['all' | 'mine', string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                  viewMode === v
                    ? 'bg-brand-500/15 font-medium text-brand-300'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-100'
                )}
              >
                {label}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={() => printArea('class')}>
              <Printer size={14} /> 打印课表
            </Button>
          </div>
        </div>
        {/* 固定列宽：点击编辑时输入框不会把整列撑宽（之前 auto 布局，一编辑列就变宽） */}
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: '4.5rem' }} />
            {visibleWeekdays.map((w) => (
              <col key={w} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-slate-700 bg-slate-800/60 p-2 text-xs">节次</th>
              {visibleWeekdays.map((w) => (
                <th
                  key={w}
                  className="border border-slate-700 bg-brand-500/15 p-2 text-xs font-medium text-brand-300"
                >
                  {DAYS[w - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              // 分隔行与课行同时渲染（此前三元替换导致第6节/晚自习一被吞掉）
              <Fragment key={p}>
                {p === 7 && (
                  <tr>
                    <td
                      colSpan={1 + visibleWeekdays.length}
                      className="border border-slate-700 bg-slate-700/60 p-1.5 text-center text-xs text-slate-400"
                    >
                      午 休（12:15-14:00）
                    </td>
                  </tr>
                )}
                {p === 11 && (
                  <tr>
                    <td
                      colSpan={1 + visibleWeekdays.length}
                      className="border border-slate-700 bg-slate-700/60 p-1.5 text-center text-xs text-slate-400"
                    >
                      晚 自 习（18:20 起）
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="border border-slate-700 bg-stone-50 p-2 text-center text-xs text-slate-500">
                    {PERIOD_LABEL[p]}
                  </td>
                  {visibleWeekdays.map((w) => {
                    const key = `${w}-${p}`;
                    const cell = grid[key];
                    const mark = myMark(cell);
                    const editing = editingCell === key;
                    // 「只看我的课」视图下，不是我的课就整格留空（网格仍在，一眼看出自己的课时分布）
                    const hidden = viewMode === 'mine' && mark === null;
                    return (
                      <td
                        key={w}
                        className={cn(
                          'h-11 border border-slate-700 p-1 text-center text-sm align-middle',
                          mark === 'teacher' && 'bg-brand-500/20 ring-1 ring-inset ring-brand-500/40',
                          mark === 'subject' && 'bg-brand-500/10'
                        )}
                      >
                        {editing ? (
                          <div
                            className="flex flex-col gap-0.5"
                            onBlur={(e) => {
                              // 焦点离开整个编辑区才算结束：在两个输入框之间切换时不退出
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                void saveCell(w, p, editValue, editTeacher);
                                setEditingCell('');
                              }
                            }}
                          >
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveCell(w, p, editValue, editTeacher);
                                if (e.key === 'Escape') setEditingCell('');
                              }}
                              placeholder="科目"
                              className="w-full rounded-md border border-brand-400 bg-slate-900 px-1 py-0.5 text-center text-xs text-slate-100 outline-none"
                            />
                            <input
                              value={editTeacher}
                              onChange={(e) => setEditTeacher(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveCell(w, p, editValue, editTeacher);
                                if (e.key === 'Escape') setEditingCell('');
                              }}
                              placeholder="老师"
                              className="w-full rounded-md border border-slate-600 bg-slate-900 px-1 py-0.5 text-center text-[10px] text-slate-300 outline-none focus:border-brand-400"
                            />
                          </div>
                        ) : (
                          <button
                            className="w-full cursor-text"
                            title="点击修改科目与老师（清空科目即删除）"
                            onClick={() => {
                              setEditingCell(key);
                              setEditValue(cell?.subject ?? '');
                              setEditTeacher(cell?.teacher ?? '');
                            }}
                          >
                            {cell && !hidden ? (
                              <div
                                className={cn(
                                  'font-medium leading-tight',
                                  mark === 'teacher'
                                    ? 'text-brand-200'
                                    : mark === 'subject'
                                    ? 'text-brand-300/90'
                                    : 'text-slate-300'
                                )}
                              >
                                {cell.subject}
                                {cell.teacher && (
                                  <div
                                    className={cn(
                                      'text-[10px] font-normal',
                                      mark ? 'text-brand-300/80' : 'text-slate-500'
                                    )}
                                  >
                                    {cell.teacher}
                                  </div>
                                )}
                                {mark === 'teacher' && (
                                  <div className="text-[9px] font-medium text-brand-300">我的课</div>
                                )}
                              </div>
                            ) : hidden ? null : (
                              <span className="text-slate-600">＋</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {editingClass?.name ?? ''} · {editingClass?.school_year ?? ''} {editingClass?.term ?? ''}
        </p>
      </Card>

      {/* 我的周课表（所有任教班级合并成一张）—— 一眼看出这一周到底有多少节课，可直接打印 */}
      <Card className="print-area print-area--mine print-compact">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-100">
            {teacherName ? `${teacherName} · ` : ''}我的周课表
            <span className="text-xs font-normal text-slate-400">
              （{allClasses.length} 个班级合并，共 {myLessons.reduce((n, m) => n + m.classes.length, 0)} 节）
            </span>
          </h3>
          <Button className="no-print" size="sm" variant="outline" onClick={() => printArea('mine')}>
            <Printer size={14} /> 打印我的课表
          </Button>
        </div>

        {myLessons.length === 0 ? (
          <p className="text-sm text-slate-400">
            还没有匹配到你的课。导入课表时填写「任课教师姓名」（与教务课表括号里一致，如：刘晓燕），即可自动汇总出你自己的所有课。
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '4.5rem' }} />
                  {visibleWeekdays.map((w) => (
                    <col key={w} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="border border-slate-700 bg-slate-800/60 p-2 text-xs">节次</th>
                    {visibleWeekdays.map((w) => (
                      <th
                        key={w}
                        className="border border-slate-700 bg-brand-500/15 p-2 text-xs font-medium text-brand-300"
                      >
                        {DAYS[w - 1]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((p) => (
                    <Fragment key={p}>
                      {p === 7 && (
                        <tr>
                          <td
                            colSpan={1 + visibleWeekdays.length}
                            className="border border-slate-700 bg-slate-700/60 p-1.5 text-center text-xs text-slate-400"
                          >
                            午 休（12:15-14:00）
                          </td>
                        </tr>
                      )}
                      {p === 11 && (
                        <tr>
                          <td
                            colSpan={1 + visibleWeekdays.length}
                            className="border border-slate-700 bg-slate-700/60 p-1.5 text-center text-xs text-slate-400"
                          >
                            晚 自 习（18:20 起）
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="border border-slate-700 bg-slate-800/60 p-1.5 text-center text-xs text-slate-400">
                          {PERIOD_LABEL[p]}
                        </td>
                        {visibleWeekdays.map((w) => {
                          const items = myLessons.filter((m) => m.weekday === w && m.period === p);
                          // 合并视图：一格可能同时有一班和 4 班的课，所以按班级拆成独立小块，各自可点开编辑
                          const blocks = items.flatMap((m) =>
                            m.classes.map((c) => ({
                              name: c.name,
                              subject: c.subject,
                              teacher: c.teacher,
                              noTeacher: c.noTeacher,
                              classId: allClasses.find((x) => x.name === c.name)?.id ?? '',
                            }))
                          );
                          return (
                            <td
                              key={w}
                              className={cn(
                                'h-11 border border-slate-700 p-1 text-center align-middle text-xs leading-tight',
                                blocks.length > 0 && 'bg-brand-500/10'
                              )}
                            >
                              {blocks.length === 0 ? (
                                <span className="no-print text-slate-600">－</span>
                              ) : (
                                blocks.map((b) => {
                                  const editing =
                                    myEdit &&
                                    myEdit.classId === b.classId &&
                                    myEdit.w === w &&
                                    myEdit.p === p;
                                  const key = `${b.classId}-${b.subject}`;
                                  return editing ? (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-0.5"
                                      onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) void saveMyCell();
                                      }}
                                    >
                                      <input
                                        autoFocus
                                        value={myEditSubject}
                                        onChange={(e) => setMyEditSubject(e.target.value)}
                                        placeholder="科目"
                                        className="w-full rounded-md border border-brand-400 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-100 outline-none"
                                      />
                                      <input
                                        value={myEditTeacher}
                                        onChange={(e) => setMyEditTeacher(e.target.value)}
                                        placeholder="老师"
                                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-1 py-0.5 text-center text-[10px] text-slate-300 outline-none focus:border-brand-400"
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      key={key}
                                      className="w-full cursor-text rounded px-0.5 py-0.5 transition-colors hover:bg-brand-500/20"
                                      title="点击修改这节课（清空科目即删除）"
                                      onClick={() => {
                                        if (!b.classId) return;
                                        setMyEdit({ classId: b.classId, clsName: b.name, w, p });
                                        setMyEditSubject(b.subject);
                                        setMyEditTeacher(b.teacher ?? '');
                                      }}
                                    >
                                      <span className="font-medium text-slate-200">
                                        {b.name}·{b.subject}
                                        {b.noTeacher ? '*' : ''}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
                <tfoot className="no-print">
                  <tr>
                    <td className="border border-slate-700 bg-slate-800/60 p-1.5 text-center text-xs font-medium text-slate-300">
                      当日合计
                    </td>
                    {visibleWeekdays.map((w) => {
                      const n = myLessons
                        .filter((m) => m.weekday === w)
                        .reduce((sum, m) => sum + m.classes.length, 0);
                      return (
                        <td
                          key={w}
                          className="border border-slate-700 bg-brand-500/10 p-1.5 text-center text-sm font-semibold text-brand-300"
                        >
                          {n > 0 ? `${n} 节` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="no-print mt-2 text-[11px] leading-5 text-slate-500">
              {myLessons.some((m) => m.classes.some((c) => c.noTeacher)) &&
                '带 * 的格子课表里没写任课教师，按科目判定为你的课。'}
              格子里的「班级·科目」表示这节课你在哪个班上课。
            </p>
          </>
        )}
      </Card>

      {/* 学校作息时间表（参考） */}
      <Card className="no-print">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-slate-100 select-none">
            ⏰ 学校作息时间表（崇州市蜀城中学 · 秋季）
            <span className="ml-2 text-xs font-normal text-slate-400">点击展开</span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">时间</th>
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">项目</th>
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">星期一</th>
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">星期二至星期五</th>
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">星期六</th>
                  <th className="border border-slate-700 bg-slate-800/60 p-1.5">备注</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {SCHOOL_TIMETABLE.map((row, i) => (
                  <tr key={i} className={row.section ? 'bg-slate-800/60 font-semibold' : ''}>
                    <td className="border border-slate-700 p-1.5 text-slate-400">{row.section || ''}</td>
                    <td className="border border-slate-700 p-1.5">{row.item}</td>
                    <td className="border border-slate-700 p-1.5">{row.mon}</td>
                    <td className="border border-slate-700 p-1.5">{row.tueFri}</td>
                    <td className="border border-slate-700 p-1.5">{row.sat}</td>
                    <td className="border border-slate-700 p-1.5 text-slate-400">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {/* 导入弹窗 */}
      <Modal
        open={importOpen}
        title={`导入课表 → ${editingClass?.name ?? ''}`}
        onClose={() => {
          setImportOpen(false);
          setParsed(null);
          setImportMsg('');
          setFileName('');
        }}
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button disabled={!parsed || importing} onClick={doImport}>
              {importing ? '导入中…' : `导入 ${parsed?.length ?? 0} 节课`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="任课教师姓名（用于筛选「我的课」）" hint="与教务课表括号里一致，如：刘晓燕。填好后下方「我的课」显示你自己上的全部课（不限科目）；完整课表仍会全量留存。">
            <Input
              value={teacherInput}
              onChange={(e) => {
                setTeacherInput(e.target.value);
                localStorage.setItem('bzh_teacher_name', e.target.value.trim());
              }}
              placeholder="如：刘晓燕（留空则不筛选）"
            />
            {allTeachers.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">
                  课表里出现的教师（点一下填入，名字不一致就筛不出课）：
                </span>
                {allTeachers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTeacherInput(t);
                      localStorage.setItem('bzh_teacher_name', t);
                    }}
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-xs transition-colors',
                      teacherName === t
                        ? 'bg-brand-500/15 text-brand-300'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-100'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download size={14} /> 下载导入模板
            </Button>
            <Button
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="bg-brand-600"
            >
              <Upload size={14} /> 选择教务课表文件（xlsx / xls / csv）
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            {fileName && <span className="text-xs text-slate-400">已选择：{fileName}</span>}
          </div>

          <p className="text-xs leading-5 text-slate-400">
            模板格式：第一列「节次」（早自习 / 第1节…第7节 / 晚自习一、二），第一行「周一~周六」
            （有周六课就在表头加一列「周六」），单元格填科目名，括号里写老师（如「语文（刘晓燕）」）——
            老师会显示在课表格子里，教务表同理自动识别。
          </p>

          {importMsg && <ErrorBox message={importMsg} />}

          {parsed && (
            <div className="rounded-xl bg-brand-500/15 p-3 text-sm text-brand-800">
              解析到 <b>{parsed.length}</b> 节课：{[...new Set(parsed.map((e) => e.subject))].join('、')}
              <div className="mt-1 text-xs opacity-70">导入会整体覆盖该班当前课表。</div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
