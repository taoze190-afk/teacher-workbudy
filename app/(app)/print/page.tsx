'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import type {
  DutyGroup,
  DutyGroupMember,
  Exam,
  ExamSubject,
  ParentMeeting,
  Seat,
  Student,
} from '@/lib/types';
import { computeRanking, scoresFromGradeMap } from '@/lib/rank';
import { Badge, Button, Card, Input, Loading, PageHeader, Select } from '@/components/ui';
import { formatDate, today, compareStudentNo } from '@/lib/utils';

type PrintType = 'seats' | 'grades' | 'matrix' | 'reportcard' | 'attendance' | 'signin' | 'duty' | 'award';

const TYPES: [PrintType, string][] = [
  ['seats', '座位表'],
  ['grades', '成绩条'],
  ['matrix', '全班成绩表（带名次）'],
  ['award', '前 N 名奖状'],
  ['reportcard', '成绩条+评语'],
  ['attendance', '考勤汇总'],
  ['signin', '家长会签到表'],
  ['duty', '值日表'],
];

export default function PrintPage() {
  const { currentClassId, currentClass, settings } = useClass();
  const [type, setType] = useState<PrintType>('seats');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [seats, setSeats] = useState<Record<string, Student>>({});
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [gradeMap, setGradeMap] = useState<Record<string, Record<string, number | string>>>({});
  const [examSubjects, setExamSubjects] = useState<string[]>([]);
  const [subjectRows, setSubjectRows] = useState<ExamSubject[]>([]);
  const [fullScoreMap, setFullScoreMap] = useState<Record<string, number>>({});
  // 奖状打印前几名
  const [awardN, setAwardN] = useState(3);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [monthStats, setMonthStats] = useState<Record<string, { late: number; absent: number; leave: number }>>({});
  const [meetings, setMeetings] = useState<ParentMeeting[]>([]);
  const [meetingId, setMeetingId] = useState('');
  const [attendees, setAttendees] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<DutyGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<Record<string, string[]>>({});
  const [reportMap, setReportMap] = useState<Record<string, { conduct_level?: string | null; comment_final?: string | null }>>({});

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    (async () => {
      const st = await sb.from('students').select('id,name,student_no').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no');
      setStudents([...(st.data ?? []) as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      const id2stu = new Map(((st.data ?? []) as unknown as Student[]).map((s) => [s.id, s]));
      const [seatRes, examRes, meetRes, groupRes, memberRes] = await Promise.all([
        sb.from('seats').select('*').eq('class_id', currentClassId),
        sb.from('exams').select('*').eq('class_id', currentClassId).order('exam_date', { ascending: false }),
        sb.from('parent_meetings').select('*').eq('class_id', currentClassId).order('meeting_date', { ascending: false }),
        sb.from('duty_groups').select('*').eq('class_id', currentClassId).order('sort_order'),
        sb.from('duty_group_members').select('*').eq('class_id', currentClassId),
      ]);
      const sm: Record<string, Student> = {};
      for (const s of (seatRes.data ?? []) as Seat[]) {
        const stu = id2stu.get(s.student_id ?? '');
        if (stu) sm[`${s.seat_row}-${s.seat_col}`] = stu;
      }
      setSeats(sm);
      const el = (examRes.data ?? []) as Exam[];
      setExams(el);
      setExamId((p) => (p && el.some((e) => e.id === p) ? p : el[0]?.id ?? ''));
      const ml = (meetRes.data ?? []) as ParentMeeting[];
      setMeetings(ml);
      setMeetingId((p) => (p && ml.some((m) => m.id === p) ? p : ml[0]?.id ?? ''));
      setGroups((groupRes.data ?? []) as DutyGroup[]);
      const gm: Record<string, string[]> = {};
      for (const m of (memberRes.data ?? []) as DutyGroupMember[]) {
        const stu = id2stu.get(m.student_id);
        if (stu) (gm[m.group_id] ??= []).push(stu.name);
      }
      setGroupMembers(gm);
      setLoading(false);
    })();
  }, [currentClassId]);

  // 成绩条数据
  useEffect(() => {
    if (!currentClassId || !examId) return;
    Promise.all([
      getSupabase().from('exam_subjects').select('subject,full_score').eq('exam_id', examId),
      getSupabase().from('grade_records').select('student_id,subject,score,is_absent').eq('exam_id', examId),
    ]).then(([sub, gr]) => {
      const subs = (sub.data ?? []) as any[];
      setExamSubjects(subs.map((s) => s.subject));
      setSubjectRows(subs as ExamSubject[]);
      const fm: Record<string, number> = {};
      for (const s of subs) fm[s.subject] = s.full_score;
      setFullScoreMap(fm);
      const m: Record<string, Record<string, number | string>> = {};
      for (const r of (gr.data ?? []) as any[]) {
        m[r.student_id] ??= {};
        m[r.student_id][r.subject] = r.is_absent ? '缺考' : r.score;
      }
      setGradeMap(m);
    });
  }, [currentClassId, examId]);

  // 考勤汇总数据
  useEffect(() => {
    if (!currentClassId || !month) return;
    getSupabase()
      .from('v_attendance_monthly')
      .select('student_id,late_cnt,absent_cnt,leave_cnt')
      .eq('class_id', currentClassId)
      .eq('month', month)
      .then(({ data }) => {
        const m: Record<string, { late: number; absent: number; leave: number }> = {};
        for (const r of (data ?? []) as any[]) {
          m[r.student_id] = { late: r.late_cnt ?? 0, absent: r.absent_cnt ?? 0, leave: r.leave_cnt ?? 0 };
        }
        setMonthStats(m);
      });
  }, [currentClassId, month]);

  // 签到表数据
  useEffect(() => {
    if (!meetingId) return;
    getSupabase()
      .from('parent_meeting_attendees')
      .select('student_id')
      .eq('meeting_id', meetingId)
      .then(({ data }) => setAttendees(new Set((data ?? []).map((a: any) => a.student_id))));
  }, [meetingId]);

  // 评语数据（当前学期）
  useEffect(() => {
    if (!currentClassId) return;
    getSupabase()
      .from('term_reports')
      .select('student_id,conduct_level,comment_final')
      .eq('class_id', currentClassId)
      .eq('term', currentClass?.term ?? '')
      .then(({ data }) => {
        const m: Record<string, { conduct_level?: string | null; comment_final?: string | null }> = {};
        for (const r of (data ?? []) as any[]) m[r.student_id] = { conduct_level: r.conduct_level, comment_final: r.comment_final };
        setReportMap(m);
      });
  }, [currentClassId, currentClass?.term]);

  const rows = settings?.seating_rows ?? 8;
  const cols = settings?.seating_cols ?? 7;

  // 全班成绩排名：与成绩页「排名」tab 共用同一套算法，保证名次一致
  const ranking = useMemo(
    () => computeRanking(students, subjectRows, scoresFromGradeMap(gradeMap), 'total'),
    [students, subjectRows, gradeMap]
  );
  const currentExam = exams.find((e) => e.id === examId) ?? null;
  const awardList = useMemo(() => ranking.filter((r) => r.rank <= awardN), [ranking, awardN]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
        emoji="🖨️"
        title="打印中心"
        subtitle={`${currentClass?.name ?? ''} · ${currentClass?.role === '任教' ? '任教班（仅语文）' : '班主任班（全科）'} · 切换顶栏班级可导出对应班级材料`}
        color={{ chip: 'bg-purple-500/15 text-purple-300', soft: 'bg-purple-500/10', text: 'text-purple-300' }}
      >
          <Button onClick={() => window.print()}>
            <Printer size={16} /> 打印 / 存 PDF
          </Button>
        </PageHeader>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        {TYPES.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              type === t ? 'border-brand-500 bg-brand-500/15 font-medium text-brand-300' : 'border-slate-700 bg-slate-800 text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
        {(type === 'grades' || type === 'matrix' || type === 'reportcard' || type === 'award') && (
          <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-44">
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        )}
        {type === 'award' && (
          <label className="flex items-center gap-1.5 text-sm text-slate-400">
            打印前
            <Input
              type="number"
              value={awardN}
              onChange={(e) => setAwardN(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 text-center"
            />
            名
          </label>
        )}
        {type === 'attendance' && (
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />
        )}
        {type === 'signin' && (
          <Select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-48">
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}（{formatDate(m.meeting_date)}）
              </option>
            ))}
          </Select>
        )}
      </div>

      <Card className="print-area bg-slate-800">
        {type === 'seats' && (
          <div>
            <h2 className="mb-2 text-center text-sm font-bold">座位表 · {currentClass?.name ?? ''}</h2>
            <div className="mx-auto mb-2 w-1/2 border border-slate-600 py-1 text-center text-xs">讲 台</div>
            <table className="mx-auto border-collapse">
              <tbody>
                {Array.from({ length: rows }, (_, ri) => ri + 1).map((r) => (
                  <tr key={r}>
                    {Array.from({ length: cols }, (_, ci) => ci + 1).map((c) => {
                      const stu = seats[`${r}-${c}`];
                      return (
                        <td key={c} className="h-12 w-20 border border-slate-600 text-center text-xs">
                          {stu ? (
                            <>
                              <div className="font-medium">{stu.name}</div>
                              <div className="text-[10px] text-slate-400">{stu.student_no}</div>
                            </>
                          ) : (
                            ''
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {type === 'grades' && (
          <div>
            <h2 className="mb-3 text-center text-sm font-bold">
              成绩条 · {currentClass?.name ?? ''} · {exams.find((e) => e.id === examId)?.name ?? ''}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {students.map((s) => (
                <div key={s.id} className="rounded border border-slate-600 p-2 text-xs">
                  <div className="mb-1 font-semibold">
                    {s.name}
                    <span className="ml-2 font-normal text-slate-400">{s.student_no}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {examSubjects.map((sub) => (
                      <div key={sub} className="flex justify-between">
                        <span className="text-slate-400">{sub}</span>
                        <span className="font-medium">{gradeMap[s.id]?.[sub] ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {type === 'matrix' && (
          <div>
            <h2 className="mb-1 text-center text-sm font-bold">
              全班成绩表 · {currentClass?.name ?? ''} · {currentExam?.name ?? ''}
            </h2>
            <p className="mb-2 text-center text-[10px] text-slate-400">
              名次按总分（各科原始分相加）排列，同分并列 · 共 {ranking.length} 人
            </p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-slate-600 p-1 text-center">姓名</th>
                  {subjectRows.map((s) => (
                    <th key={s.subject} className="border border-slate-600 p-1 text-center">
                      {s.subject}
                      <span className="text-[9px] text-slate-400">/{s.full_score}</span>
                    </th>
                  ))}
                  <th className="border border-slate-600 p-1 text-center">总分</th>
                  <th className="border border-slate-600 p-1 text-center">名次</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-slate-600 p-1 text-center font-medium">{r.name}</td>
                    {subjectRows.map((s) => (
                      <td key={s.subject} className="border border-slate-600 p-1 text-center">
                        {r.per[s.subject] ?? (r.absent.includes(s.subject) ? '缺考' : '—')}
                      </td>
                    ))}
                    <td className="border border-slate-600 p-1 text-center font-semibold">{r.total}</td>
                    <td className="border border-slate-600 p-1 text-center font-medium">{r.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {type === 'award' && (
          <div>
            {awardList.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                本场考试还没有录入成绩，无法生成奖状
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {awardList.map((r) => (
                  <div
                    key={r.id}
                    className="award-frame flex h-[13rem] flex-col justify-between rounded-lg border-2 border-slate-600 px-6 py-5"
                  >
                    <div className="text-center text-base font-bold tracking-[0.5em]">奖 状</div>
                    <p className="text-[13px] leading-7">
                      <span className="font-semibold">{r.name}</span> 同学：
                      <br />
                      在 {currentClass?.school_year ?? ''} 学年 {currentClass?.term ?? ''}{' '}
                      <span className="font-medium">{currentExam?.name ?? ''}</span> 中成绩优异，荣获班级第{' '}
                      <span className="font-semibold">{r.rank}</span> 名。
                      {r.rank === 1 ? '名列前茅，' : ''}特发此状，以资鼓励。
                    </p>
                    <div className="text-right text-[12px] leading-6">
                      <div>{currentClass?.name ?? ''}</div>
                      <div>班主任：{currentClass?.homeroom_teacher ?? ''}</div>
                      <div>
                        {currentExam?.exam_date ? formatDate(currentExam.exam_date) : formatDate(today())}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {type === 'reportcard' && (
          <div>
            <h2 className="mb-3 text-center text-sm font-bold">
              期末成绩条与评语 · {currentClass?.name ?? ''} · {currentClass?.term ?? ''}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {students.map((s) => {
                const rep = reportMap[s.id];
                return (
                  <div key={s.id} className="rounded border border-slate-600 p-2.5 text-xs">
                    <div className="mb-1 flex items-baseline justify-between border-b border-slate-700 pb-1">
                      <span className="text-sm font-bold">
                        {s.name}
                        <span className="ml-2 text-xs font-normal text-slate-400">{s.student_no}</span>
                      </span>
                      <span className={rep?.conduct_level === '不合格' ? 'font-semibold text-red-300' : 'font-semibold text-green-300'}>
                        {rep?.conduct_level ?? '合格'}
                      </span>
                    </div>
                    <div className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {examSubjects.map((sub) => (
                        <div key={sub} className="flex justify-between">
                          <span className="text-slate-400">{sub}</span>
                          <span className="font-medium">{gradeMap[s.id]?.[sub] ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="leading-5 text-slate-500">{rep?.comment_final ?? '（评语未填写）'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {type === 'attendance' && (
          <div>
            <h2 className="mb-2 text-center text-sm font-bold">考勤汇总 · {month}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-600 p-1.5">序号</th>
                  <th className="border border-slate-600 p-1.5">姓名</th>
                  <th className="border border-slate-600 p-1.5">迟到</th>
                  <th className="border border-slate-600 p-1.5">早退</th>
                  <th className="border border-slate-600 p-1.5">旷课</th>
                  <th className="border border-slate-600 p-1.5">请假</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const m = monthStats[s.id] ?? { late: 0, absent: 0, leave: 0 };
                  return (
                    <tr key={s.id}>
                      <td className="border border-slate-600 p-1.5 text-center">{i + 1}</td>
                      <td className="border border-slate-600 p-1.5">{s.name}</td>
                      <td className="border border-slate-600 p-1.5 text-center">{m.late}</td>
                      <td className="border border-slate-600 p-1.5 text-center">0</td>
                      <td className="border border-slate-600 p-1.5 text-center">{m.absent}</td>
                      <td className="border border-slate-600 p-1.5 text-center">{m.leave}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {type === 'signin' && (
          <div>
            <h2 className="mb-2 text-center text-sm font-bold">
              家长会签到表 · {meetings.find((m) => m.id === meetingId)?.title ?? ''}
            </h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-600 p-1.5">序号</th>
                  <th className="border border-slate-600 p-1.5">学生</th>
                  <th className="border border-slate-600 p-1.5">家长签名</th>
                  <th className="border border-slate-600 p-1.5">备注</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.id}>
                    <td className="border border-slate-600 p-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-600 p-1.5">{s.name}</td>
                    <td className="h-8 border border-slate-600" />
                    <td className="border border-slate-600" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {type === 'duty' && (
          <div>
            <h2 className="mb-3 text-center text-sm font-bold">值日表 · {currentClass?.name ?? ''}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-600 p-1.5">组</th>
                  <th className="border border-slate-600 p-1.5">成员</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td className="border border-slate-600 p-1.5 text-center font-medium">
                      {g.name}
                      {g.sort_order === 1 && <Badge className="ml-1 bg-brand-100 text-brand-300">本周</Badge>}
                    </td>
                    <td className="border border-slate-600 p-1.5">{groupMembers[g.id]?.join('、') ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
