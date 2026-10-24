'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import type { ExamSubject, GradeRecord, Student } from '@/lib/types';
import { Badge, Card, Empty, Input, Loading, Select } from '@/components/ui';
import { cn, compareStudentNo } from '@/lib/utils';

interface Row {
  id: string;
  name: string;
  no: string;
  /** 各科原始分（缺考 / 未录 = 无此项） */
  raw: Record<string, number>;
  /** 总分（原始分相加） */
  total: number;
  /** 各科折合百分制，仅用于找"拖后腿"的科目 */
  per: Record<string, number>;
  rank: number;
  weak: { subject: string; pct: number } | null;
}

const BANDS = [3, 5, 10];
const TOTAL = '__total__';

export default function CriticalPanel({ examId }: { examId: string }) {
  const { currentClassId } = useClass();
  const [rows, setRows] = useState<Row[]>([]);
  const [subs, setSubs] = useState<ExamSubject[]>([]);
  const [loading, setLoading] = useState(true);
  /** 判定依据：某个科目名，或 TOTAL（总分） */
  const [basis, setBasis] = useState('');
  /** 及格线 / 优秀线：直接填分数，不做百分比换算 */
  const [passLine, setPassLine] = useState(60);
  const [excLine, setExcLine] = useState(90);
  const [rankN, setRankN] = useState(30);
  const [band, setBand] = useState(10);

  const single = subs.length === 1 ? subs[0] : null;
  const fmt = (n: number) => String(Math.round(n * 10) / 10);

  const fullOf = (subject: string) => Number(subs.find((s) => s.subject === subject)?.full_score) || 100;
  const totalFull = subs.reduce((n, s) => n + (Number(s.full_score) || 0), 0);
  /** 当前判定依据的满分 */
  const basisFull = basis === TOTAL ? totalFull : fullOf(basis);
  const basisLabel = basis === TOTAL ? '总分' : basis;

  useEffect(() => {
    if (!currentClassId || !examId) return;
    setLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true),
      sb.from('exam_subjects').select('*').eq('exam_id', examId),
      sb.from('grade_records').select('*').eq('exam_id', examId),
    ]).then(([st, sub, gr]) => {
      const subjectRows = (sub.data ?? []) as ExamSubject[];
      setSubs(subjectRows);
      const full = new Map(subjectRows.map((s) => [s.subject, Number(s.full_score) || 0]));
      const students = (st.data ?? []) as unknown as Student[];

      // student_id → 各科原始分 / 折合分
      const rawMap = new Map<string, Record<string, number>>();
      const perMap = new Map<string, Record<string, number>>();
      for (const r of (gr.data ?? []) as GradeRecord[]) {
        if (r.is_absent || r.score == null) continue;
        const f = full.get(r.subject);
        if (!f || f <= 0) continue;
        if (!rawMap.has(r.student_id)) rawMap.set(r.student_id, {});
        if (!perMap.has(r.student_id)) perMap.set(r.student_id, {});
        rawMap.get(r.student_id)![r.subject] = r.score;
        perMap.get(r.student_id)![r.subject] = (r.score / f) * 100;
      }

      const list: Row[] = [];
      for (const s of students) {
        const raw = rawMap.get(s.id);
        if (!raw) continue;
        const per = perMap.get(s.id) ?? {};
        const vals = Object.values(per);
        if (vals.length === 0) continue;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        // 拖后腿的科目：折合分最低、且低于本人平均
        let weak: { subject: string; pct: number } | null = null;
        for (const [subject, v] of Object.entries(per)) {
          if (v >= avg) continue;
          if (!weak || v < weak.pct) weak = { subject, pct: v };
        }
        list.push({
          id: s.id,
          name: s.name,
          no: s.student_no,
          raw,
          total: Math.round(Object.values(raw).reduce((a, b) => a + b, 0) * 10) / 10,
          per,
          rank: 0,
          weak,
        });
      }
      list.sort((a, b) => b.total - a.total || compareStudentNo(a.no, b.no));
      list.forEach((r, i) => (r.rank = i + 1));
      setRows(list);
      setLoading(false);
    });
  }, [currentClassId, examId]);

  // 判定依据：单科考试直接锁定该科；多科考试默认第一科（可切到总分或任意科目）
  useEffect(() => {
    if (subs.length === 0) return;
    setBasis((p) => (p && (p === TOTAL || subs.some((s) => s.subject === p)) ? p : subs[0].subject));
  }, [subs]);

  // 切换判定依据时给一组好用的默认线（满分的 60% / 90% 取整），之后可以随便改成分数
  useEffect(() => {
    if (!basis) return;
    const full = basis === TOTAL ? totalFull : fullOf(basis);
    setPassLine(Math.round(full * 0.6));
    setExcLine(Math.round(full * 0.9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, subs]);

  /** 某个学生在当前判定依据下的分数 */
  const scoreOf = (r: Row): number | null => (basis === TOTAL ? r.total : r.raw[basis] ?? null);

  const makeList = (line: number) =>
    rows
      .filter((r) => {
        const v = scoreOf(r);
        return v != null && v >= line - band && v < line;
      })
      .sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const passList = useMemo(() => makeList(passLine), [rows, passLine, band, basis]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const excellentList = useMemo(() => makeList(excLine), [rows, excLine, band, basis]);
  // 只取目标线之外的学生：第 28 名不该出现在"冲进前 30"的名单里
  const nearRank = useMemo(
    () => rows.filter((r) => r.rank > rankN && r.rank <= rankN + 5).sort((a, b) => a.rank - b.rank),
    [rows, rankN]
  );

  if (loading) return <Loading />;

  const hitCount = passList.length + excellentList.length + nearRank.length;

  const renderList = (
    icon: string,
    title: string,
    desc: string,
    items: Row[],
    badgeTone: string,
    badgeText: (r: Row) => string
  ) => (
    <Card>
      <h3 className="text-sm font-semibold text-slate-100">
        {icon} {title}
        <span className="ml-1.5 text-xs font-normal text-slate-500">{items.length} 人</span>
      </h3>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{desc}</p>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg bg-slate-800/60 px-3 py-4 text-center text-xs text-slate-500">暂无</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-2.5 py-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/students/detail?id=${r.id}`}
                  className="text-sm font-medium text-slate-100 hover:text-brand-400"
                >
                  {r.name}
                </Link>
                <span className="ml-1.5 text-[10px] text-slate-500">
                  {basisLabel} {fmt(scoreOf(r) ?? 0)} · 班排 {r.rank}
                </span>
                {r.weak && (
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">
                    拖后腿：<span className="text-amber-300">{r.weak.subject}</span>
                  </div>
                )}
              </div>
              <Badge className={cn('shrink-0', badgeTone)}>{badgeText(r)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* 说明 + 阈值 */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-100">🎯 临界生 = 再努一把就能上线的学生</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          班里最值得投入精力的往往不是尖子生，而是<b className="text-slate-300">卡在线边上的那几个人</b>：
          差几分就及格、差几分就优秀、名次吊在目标线外面几名。抓这几个人，提分见效最快。
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-xs text-slate-400">
            按哪一项判定
            {single ? (
              <div className="mt-0.5 flex h-9 items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 text-sm text-slate-200">
                {single.subject}
                <span className="text-xs text-slate-500">满分 {single.full_score}</span>
              </div>
            ) : (
              <Select
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                className="mt-0.5 w-44"
                title="选择按哪个科目（或总分）判断临界"
              >
                {subs.map((s) => (
                  <option key={s.subject} value={s.subject}>
                    {s.subject}（满分 {s.full_score}）
                  </option>
                ))}
                <option value={TOTAL}>总分（满分 {totalFull}）</option>
              </Select>
            )}
          </label>

          <label className="block text-xs text-slate-400">
            及格线（分）
            <Input
              type="number"
              value={passLine}
              min={0}
              max={basisFull}
              onChange={(e) => setPassLine(Math.max(0, Number(e.target.value) || 0))}
              className="mt-0.5 w-24 text-center"
            />
          </label>
          <label className="block text-xs text-slate-400">
            优秀线（分）
            <Input
              type="number"
              value={excLine}
              min={0}
              max={basisFull}
              onChange={(e) => setExcLine(Math.max(0, Number(e.target.value) || 0))}
              className="mt-0.5 w-24 text-center"
            />
          </label>
          <label className="block text-xs text-slate-400">
            排名目标
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-xs text-slate-500">前</span>
              <Input
                type="number"
                value={rankN}
                min={1}
                onChange={(e) => setRankN(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 text-center"
              />
              <span className="text-xs text-slate-500">名</span>
            </div>
          </label>
          <div className="text-xs text-slate-400">
            临界范围
            <div className="mt-0.5 flex gap-1">
              {BANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBand(b)}
                  className={cn(
                    'rounded-lg px-2.5 py-2 text-xs transition-colors',
                    band === b
                      ? 'bg-brand-500/15 font-medium text-brand-300'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-100'
                  )}
                >
                  差 {b} 分内
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-2.5 text-[11px] leading-5 text-slate-500">
          按 <b className="text-slate-400">{basisLabel}</b>（满分 {basisFull}）的
          <b className="text-slate-400">原始分</b>判断：及格线 {passLine} 分、优秀线 {excLine} 分 ——
          这两个数字可以直接改成你习惯的分数线。
          {single ? '' : ' 多科考试各科满分不同，所以先选一个判定科目，或直接按总分判。'}
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <Empty text="本场考试还没有录入成绩" />
        </Card>
      ) : (
        <>
          {hitCount === 0 && (
            <Card>
              <p className="text-center text-sm text-slate-400">
                按当前设置没有找到临界生。可以把「临界范围」放宽到「差 10 分内」，或调整及格线 / 优秀线。
              </p>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {renderList(
              '①',
              '待及格',
              `${basisLabel}在 ${passLine - band} ~ ${passLine} 分之间（差 ${band} 分内及格）`,
              passList,
              'bg-amber-500/15 text-amber-300',
              (r) => `还差 ${fmt(passLine - (scoreOf(r) ?? 0))} 分`
            )}
            {renderList(
              '②',
              '冲优秀',
              `${basisLabel}在 ${excLine - band} ~ ${excLine} 分之间（差 ${band} 分内达优）`,
              excellentList,
              'bg-emerald-500/15 text-emerald-300',
              (r) => `还差 ${fmt(excLine - (scoreOf(r) ?? 0))} 分`
            )}
            {renderList(
              '③',
              '冲名次',
              `总分班排在第 ${rankN} 名之后、${rankN + 5} 名之前 —— 只差几名进前列`,
              nearRank,
              'bg-brand-500/15 text-brand-300',
              (r) => `进前 ${rankN} 差 ${r.rank - rankN} 名`
            )}
          </div>

          <p className="text-[11px] leading-5 text-slate-500">
            💡 用法：把这三个名单作为本周辅导 / 谈心 / 联系家长的重点；「拖后腿」那一科就是最该补的。
            也可以在「学习小组」里给临界生安排帮扶结对。
          </p>
        </>
      )}
    </div>
  );
}
