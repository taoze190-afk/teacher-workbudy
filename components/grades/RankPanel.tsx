'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import type { ExamSubject, Student } from '@/lib/types';
import { Card, Empty, Select, Button } from '@/components/ui';
import { cn, downloadText } from '@/lib/utils';
import { computeRanking } from '@/lib/rank';

interface Props {
  students: Student[];
  subjects: ExamSubject[];
  /** 来自成绩录入页的本地映射：`${studentId}|${subject}` → 分数文本（'缺考' 表示缺考） */
  scores: Record<string, string>;
  examName?: string;
}

interface RankRow {
  id: string;
  name: string;
  no: string;
  per: Record<string, number | null>;
  absent: string[];
  blank: string[];
  total: number;
  pct: number | null;
  rank: number;
}

const medal = (rank: number) =>
  rank === 1
    ? 'bg-amber-500/15 text-amber-300'
    : rank === 2
    ? 'bg-slate-400/15 text-slate-300'
    : rank === 3
    ? 'bg-orange-500/15 text-orange-300'
    : 'bg-slate-800/60 text-slate-400';

export default function RankPanel({ students, subjects, scores, examName }: Props) {
  // total | pct | sub:科目名
  const [sortBy, setSortBy] = useState('total');

  const rows = useMemo<RankRow[]>(
    () => computeRanking(students, subjects, scores, sortBy) as RankRow[],
    [students, subjects, scores, sortBy]
  );

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.pct != null);
    if (scored.length === 0) return null;
    const totals = scored.map((r) => r.total);
    const fullTotal = subjects.reduce((s, x) => s + (Number(x.full_score) || 0), 0);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    // 及格率按「总分达到满分 60%」计算（不再用折合分）
    const passCnt = scored.filter((r) => r.total >= fullTotal * 0.6).length;
    return {
      fullTotal,
      count: scored.length,
      avg: Math.round(avg * 10) / 10,
      max: Math.max(...totals),
      min: Math.min(...totals),
      passCnt,
      passRate: Math.round((passCnt / scored.length) * 100),
      absentCnt: rows.filter((r) => r.absent.length > 0).length,
      blankCnt: rows.filter((r) => r.blank.length > 0).length,
    };
  }, [rows, subjects]);

  const exportCsv = () => {
    const head = [
      '名次',
      '学号',
      '姓名',
      ...subjects.map((s) => `${s.subject}(满分${s.full_score})`),
      '总分',
    ];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.rank,
          r.no,
          r.name,
          ...subjects.map((s) =>
            r.per[s.subject] != null ? String(r.per[s.subject]) : r.absent.includes(s.subject) ? '缺考' : ''
          ),
          r.total,
        ].join(',')
      );
    }
    // BOM：让 Excel 正确识别 UTF-8 中文
    downloadText(`成绩排名-${examName ?? '考试'}.csv`, '\ufeff' + lines.join('\n'), 'text/csv');
  };

  if (subjects.length === 0) {
    return (
      <Card>
        <Empty text="本场考试还没有配置科目，无法排名" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">全班成绩排名</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              名次按<b className="text-slate-300">总分</b>（各科原始分相加）计算，同分并列；
              也可以切换成按某一单科排名（单科名次对抓科最有用）。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-40">
              <option value="total">按总分排名</option>
              {subjects.map((s) => (
                <option key={s.subject} value={`sub:${s.subject}`}>
                  按{s.subject}排名
                </option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download size={14} /> 导出 Excel
            </Button>
          </div>
        </div>

        {summary && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['参与人数', `${summary.count} 人`],
              ['班级总分均分', `${summary.avg} / ${summary.fullTotal}`],
              ['最高总分', String(summary.max)],
              ['最低总分', String(summary.min)],
              ['及格率', `${summary.passRate}%（${summary.passCnt} 人）`],
              ['异常情况', `${summary.absentCnt} 人缺考 · ${summary.blankCnt} 人未录全`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-800/60 px-2.5 py-2">
                <div className="text-[11px] text-slate-500">{k}</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-slate-100" title={v}>
                  {v}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="overflow-x-auto">
          {/* 填满容器 + 列宽均匀：名次/姓名/总分各占一个窄比例，
              剩下的宽度由各科目列等分 —— 这样列与列的间隔是均匀的，
              空白不会全部堆在姓名和科目之间。必须配 table-fixed，
              否则浏览器仍会按内容重新分配列宽。 */}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              {/* 名次列必须给固定宽度：姓名列是 sticky 的，它的 left 偏移量得是确定值 */}
              <col style={{ width: '4rem' }} />
              <col style={{ width: '13%' }} />
              {subjects.map((s) => (
                <col key={s.subject} />
              ))}
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-800 pb-2 pr-2">名次</th>
                <th className="sticky left-16 z-10 bg-slate-800 pb-2 pr-2">姓名</th>
                {subjects.map((s) => (
                  <th key={s.subject} className="pb-2 pr-2 text-center" title={`满分 ${s.full_score}`}>
                    {s.subject}
                  </th>
                ))}
                <th className="pb-2 pr-2 text-right">总分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-800/60">
                  <td className="sticky left-0 z-10 w-14 bg-slate-800 py-1.5 pr-2">
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-[1.6rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold',
                        medal(r.rank)
                      )}
                    >
                      {r.rank}
                    </span>
                  </td>
                  <td className="sticky left-16 z-10 bg-slate-800 py-1.5 pr-2">
                    <Link
                      href={`/students/detail?id=${r.id}`}
                      className="font-medium text-slate-100 hover:text-brand-400"
                    >
                      {r.name}
                    </Link>
                    <span className="ml-1.5 text-[10px] text-slate-500">{r.no}</span>
                  </td>
                  {subjects.map((s) => {
                    const v = r.per[s.subject];
                    const isAbsent = r.absent.includes(s.subject);
                    return (
                      <td
                        key={s.subject}
                        className={cn(
                          'py-1.5 pr-2 text-center tabular-nums',
                          v == null ? 'text-slate-500' : 'text-slate-300',
                          v != null && s.full_score > 0 && v >= s.full_score * 0.9 && 'font-semibold text-emerald-300',
                          v != null && s.full_score > 0 && v < s.full_score * 0.6 && 'text-amber-300'
                        )}
                        title={isAbsent ? '缺考' : v == null ? '未录入' : undefined}
                      >
                        {v != null ? v : isAbsent ? '缺考' : '—'}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-100">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          绿色为达到该科满分 90%（优秀），琥珀色为低于满分 60%（不及格）。
          「缺考」按 0 分计入总分，名次会受影响，可先取消缺考标记再核对。
        </p>
      </Card>
    </div>
  );
}
