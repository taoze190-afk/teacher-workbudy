'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Save } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { HomeworkRecord, Student } from '@/lib/types';
import { DEFAULT_SUBJECTS } from '@/lib/constants';
import { Badge, Button, Card, CardTitle, Empty, Input, Loading, PageHeader, Select } from '@/components/ui';
import { cn, compareStudentNo, today } from '@/lib/utils';

const HW_TYPES = ['日常', '周末', '寒暑假'] as const;

export default function HomeworkPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [subject, setSubject] = useState(DEFAULT_SUBJECTS[0]);
  const [hwType, setHwType] = useState<string>('日常');
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({}); // studentId -> 已交/未交/补交/优秀
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dayStats, setDayStats] = useState<{ subject: string; 未交: number; 优秀: number; 已交: number; total: number }[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    getSupabase()
      .from('students')
      .select('id,name,student_no,gender')
      .eq('class_id', currentClassId)
      .is('deleted_at', null)
      .eq('active', true)
      .order('student_no')
      .then(({ data }) => {
        setStudents([...((data ?? []) as unknown as Student[])].sort((a: any, b: any) => compareStudentNo(a.student_no, b.student_no)));
        setLoading(false);
      });
  }, [currentClassId, tick]);

  // 加载该日期该科目该类型已登记状态
  useEffect(() => {
    if (!currentClassId || !date) return;
    getSupabase()
      .from('homework_records')
      .select('student_id,status,note')
      .eq('class_id', currentClassId)
      .eq('date', date)
      .eq('subject', subject)
      .eq('hw_type', hwType)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as HomeworkRecord[]) {
          m[r.student_id] = r.status;
        }
        setStatus(m);
      });
  }, [currentClassId, date, subject, hwType, tick]);

  // 当天各科统计（未交/优秀/已交）
  useEffect(() => {
    if (!currentClassId || !date) return;
    getSupabase()
      .from('homework_records')
      .select('subject,status')
      .eq('class_id', currentClassId)
      .eq('date', date)
      .then(({ data }) => {
        const rows = (data ?? []) as HomeworkRecord[];
        const agg = new Map<string, { 未交: number; 优秀: number; 已交: number; total: number }>();
        for (const r of rows) {
          const a = agg.get(r.subject) ?? { 未交: 0, 优秀: 0, 已交: 0, total: 0 };
          a.total++;
          if (r.status === '未交') a.未交++;
          else if (r.status === '优秀') a.优秀++;
          else if (r.status === '已交') a.已交++;
          agg.set(r.subject, a);
        }
        setDayStats(
          [...agg.entries()].map(([subject, a]) => ({ subject, ...a })).sort((x, y) => y.未交 - x.未交)
        );
      });
  }, [currentClassId, date, tick]);

  const setSt = (id: string, st: string) => {
    setStatus((p) => ({ ...p, [id]: p[id] === st ? '已交' : st }));
  };

  const markAll = (target: '未交' | '已交' | '优秀') => {
    setStatus((prev) => {
      const next: Record<string, string> = {};
      for (const s of students) next[s.id] = prev[s.id] ?? '已交';
      if (target === '已交') return Object.fromEntries(students.map((s) => [s.id, '已交']));
      for (const s of students) next[s.id] = target;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const sb = getSupabase();
    await sb
      .from('homework_records')
      .delete()
      .eq('class_id', currentClassId)
      .eq('date', date)
      .eq('subject', subject)
      .eq('hw_type', hwType);
    const inserts = students
      .filter((s) => status[s.id] && status[s.id] !== '已交')
      .map((s) => ({ class_id: currentClassId, student_id: s.id, date, subject, hw_type: hwType, status: status[s.id] }));
    if (inserts.length > 0) {
      const { error } = await sb.from('homework_records').insert(inserts);
      if (error) {
        alert('保存失败：' + error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    toast(`作业已保存（${subject} · ${hwType}）`);
    reload();
  };

  const counts = useMemo(() => {
    let 未交 = 0,
      优秀 = 0,
      补交 = 0;
    for (const s of students) {
      const st = status[s.id] ?? '已交';
      if (st === '未交') 未交++;
      else if (st === '优秀') 优秀++;
      else if (st === '补交') 补交++;
    }
    return { 未交, 优秀, 补交, 已交: students.length - 未交 - 优秀 - 补交 };
  }, [students, status]);

  if (loading) return <Loading />;

  const chipCls = (active: boolean) =>
    cn(
      'rounded-lg px-2 py-1 text-xs font-medium transition-colors',
      active ? 'text-white shadow-card' : 'text-slate-400 hover:bg-slate-700/60'
    );

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📝"
        title="作业收交"
        subtitle="先选类型（日常/周末/寒暑假），再在每名学生上点选状态"
        color={{ chip: 'bg-orange-500/15 text-orange-300', soft: 'bg-orange-500/10', text: 'text-orange-300' }}
      >
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Select value={hwType} onChange={(e) => setHwType(e.target.value)} className="w-28">
          {HW_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}作业
            </option>
          ))}
        </Select>
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-28">
          {DEFAULT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={saving} onClick={save}>
          <Save size={14} /> {saving ? '保存中…' : '保存'}
        </Button>
      </PageHeader>

      {/* 数量统计 */}
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ['已交', counts.已交, 'bg-emerald-500/15 text-emerald-300'],
            ['未交', counts.未交, 'bg-red-500/15 text-red-300'],
            ['补交', counts.补交, 'bg-orange-500/15 text-orange-300'],
            ['优秀', counts.优秀, 'bg-amber-500/15 text-amber-300'],
          ] as const
        ).map(([label, v, color]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-700/60 bg-slate-800 px-3 py-2.5 shadow-card">
            <span className={cn('text-xl font-extrabold', color)}>{v}</span>
            <span className="text-xs text-slate-400">{label} · {students.length} 人</span>
          </div>
        ))}
      </div>

      <Card>
        <CardTitle
          right={
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => markAll('已交')}>
                全部已交
              </Button>
              <Button variant="outline" size="sm" className="text-red-500" onClick={() => markAll('未交')}>
                全部未交
              </Button>
            </div>
          }
        >
          {date} · {hwType} · {subject}
        </CardTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {students.map((s) => {
            const st = status[s.id] ?? '已交';
            return (
              <div
                key={s.id}
                className={cn(
                  'rounded-xl border p-2 transition-colors',
                  st === '未交'
                    ? 'border-red-500/40 bg-red-500/10'
                    : st === '优秀'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-slate-700'
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="truncate text-sm font-semibold text-slate-200">{s.name}</span>
                  <span className="text-[10px] text-slate-400">{s.student_no}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => setSt(s.id, '未交')}
                    className={cn(chipCls(st === '未交'), st === '未交' && 'bg-red-500')}
                  >
                    未交
                  </button>
                  <button
                    onClick={() => setSt(s.id, '补交')}
                    className={cn(chipCls(st === '补交'), st === '补交' && 'bg-orange-500')}
                  >
                    补交
                  </button>
                  <button
                    onClick={() => setSt(s.id, '优秀')}
                    className={cn(chipCls(st === '优秀'), st === '优秀' && 'bg-amber-500')}
                  >
                    优秀
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 当日各科统计 */}
      <Card accent="bg-orange-400">
        <CardTitle dot="bg-orange-400" right={<BarChart3 size={16} className="text-slate-500" />}>
          {date} 各科收交统计（仅已登记科目）
        </CardTitle>
        {dayStats.length === 0 ? (
          <Empty text="今天还没有登记任何科目" />
        ) : (
          <div className="space-y-2">
            {dayStats.map((d) => (
              <div key={d.subject} className="flex items-center gap-3 text-sm">
                <span className="w-12 font-medium">{d.subject}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                  <div className="flex h-full">
                    <div className="bg-emerald-400" style={{ width: `${(d.已交 / Math.max(d.total, 1)) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(d.未交 / Math.max(d.total, 1)) * 100}%` }} />
                    <div className="bg-amber-300" style={{ width: `${(d.优秀 / Math.max(d.total, 1)) * 100}%` }} />
                  </div>
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-slate-400">
                  已交{d.已交} · 未交 <b className="text-red-500">{d.未交}</b> · 优秀{d.优秀}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {counts.未交 > 0 && (
        <Card>
          <CardTitle>未交名单</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {students
              .filter((s) => (status[s.id] ?? '已交') === '未交')
              .map((s) => (
                <Badge key={s.id} className="bg-red-500/15 text-red-300">
                  {s.name}
                </Badge>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
