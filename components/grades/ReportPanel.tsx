'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import type { Exam, ExamStatsRow, Student } from '@/lib/types';
import { Button, Card, Empty, Loading } from '@/components/ui';
import Chart from '@/components/Chart';
import { CHART_INK } from '@/lib/chart-theme';

export default function ReportPanel({ exam }: { exam: Exam | null }) {
  const { currentClassId, currentClass } = useClass();
  const [stats, setStats] = useState<ExamStatsRow[]>([]);
  const [prevStats, setPrevStats] = useState<ExamStatsRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentClassId || !exam) return;
    setLoading(true);
    const sb = getSupabase();
    (async () => {
      const [cur, prev, st, pr] = await Promise.all([
        sb.from('v_exam_stats').select('*').eq('exam_id', exam.id),
        sb
          .from('exams')
          .select('id')
          .eq('class_id', currentClassId)
          .lt('exam_date', exam.exam_date)
          .order('exam_date', { ascending: false })
          .limit(1),
        sb.from('students').select('id,name').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true),
        // 注意：v_student_progress 没有 class_id 列。按 class_id 过滤会让 PostgREST 返回 400，
        // 而 error 又被忽略，结果 progress 恒为空 —— 报告里的「进步最大 / 需重点关注（退步）」
        // 两段永远不会出现且毫无提示。这里改为取回后按本班学生 id 过滤。
        sb.from('v_student_progress').select('*'),
      ]);
      setStats((cur.data ?? []) as ExamStatsRow[]);
      const stuRows = (st.data ?? []) as unknown as Student[];
      setStudents(stuRows);
      const stuIds = new Set(stuRows.map((s) => s.id));
      setProgress(((pr.data ?? []) as any[]).filter((p) => stuIds.has(p.student_id)));
      if (prev.data?.[0]) {
        const ps = await sb.from('v_exam_stats').select('*').eq('exam_id', (prev.data[0] as Exam).id);
        setPrevStats((ps.data ?? []) as ExamStatsRow[]);
      } else {
        setPrevStats([]);
      }
      setLoading(false);
    })();
  }, [currentClassId, exam?.id]);

  const summary = useMemo(() => {
    if (stats.length === 0) return '';
    const name = currentClass?.name ?? '本班';
    const examName = exam?.name ?? '';
    const lines: string[] = [];
    const sub = (s: string) => stats.find((x) => x.subject === s);
    const prevSub = (s: string) => prevStats.find((x) => x.subject === s);
    // 全部按原始分呈现。注意：各科满分不同（语文/数学/英语 120，其余 100），
    // 所以不给出「哪科最高/最低」这类结论 —— 那种排名会被满分决定，与真实水平无关。
    const perSub = stats
      .map((s) => {
        const p = prevSub(s.subject);
        const delta = p && s.avg_score != null && p.avg_score != null ? s.avg_score - p.avg_score : null;
        return { ...s, delta };
      });

    lines.push(
      `${name}${examName}成绩分析：语文均分 ${sub('语文')?.avg_score ?? '—'}${(() => {
        const d = perSub.find((x) => x.subject === '语文')?.delta;
        return d == null ? '' : d >= 0 ? `（较上次 +${d.toFixed(1)}）` : `（较上次 ${d.toFixed(1)}）`;
      })()}，优秀率 ${sub('语文')?.excellent_rate ?? 0}%，及格率 ${sub('语文')?.pass_rate ?? 0}%。`
    );
    const withData = perSub.filter((x) => x.avg_score != null);
    const fmtSub = (x: (typeof withData)[number]) => `${x.avg_score!.toFixed(1)} / ${x.full_score}`;
    if (withData.length >= 1) {
      lines.push(
        `本次各科均分：${withData.map((x) => `${x.subject} ${fmtSub(x)}`).join('、')}。` +
          (withData.length >= 2 ? '（各科满分不同，未做横向对比）' : '')
      );
    }
    // 说明：视图里 s_90_plus / s_below60 是「按满分比例」的桶（≥满分90% / <满分60%），
    // 不是原始分的 90 / 60。语文满分 120 时，"优秀"实际是 ≥108 分，文案必须按满分换算。
    const cn = sub('语文');
    if (cn) {
      const cf = cn.full_score ?? 100;
      lines.push(
        `语文优秀（≥${Math.round(cf * 0.9)} 分）${cn.s_90_plus} 人，不及格（<${Math.round(cf * 0.6)} 分）${
          cn.s_below60
        } 人，标准差 ${cn.stddev_score ?? '—'}（标准差越大两极分化越明显）。`
      );
    }
    // 进步/退步
    if (progress.length > 0) {
      const latest = new Map<string, any>();
      for (const p of progress) {
        const cur = latest.get(p.student_id);
        if (!cur || p.exam_date > cur.exam_date) latest.set(p.student_id, p);
      }
      const list = [...latest.values()].filter((p) => p.rank_delta != null && p.rank_delta !== 0);
      list.sort((a, b) => (b.rank_delta ?? 0) - (a.rank_delta ?? 0));
      const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? '?';
      const up = list.filter((p) => p.rank_delta > 0).slice(0, 3);
      const down = list.filter((p) => p.rank_delta < 0).slice(-3).reverse();
      if (up.length) lines.push(`进步最大：${up.map((u) => `${nameOf(u.student_id)}（+${u.rank_delta} 名）`).join('、')}。`);
      if (down.length) lines.push(`需重点关注（退步）：${down.map((d) => `${nameOf(d.student_id)}（${d.rank_delta} 名）`).join('、')}。`);
    }
    lines.push('建议：对临界生加强基础训练、每周一次面批；对退步学生及时谈心并联系家长。');
    return lines.join('\n');
  }, [stats, prevStats, progress, students, exam, currentClass]);

  const avgOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: stats.map((s) => s.subject) },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: stats.map((s) => s.avg_score ?? 0),
          itemStyle: { color: CHART_INK.primary },
          label: { show: true, position: 'top', formatter: '{c}%' },
        },
      ],
    }),
    [stats]
  );

  if (loading) return <Loading />;

  if (!exam) {
    return (
      <Card>
        <Empty text="请先创建考试" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <p className="text-xs text-slate-400">生成文字总结，可直接打印交学校或家长会使用</p>
        <Button onClick={() => window.print()}>
          <Printer size={14} /> 打印 / 存 PDF
        </Button>
      </div>

      <div className="print-area space-y-4">
        <Card accent="bg-brand-400">
          <h3 className="mb-2 text-sm font-bold text-slate-100">文字总结</h3>
          {summary ? (
            <p className="whitespace-pre-line text-sm leading-7 text-slate-500">{summary}</p>
          ) : (
            <Empty text="暂无数据，先录入成绩" />
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-bold text-slate-100">各科统计表</h3>
          {stats.length === 0 ? (
            <Empty text="暂无数据" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 pr-2">科目</th>
                  <th className="pb-2 pr-2">均分</th>
                  <th className="pb-2 pr-2">较上次</th>
                  <th className="pb-2 pr-2">优秀率</th>
                  <th className="pb-2 pr-2">及格率</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const p = prevStats.find((x) => x.subject === s.subject);
                  const d = p && s.avg_score != null && p.avg_score != null ? s.avg_score - p.avg_score : null;
                  return (
                    <tr key={s.subject} className="border-t border-slate-50">
                      <td className="py-1.5 pr-2 font-medium">{s.subject}</td>
                      <td className="py-1.5 pr-2">{s.avg_score ?? '—'}</td>
                      <td className={`py-1.5 pr-2 ${d == null ? 'text-slate-500' : d >= 0 ? 'text-green-300' : 'text-red-500'}`}>
                        {d == null ? '—' : d >= 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}
                      </td>
                      <td className="py-1.5 pr-2">{s.excellent_rate ?? 0}%</td>
                      <td className="py-1.5 pr-2">{s.pass_rate ?? 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-100">各科均分对比</h3>
          {stats.length > 0 ? <Chart option={avgOption} height={220} /> : <Empty text="暂无数据" />}
        </Card>

        <p className="text-center text-xs text-slate-500">
          {currentClass?.name ?? ''} · {exam?.name ?? ''} · 生成于 {new Date().toLocaleDateString('zh-CN')}
        </p>
      </div>
    </div>
  );
}
