'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, Search, Trash2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import ImportDialog from '@/components/ImportDialog';
import Watermark from '@/components/Watermark';
import AnalysisPanel from '@/components/grades/AnalysisPanel';
import CriticalPanel from '@/components/grades/CriticalPanel';
import RankPanel from '@/components/grades/RankPanel';
import ReportPanel from '@/components/grades/ReportPanel';
import type { Exam, ExamStatsRow, ExamSubject, GradeRecord, Student } from '@/lib/types';
import { Button, Card, Confirm, Empty, Input, Loading, PageHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, compareStudentNo } from '@/lib/utils';

type Tab = 'entry' | 'rank' | 'analysis' | 'critical' | 'report';

const TABS: [Tab, string, string][] = [
  ['entry', '录入', '✏️'],
  ['rank', '排名', '🏆'],
  ['analysis', '分析', '📊'],
  ['critical', '临界生', '🎯'],
  ['report', '分析报告', '📄'],
];

export default function GradesPage() {
  const { currentClassId, currentClass } = useClass();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [tab, setTab] = useState<Tab>('entry');
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<ExamStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<{ id: string; name: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const matched = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return students.filter((s) => s.name.includes(q) || s.student_no.includes(q)).slice(0, 8);
  }, [students, query]);

  const lookupStu = students.find((s) => s.id === lookupId) ?? null;

  useEffect(() => {
    if (!currentClassId) return;
    getSupabase()
      .from('exams')
      .select('*')
      .eq('class_id', currentClassId)
      .order('exam_date', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Exam[];
        setExams(list);
        const fromUrl = new URLSearchParams(window.location.search).get('exam');
        setExamId((prev) =>
          fromUrl && list.some((e) => e.id === fromUrl)
            ? fromUrl
            : prev && list.some((e) => e.id === prev)
            ? prev
            : list[0]?.id ?? ''
        );
        setLoading(false);
      });
  }, [currentClassId, tick]);

  useEffect(() => {
    if (!currentClassId || !examId) return;
    setLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb.from('exam_subjects').select('*').eq('exam_id', examId),
      sb.from('students').select('id,name,student_no').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no'),
      sb.from('grade_records').select('*').eq('exam_id', examId),
      sb.from('v_exam_stats').select('*').eq('exam_id', examId),
    ]).then(([sub, stu, gr, st]) => {
      const subs = (sub.data ?? []) as ExamSubject[];
      setSubjects(subs);
      setStudents([...((stu.data ?? []) as unknown as Student[])].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      const m: Record<string, string> = {};
      for (const r of (gr.data ?? []) as GradeRecord[]) {
        // 缺考与「未录入」必须区分开：两者都写成空字符串的话，老师既分不清
        // "这孩子那天没来"和"我还没录"，而且光标经过空格子就会触发 onBlur 把缺考记录删掉。
        m[`${r.student_id}|${r.subject}`] = r.is_absent ? '缺考' : r.score != null ? String(r.score) : '';
      }
      setScores(m);
      setStats((st.data ?? []) as ExamStatsRow[]);
      setLoading(false);
    });
  }, [currentClassId, examId, tick]);

  // 删除某学生本场考试的全部成绩
  const deleteRowGrades = async () => {
    if (!confirmRow) return;
    setDeleting(true);
    try {
      const sb = getSupabase();
      const { error, count } = await sb
        .from('grade_records')
        .delete({ count: 'exact' })
        .eq('exam_id', examId)
        .eq('student_id', confirmRow.id);
      if (error) throw error;
      void audit('delete', 'grade', confirmRow.id, { exam: examId });
      toast(`已删除「${confirmRow.name}」的成绩${count ? `（${count} 科）` : ''}`);
      setConfirmRow(null);
      reload();
    } catch (e) {
      toast('删除失败：' + (e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // 清空本场考试全部成绩（危险操作）
  const clearExamGrades = async () => {
    setDeleting(true);
    try {
      const sb = getSupabase();
      const { error, count } = await sb
        .from('grade_records')
        .delete({ count: 'exact' })
        .eq('exam_id', examId);
      if (error) throw error;
      void audit('delete', 'grade_all', examId, { count });
      toast(`已清空本场考试 ${count ?? 0} 条成绩`);
      setConfirmClear(false);
      reload();
    } catch (e) {
      toast('清空失败：' + (e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const saveCell = async (studentId: string, subject: string) => {
    const val = scores[`${studentId}|${subject}`]?.trim() ?? '';
    const sb = getSupabase();
    const key = { exam_id: examId, student_id: studentId, subject };
    // 「缺考」是有意义的值，不能当成空：否则老师用 Tab 逐格检查时，
    // 光标经过这些格子就会把缺考记录静默删除。
    if (val === '缺考') {
      await sb
        .from('grade_records')
        .upsert(
          { ...key, class_id: currentClassId, score: null, is_absent: true },
          { onConflict: 'exam_id,student_id,subject' }
        );
      return;
    }
    if (val === '') {
      await sb.from('grade_records').delete().match(key);
      return;
    }
    const num = Number(val);
    if (Number.isNaN(num)) {
      alert(`「${val}」不是有效分数`);
      return;
    }
    const full = subjects.find((s) => s.subject === subject)?.full_score ?? 100;
    if (num < 0 || num > full) {
      alert(`分数超出范围（0~${full}）`);
      return;
    }
    await sb.from('grade_records').upsert(
      { ...key, class_id: currentClassId, score: num, is_absent: false },
      { onConflict: 'exam_id,student_id,subject' }
    );
    void audit('insert', 'grade', studentId, { subject });
  };

  const currentExam = exams.find((e) => e.id === examId) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📈"
        title="成绩"
        subtitle={`${currentClass?.name ?? ''} · ${currentClass?.role === '任教' ? '任教班（仅语文成绩）· 切到班主任班看全科' : '班主任班（全科）'}`}
        color={{ chip: 'bg-emerald-500/15 text-emerald-300', soft: 'bg-emerald-500/10', text: 'text-emerald-300' }}
      >
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <FileUp size={14} /> 导入成绩
        </Button>
        <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-48">
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{e.exam_type}）
            </option>
          ))}
        </Select>
      </PageHeader>

      {/* 学生成绩查询 */}
      <Card accent="bg-sky-400">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="按姓名或学号查询成绩"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setLookupId('');
              }}
            />
          </div>
          {matched.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {matched.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLookupId(s.id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium',
                    lookupId === s.id ? 'bg-sky-500 text-white' : 'bg-slate-700/60 text-slate-500 hover:bg-sky-500/15'
                  )}
                >
                  {s.student_no} {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {lookupStu && (
          <div className="mt-3 overflow-x-auto">
            <div className="mb-1.5 text-xs text-slate-400">
              {lookupStu.name}（{lookupStu.student_no}）· {currentExam?.name ?? ''} · 与班级均分对比
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-1.5 pr-2">科目</th>
                  <th className="pb-1.5 pr-2">分数</th>
                  <th className="pb-1.5 pr-2">满分</th>
                  <th className="pb-1.5 pr-2">班均</th>
                  <th className="pb-1.5">与班均差</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const raw = scores[`${lookupStu.id}|${s.subject}`];
                  const absent = raw === '缺考';
                  const score = raw && !absent ? Number(raw) : null;
                  const st = stats.find((x) => x.subject === s.subject);
                  const avgScore = st && st.avg_score != null ? Math.round(st.avg_score * 10) / 10 : null;
                  const diff =
                    score != null && avgScore != null ? Math.round((score - avgScore) * 10) / 10 : null;
                  return (
                    <tr key={s.subject} className="border-t border-slate-50">
                      <td className="py-1.5 pr-2 font-medium">{s.subject}</td>
                      <td className="py-1.5 pr-2">{absent ? '缺考' : score != null ? score : '未录'}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{s.full_score}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{avgScore ?? '—'}</td>
                      <td className={`py-1.5 font-medium ${diff == null ? 'text-slate-500' : diff >= 0 ? 'text-green-300' : 'text-red-500'}`}>
                        {diff == null ? '—' : diff >= 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex gap-1.5">
        {TABS.map(([t, label, emoji]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t ? 'bg-emerald-500 text-white shadow-card' : 'bg-slate-800 text-slate-400 shadow-card hover:text-emerald-300'
            )}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {!examId ? (
        <Card>
          <Empty text="请先到「考试管理」创建考试" />
        </Card>
      ) : tab === 'entry' ? (
        <>
          {loading && <Loading />}
          {!loading && (
            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">
                成绩录入
                <span className="ml-2 text-xs font-normal text-slate-400">填写后自动保存；留空表示删除该成绩</span>
              </h3>
              <div className="mb-2 flex justify-end">
                <Button variant="outline" size="sm" className="text-red-400" onClick={() => setConfirmClear(true)}>
                  <Trash2 size={14} /> 清空本场成绩
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="sticky left-0 bg-slate-800 pb-2 pr-2">姓名</th>
                      {subjects.map((s) => (
                        // 科目名与下面的分数统一左对齐、且左内边距一致（pl-1.5 ↔ 输入框 px-1.5），
                        // 两者才会落在同一条竖线上。表头居中 + 输入框靠左是错位的根源。
                        <th key={s.subject} className="pb-2 pl-1.5 pr-2 text-left">
                          {s.subject}
                          <span className="ml-0.5 text-[10px] text-slate-500">/{s.full_score}</span>
                        </th>
                      ))}
                      <th className="pb-2 pr-1 text-right" title="删除该生本场考试全部成绩">
                        删除
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((stu) => (
                      <tr key={stu.id} className="border-t border-slate-50 hover:bg-emerald-500/10">
                        <td className="sticky left-0 bg-slate-800 py-1 pr-2 font-medium">
                          {stu.name}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">{stu.student_no}</span>
                        </td>
                        {subjects.map((s) => (
                          <td key={s.subject} className="py-1 pr-2">
                            <Input
                              className={cn(
                                // 左对齐 + 与表头相同的左内边距：数字起点与科目名起点在同一条竖线上
                                'h-8 w-14 px-1.5 text-left tabular-nums',
                                scores[`${stu.id}|${s.subject}`] === '缺考' && 'text-amber-300'
                              )}
                              title={
                                scores[`${stu.id}|${s.subject}`] === '缺考'
                                  ? '缺考（清空此格即取消缺考标记）'
                                  : undefined
                              }
                              value={scores[`${stu.id}|${s.subject}`] ?? ''}
                              onChange={(e) =>
                                setScores((p) => ({ ...p, [`${stu.id}|${s.subject}`]: e.target.value }))
                              }
                              onBlur={() => saveCell(stu.id, s.subject)}
                            />
                          </td>
                        ))}
                        <td className="py-1 text-right">
                          <button
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-red-400"
                            title={`删除「${stu.name}」本场全部成绩`}
                            onClick={() => setConfirmRow({ id: stu.id, name: stu.name })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : tab === 'rank' ? (
        <>
          <Watermark />
          {loading ? (
            <Loading />
          ) : (
            <RankPanel
              students={students}
              subjects={subjects}
              scores={scores}
              examName={currentExam?.name}
            />
          )}
        </>
      ) : tab === 'analysis' ? (
        <>
          <Watermark />
          {/* key={examId}：切换考试时让分析面板重新挂载，避免短暂显示上一场考试的
              分数与比率（旧数据没有 loading，很容易被当成"新成绩已经出来了"） */}
          {loading ? <Loading /> : <AnalysisPanel key={examId} stats={stats} subjects={subjects} students={students} />}
        </>
      ) : tab === 'critical' ? (
        <>
          <Watermark />
          <CriticalPanel examId={examId} />
        </>
      ) : (
        <>
          <Watermark />
          <ReportPanel exam={currentExam} />
        </>
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="grades"
        initialExamId={examId}
        onImported={reload}
      />

      <Confirm
        open={!!confirmRow}
        title="删除学生成绩"
        message={`确定删除「${confirmRow?.name}」本场考试的全部成绩吗？各科分数都会被清除，可重新填写或重新导入。`}
        danger
        onCancel={() => setConfirmRow(null)}
        onConfirm={deleteRowGrades}
      />
      <Confirm
        open={confirmClear}
        title="清空本场考试成绩"
        message="确定清空本场考试的**全部**成绩吗？所有学生的各科分数都会被删除（考试本身保留，可重新录入/导入）。此操作不可撤销。"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearExamGrades}
      />
    </div>
  );
}
