'use client';

import { useEffect, useMemo, useState } from 'react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import type { ExamStatsRow, ExamSubject, Student } from '@/lib/types';
import { Badge, Card, Empty, Select } from '@/components/ui';
import Chart from '@/components/Chart';
import { cn } from '@/lib/utils';
import { CHART_INK, CHART_PALETTE, SCORE_BAND_COLORS } from '@/lib/chart-theme';

const HIST_COLORS = SCORE_BAND_COLORS;
const SEG_LABELS = ['<60', '60-69', '70-79', '80-89', '≥90'];
const SEG_KEYS = ['s_below60', 's_60_69', 's_70_79', 's_80_89', 's_90_plus'];

interface TrendRow {
  exam_date: string;
  class_avg: number | null;
}

interface RadarRow {
  subject: string;
  pct: number;
  class_pct: number;
}

interface ProgressRow {
  student_id: string;
  exam_date: string;
  pct: number;
  rnk: number;
  rank_delta: number | null;
}

interface GapRow {
  student_id: string;
  subject: string;
  pct: number;
  avg_pct: number;
  gap: number;
}

interface DualRow {
  name: string;
  avg: number | null;
  pass: number | null;
  excellent: number | null;
}

export default function AnalysisPanel({
  stats,
  subjects,
  students,
}: {
  stats: ExamStatsRow[];
  subjects: ExamSubject[];
  students: Student[];
}) {
  const { currentClassId, currentClass } = useClass();
  const isRenjiao = currentClass?.role === '任教';
  // 视角：任教班固定为语文视角；每次切换班级都重新判定。
  // 之前 useState 初值只在挂载时算一次，而从任教班切到班主任班时组件不会重新挂载
  // （AppShell 切班是纯状态变更），于是会一直停留在「语文任教」视角——
  // 这正是「成绩分析页怎么还是只有语文」的原因。
  const [viewState, setViewState] = useState<'all' | 'chinese'>('all');
  useEffect(() => {
    setViewState(currentClass?.role === '任教' ? 'chinese' : 'all');
  }, [currentClassId, currentClass?.role]);
  const view: 'all' | 'chinese' = isRenjiao ? 'chinese' : viewState;
  const setView = setViewState;
  const [histSubject, setHistSubject] = useState('');
  const [radarStudent, setRadarStudent] = useState('');
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [allStats, setAllStats] = useState<ExamStatsRow[]>([]);
  const [radar, setRadar] = useState<RadarRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [dual, setDual] = useState<DualRow[]>([]);

  useEffect(() => {
    setHistSubject((p) => (subjects.some((s) => s.subject === p) ? p : subjects[0]?.subject ?? ''));
    setRadarStudent((p) => (students.some((s) => s.id === p) ? p : students[0]?.id ?? ''));
  }, [subjects, students]);

  useEffect(() => {
    if (!currentClassId) return;
    const sb = getSupabase();
    Promise.all([
      sb.from('v_class_trend').select('*').eq('class_id', currentClassId),
      sb.from('v_exam_stats').select('*').eq('class_id', currentClassId),
      sb.from('v_student_subject_gaps').select('*').eq('class_id', currentClassId),
    ]).then(([t, a, g]) => {
      setTrend((t.data ?? []) as TrendRow[]);
      setAllStats((a.data ?? []) as ExamStatsRow[]);
      setGaps((g.data ?? []) as GapRow[]);
    });
  }, [currentClassId]);

  useEffect(() => {
    if (!currentClassId) return;
    // 视图无 class_id 列，取回后按本班学生过滤
    const ids = new Set(students.map((s) => s.id));
    getSupabase()
      .from('v_student_progress')
      .select('*')
      .then(({ data }) =>
        setProgress(((data ?? []) as ProgressRow[]).filter((p) => ids.has(p.student_id)))
      );
  }, [currentClassId, students]);

  useEffect(() => {
    if (!radarStudent) return;
    getSupabase()
      .from('v_student_radar')
      .select('*')
      .eq('student_id', radarStudent)
      .then(({ data }) => setRadar((data ?? []) as RadarRow[]));
  }, [radarStudent]);

  // 双班语文对比
  useEffect(() => {
    if (!currentClassId) return;
    const sb = getSupabase();
    (async () => {
      const { data: classes } = await sb.from('school_classes').select('id,name').eq('archived', false);
      const rows: DualRow[] = [];
      for (const c of (classes ?? []) as { id: string; name: string }[]) {
        const { data: ex } = await sb
          .from('exams')
          .select('id')
          .eq('class_id', c.id)
          .order('exam_date', { ascending: false })
          .limit(1);
        const eid = (ex ?? [])[0]?.id;
        if (!eid) continue;
        const { data: st } = await sb
          .from('v_exam_stats')
          .select('avg_score,full_score,pass_rate,excellent_rate')
          .eq('exam_id', eid)
          .eq('subject', '语文')
          .maybeSingle();
        if (st) {
          rows.push({
            name: c.name,
            avg: st.avg_score != null && st.full_score ? Number(((st.avg_score / st.full_score) * 100).toFixed(1)) : null,
            pass: st.pass_rate,
            excellent: st.excellent_rate,
          });
        }
      }
      setDual(rows);
    })();
  }, [currentClassId]);

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? '?';
  const statRow = (subject: string) => stats.find((s) => s.subject === subject);
  const histRow = statRow(view === 'chinese' ? '语文' : histSubject);
  const yName = view === 'chinese' ? '语文' : '人数';
  // 分段标签按该科满分换算成原始分：满分150 → <90 / 90-104 / 105-119 / 120-134 / ≥135
  const histFull = histRow?.full_score ?? 100;
  const scaledSegLabels = useMemo(() => {
    const f = (x: number) => Math.round((x / 100) * histFull);
    if (histFull === 100) return SEG_LABELS;
    return [`<${f(60)}`, `${f(60)}-${f(70) - 1}`, `${f(70)}-${f(80) - 1}`, `${f(80)}-${f(90) - 1}`, `≥${f(90)}`];
  }, [histFull]);

  const histOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: scaledSegLabels },
      yAxis: { type: 'value', name: yName },
      series: [
        {
          type: 'bar',
          data: histRow ? SEG_KEYS.map((k) => (histRow as any)[k] ?? 0) : [],
          itemStyle: { color: (p: any) => HIST_COLORS[p.dataIndex] },
          label: { show: true, position: 'top' },
        },
      ],
    }),
    [histRow, yName, scaledSegLabels]
  );

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
                  },
      ],
    }),
    [stats]
  );

  const passRateOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: stats.map((s) => s.subject) },
      yAxis: { type: 'value', max: 100 },
      series: [
        {
          name: '优秀率（≥满分90%）',
          type: 'bar',
          data: stats.map((s) => s.excellent_rate ?? 0),
          itemStyle: { color: CHART_INK.positive },
                  },
        {
          name: '及格率（≥满分60%）',
          type: 'bar',
          data: stats.map((s) => s.pass_rate ?? 0),
          itemStyle: { color: CHART_INK.warn },
                  },
      ],
    }),
    [stats]
  );

  const trendOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: trend.map((t) => t.exam_date.slice(5)) },
      yAxis: { type: 'value', max: 100 },
      series: [
        {
          name: '班级总均分',
          type: 'line',
          smooth: true,
          data: trend.map((t) => t.class_avg),
          itemStyle: { color: CHART_INK.primary },
          areaStyle: { color: CHART_INK.primarySoft },
                  },
      ],
    }),
    [trend]
  );

  const subjectTrendOption = useMemo(() => {
    const dates = [...new Set(allStats.map((s) => s.exam_date))].sort();
    const subs = [...new Set(allStats.map((s) => s.subject))];
    const colors = CHART_PALETTE;
    return {
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', top: 0 },
      xAxis: { type: 'category', data: dates.map((d) => d.slice(5)) },
      yAxis: { type: 'value', max: 100 },
      series: subs.map((sub, i) => ({
        name: sub,
        type: 'line',
        smooth: true,
        lineStyle: { width: sub === '语文' ? 3.5 : 2, color: sub === '语文' ? CHART_INK.primary : colors[i % colors.length] },
        itemStyle: { color: sub === '语文' ? CHART_INK.primary : colors[i % colors.length] },
        data: dates.map((d) => {
          const r = allStats.find((s) => s.subject === sub && s.exam_date === d);
          return r && r.avg_score != null && r.full_score ? Number(((r.avg_score / r.full_score) * 100).toFixed(1)) : null;
        }),
      })),
    };
  }, [allStats]);

  // 语文 vs 数学英语（语文任教视角）
  const chineseCompareOption = useMemo(() => {
    const pick = stats.filter((s) => ['语文', '数学', '英语'].includes(s.subject));
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: pick.map((s) => s.subject) },
      yAxis: { type: 'value', max: 100 },
      series: [
        { name: '均分', type: 'bar', data: pick.map((s) => (s.avg_score != null && s.full_score ? Number(((s.avg_score / s.full_score) * 100).toFixed(1)) : 0)), itemStyle: { color: CHART_INK.primary } },
        { name: '优秀率', type: 'bar', data: pick.map((s) => s.excellent_rate ?? 0), itemStyle: { color: CHART_INK.positive } },
        { name: '及格率', type: 'bar', data: pick.map((s) => s.pass_rate ?? 0), itemStyle: { color: CHART_INK.warn } },
      ],
    };
  }, [stats]);

  const stackedOption = useMemo(() => {
    const rows = allStats.filter((s) => s.subject === histSubject).sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1));
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: rows.map((r) => r.exam_date.slice(5)) },
      yAxis: { type: 'value' },
      series: SEG_KEYS.map((k, i) => ({
        name: SEG_LABELS[i],
        type: 'bar',
        stack: 'total',
        data: rows.map((r) => (r as any)[k] ?? 0),
        itemStyle: { color: HIST_COLORS[i] },
      })),
    };
  }, [allStats, histSubject]);

  const radarOption = useMemo(() => {
    const indicators = radar.map((r) => ({ name: r.subject, max: 100 }));
    const stuName = nameOf(radarStudent);
    return {
      tooltip: { trigger: 'item' },
      legend: { top: 0, data: [stuName, '班级均分'] },
      radar: {
        indicator: indicators,
        radius: '66%',
        center: ['50%', '56%'],
      },
      // 拆成两个 series：这样图例能分别显示，也才能把「班级均分」做成背景参照
      series: [
        {
          type: 'radar',
          name: stuName,
          symbolSize: 4,
          data: [{ value: radar.map((r) => r.pct), name: stuName }],
          areaStyle: { color: CHART_INK.primarySoft },
          lineStyle: { color: CHART_INK.primary, width: 2 },
          itemStyle: { color: CHART_INK.primary },
        },
        {
          // 参照系：灰色虚线、不填充，避免跟学生自己那条抢视觉
          type: 'radar',
          name: '班级均分',
          symbolSize: 3,
          data: [{ value: radar.map((r) => r.class_pct), name: '班级均分' }],
          lineStyle: { color: CHART_INK.neutral, width: 1.5, type: 'dashed' },
          itemStyle: { color: CHART_INK.neutral },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radar, radarStudent, students]);

  const studentTrendOption = useMemo(() => {
    const rows = progress
      .filter((p) => p.student_id === radarStudent)
      .sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1));
    const maxRank = Math.max(...rows.map((r) => r.rnk), 1) + 3;
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: rows.map((r) => r.exam_date.slice(5)) },
      yAxis: [
        { type: 'value', name: '均分' },
        { type: 'value', name: '班排', inverse: true, min: 1, max: maxRank },
      ],
      series: [
        {
          name: '均分',
          type: 'line',
          smooth: true,
          data: rows.map((r) => r.pct),
          itemStyle: { color: CHART_INK.positive },
                  },
        {
          name: '班内名次',
          type: 'bar',
          yAxisIndex: 1,
          data: rows.map((r) => r.rnk),
          itemStyle: { color: CHART_INK.primarySoft },
        },
      ],
    };
  }, [progress, radarStudent]);

  const { upList, downList } = useMemo(() => {
    if (progress.length === 0) return { upList: [] as { name: string; delta: number }[], downList: [] as { name: string; delta: number }[] };
    const latest = new Map<string, ProgressRow>();
    for (const p of progress) {
      const cur = latest.get(p.student_id);
      if (!cur || p.exam_date > cur.exam_date) latest.set(p.student_id, p);
    }
    const withDelta = [...latest.values()].filter((p) => p.rank_delta != null && p.rank_delta !== 0);
    const sorted = [...withDelta].sort((a, b) => (b.rank_delta ?? 0) - (a.rank_delta ?? 0));
    return {
      upList: sorted.filter((p) => (p.rank_delta ?? 0) > 0).slice(0, 5).map((p) => ({ name: nameOf(p.student_id), delta: p.rank_delta ?? 0 })),
      downList: sorted.filter((p) => (p.rank_delta ?? 0) < 0).slice(-5).reverse().map((p) => ({ name: nameOf(p.student_id), delta: p.rank_delta ?? 0 })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, students]);

  const rankBarOption = useMemo(
    () => ({
      tooltip: {},
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: upList.map((u) => u.name) },
      series: [{ type: 'bar', data: upList.map((u) => u.delta), itemStyle: { color: CHART_INK.positive }, label: { show: true, position: 'right', formatter: '+{c}' } }],
    }),
    [upList]
  );

  const downBarOption = useMemo(
    () => ({
      tooltip: {},
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: downList.map((d) => d.name) },
      series: [{ type: 'bar', data: downList.map((d) => d.delta), itemStyle: { color: CHART_INK.danger }, label: { show: true, position: 'left', formatter: '{c}' } }],
    }),
    [downList]
  );

  const dualOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: dual.map((d) => d.name) },
      yAxis: { type: 'value', max: 100 },
      series: [
        { name: '均分', type: 'bar', data: dual.map((d) => d.avg), itemStyle: { color: CHART_INK.primary } },
        { name: '优秀率', type: 'bar', data: dual.map((d) => d.excellent), itemStyle: { color: CHART_INK.positive } },
        { name: '及格率', type: 'bar', data: dual.map((d) => d.pass), itemStyle: { color: CHART_INK.warn } },
      ],
    }),
    [dual]
  );

  const statTable = (
    <Card>
      <h3 className="mb-1 text-sm font-bold text-slate-100">各科成绩统计</h3>
      <p className="mb-3 text-xs leading-5 text-slate-400">
        均分 / 中位数 / 最高 / 最低 / 标准差都是<b className="text-slate-300">原始分</b>
        （各科满分不同，见科目后的「/满分」）。
        优秀率 / 及格率按该科满分比例统计（优秀 ≥ 满分 90%，及格 ≥ 满分 60%）。悬停表头可查看指标含义。
      </p>
      {stats.length === 0 ? (
        <Empty text="暂无成绩数据" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="pb-2 pr-2">科目</th>
                <th className="pb-2 pr-2" title="实际交卷的人数（缺考不计入）">人数</th>
                <th className="pb-2 pr-2" title="全班平均分（原始分）">均分</th>
                <th className="pb-2 pr-2" title="成绩从高到低排序后，正中间那个人的分数——不受个别极端分影响，更能代表中间水平">中位数</th>
                <th className="pb-2 pr-2" title="本科最高分（原始分）">最高</th>
                <th className="pb-2 pr-2" title="本科最低分（原始分）">最低</th>
                <th className="pb-2 pr-2" title="分数波动大小：数值越大，说明学生之间差距越大（两极分化）">标准差</th>
                <th className="pb-2 pr-2" title="得分 ≥ 该科满分 90% 的学生占比">优秀率</th>
                <th className="pb-2 pr-2" title="得分 ≥ 该科满分 60% 的学生占比">及格率</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.subject} className="border-t border-slate-50 hover:bg-slate-800/60">
                  <td className={`py-1.5 pr-2 font-medium ${s.subject === '语文' ? 'text-brand-300' : ''}`}>
                    {s.subject}
                    <span className="ml-0.5 text-[10px] font-normal text-slate-500">/{s.full_score}</span>
                    {s.subject === '语文' && ' ★'}
                  </td>
                  <td className="py-1.5 pr-2">{s.student_count}</td>
                  <td className="py-1.5 pr-2">{s.avg_score ?? '—'}</td>
                  <td className="py-1.5 pr-2">{s.median_score ?? '—'}</td>
                  <td className="py-1.5 pr-2">{s.max_score ?? '—'}</td>
                  <td className="py-1.5 pr-2">{s.min_score ?? '—'}</td>
                  <td className="py-1.5 pr-2">{s.stddev_score ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-green-300">{s.excellent_rate ?? 0}%</td>
                  <td className="py-1.5 pr-2">{s.pass_rate ?? 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  const crossTable = stats.length > 0 && (
    <Card>
      <h3 className="mb-1 text-sm font-bold text-slate-100">分数段分布（人数 / 占比）</h3>
      <p className="mb-2 text-xs text-slate-400">
        各科按自己满分的比例分段：60% 以下不及格（红色预警）、60-70% 及格边缘、70-80% 中等、80-90% 良好、90% 以上优秀。
        例如语文满分 150：不及格 = 90 分以下。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="pb-2 pr-2">科目（满分）</th>
              <th className="pb-2 pr-2" title="低于满分的 60%">60% 以下</th>
              <th className="pb-2 pr-2" title="满分的 60%~70%">60-70%</th>
              <th className="pb-2 pr-2" title="满分的 70%~80%">70-80%</th>
              <th className="pb-2 pr-2" title="满分的 80%~90%">80-90%</th>
              <th className="pb-2 pr-2" title="不低于满分的 90%">≥90%</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.subject} className="border-t border-slate-50">
                <td className="py-1.5 pr-2 font-medium">
                  {s.subject}
                  <span className="ml-1 text-[10px] text-slate-500">/{s.full_score}</span>
                </td>
                {SEG_KEYS.map((k) => {
                  const n = (s as any)[k] ?? 0;
                  const pct = s.student_count ? Math.round((n / s.student_count) * 100) : 0;
                  return (
                    <td key={k} className="py-1.5 pr-2 text-slate-500">
                      {n}
                      <span className="ml-1 text-[10px] text-slate-500">{pct}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* 视角切换（任教班只看语文，无需切换） */}
      {!isRenjiao && (
        <div className="flex gap-1.5">
          {(
            [
              ['all', '班级全科'],
              ['chinese', '语文任教'],
            ] as ['all' | 'chinese', string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                view === v ? 'bg-brand-700 text-white' : 'bg-slate-800 text-slate-400 shadow-card hover:text-brand-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {view === 'all' ? (
        <>
          {statTable}
          {crossTable}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">分数段分布</h3>
                <Select value={histSubject} onChange={(e) => setHistSubject(e.target.value)} className="w-24">
                  {subjects.map((s) => (
                    <option key={s.subject} value={s.subject}>
                      {s.subject}
                    </option>
                  ))}
                </Select>
              </div>
              {histRow ? <Chart option={histOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">各科均分对比</h3>
              {stats.length > 0 ? <Chart option={avgOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">优秀率 / 及格率</h3>
              {stats.length > 0 ? <Chart option={passRateOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">班级总得分率走势（%）</h3>
              {trend.length > 0 ? <Chart option={trendOption} height={230} /> : <Empty text="需要至少两次考试" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">各科得分率走势（%，语文加粗）</h3>
              {allStats.length > 0 ? <Chart option={subjectTrendOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">分数段构成变化（{histSubject}）</h3>
                <Select value={histSubject} onChange={(e) => setHistSubject(e.target.value)} className="w-24">
                  {subjects.map((s) => (
                    <option key={s.subject} value={s.subject}>
                      {s.subject}
                    </option>
                  ))}
                </Select>
              </div>
              {allStats.some((s) => s.subject === histSubject) ? <Chart option={stackedOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">学生雷达图（偏科一眼看清）</h3>
                <Select value={radarStudent} onChange={(e) => setRadarStudent(e.target.value)} className="w-28">
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              {radar.length > 0 ? <Chart option={radarOption} height={250} /> : <Empty text="该生暂无成绩" />}
            </Card>

            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">个人走势（均分 + 名次）</h3>
                <Select value={radarStudent} onChange={(e) => setRadarStudent(e.target.value)} className="w-28">
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              {progress.some((p) => p.student_id === radarStudent) ? (
                <Chart option={studentTrendOption} height={230} />
              ) : (
                <Empty text="该生暂无历次成绩" />
              )}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">进步榜 / 退步榜（最近考试）</h3>
              {upList.length > 0 || downList.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-center text-xs font-medium text-emerald-300">进步 TOP5</div>
                    {upList.length > 0 ? <Chart option={rankBarOption} height={180} /> : <Empty text="本次无进步学生" />}
                  </div>
                  <div>
                    <div className="mb-1 text-center text-xs font-medium text-red-500">退步 TOP5</div>
                    {downList.length > 0 ? <Chart option={downBarOption} height={180} /> : <Empty text="本次无退步学生" />}
                  </div>
                </div>
              ) : (
                <Empty text="需要两次以上考试数据" />
              )}
            </Card>
          </div>

          {/* 偏科预警 */}
          <Card>
            <h3 className="mb-2 text-sm font-bold text-slate-100">偏科预警（单科低于个人均分 ≥15 分）</h3>
            {gaps.length === 0 ? (
              <Empty text="暂无偏科预警" emoji="✅" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="pb-2 pr-2">学生</th>
                      <th className="pb-2 pr-2">科目</th>
                      <th className="pb-2 pr-2">个人得分率</th>
                      <th className="pb-2 pr-2">该科得分率</th>
                      <th className="pb-2">差距</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((g, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-1.5 pr-2 font-medium">{nameOf(g.student_id)}</td>
                        <td className="py-1.5 pr-2">{g.subject}</td>
                        <td className="py-1.5 pr-2">{g.avg_pct}</td>
                        <td className="py-1.5 pr-2">{g.pct}</td>
                        <td className="py-1.5">
                          <Badge className="bg-red-500/10 text-red-300">-{g.gap} 分</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          {/* 语文任教视角 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">语文分数段分布</h3>
              {histRow ? <Chart option={histOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">语文 vs 数学英语（均分/优秀率/及格率）</h3>
              {stats.some((s) => s.subject === '语文') ? <Chart option={chineseCompareOption} height={230} /> : <Empty text="暂无数据" />}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">
                语文得分率走势（%）
                {(() => {
                  const f = allStats.find((x) => x.subject === '语文')?.full_score;
                  return f ? <span className="ml-2 text-xs font-normal text-slate-400">满分 {f}，按原始分展示</span> : null;
                })()}
              </h3>
              {allStats.some((s) => s.subject === '语文') ? (
                <Chart
                  option={{
                    tooltip: { trigger: 'axis' },
                                  xAxis: { type: 'category', data: allStats.filter((s) => s.subject === '语文').map((s) => s.exam_date.slice(5)) },
                    yAxis: { type: 'value' },
                    series: [
                      {
                        type: 'line',
                        smooth: true,
                        data: allStats
                          .filter((s) => s.subject === '语文')
                          .map((s) => (s.avg_score != null && s.full_score ? Number((s.avg_score).toFixed(1)) : null)),
                        itemStyle: { color: CHART_INK.primary },
                        lineStyle: { width: 3, color: CHART_INK.primary },
                                              },
                    ],
                  }}
                  height={230}
                />
              ) : (
                <Empty text="暂无数据" />
              )}
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-bold text-slate-100">任教班语文对比（最新考试）</h3>
              {dual.length > 1 ? <Chart option={dualOption} height={230} /> : <Empty text="教多个班后自动对比" />}
            </Card>
          </div>

          {stats.find((s) => s.subject === '语文') && (
            <Card>
              <h3 className="mb-3 text-sm font-bold text-slate-100">语文统计</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="pb-2 pr-2">人数</th>
                    <th className="pb-2 pr-2">均分</th>
                    <th className="pb-2 pr-2">中位数</th>
                    <th className="pb-2 pr-2">最高</th>
                    <th className="pb-2 pr-2">最低</th>
                    <th className="pb-2 pr-2">标准差</th>
                    <th className="pb-2 pr-2">优秀率</th>
                    <th className="pb-2">及格率</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-50">
                    {(() => {
                      const s = stats.find((x) => x.subject === '语文')!;
                      return [s.student_count, s.avg_score, s.median_score, s.max_score, s.min_score, s.stddev_score, `${s.excellent_rate ?? 0}%`, `${s.pass_rate ?? 0}%`].map((v, i) => (
                        <td key={i} className="py-1.5 pr-2">
                          {v ?? '—'}
                        </td>
                      ));
                    })()}
                  </tr>
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
