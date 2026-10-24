'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dices } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import type { RandomPickLog, Student } from '@/lib/types';
import { Button, Card, Empty, Loading, PageHeader } from '@/components/ui';
import { cn, today } from '@/lib/utils';

export default function ToolsPage() {
  const { currentClassId } = useClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [pool, setPool] = useState<Student[]>([]); // 当前可点名单
  const [last, setLast] = useState<Student | null>(null);
  const [pickedToday, setPickedToday] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb.from('students').select('id,name,student_no').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no'),
      sb.from('random_pick_logs').select('student_id').eq('class_id', currentClassId).eq('pick_date', today()),
    ]).then(([st, lg]) => {
      const list = (st.data ?? []) as Student[];
      setStudents(list);
      const done = new Set(((lg.data ?? []) as unknown as RandomPickLog[]).map((r) => r.student_id));
      setPickedToday(done);
      setPool(list.filter((s) => !done.has(s.id)));
      setLoading(false);
    });
  }, [currentClassId]);

  const resetPool = () => {
    setPool(students);
    setPickedToday(new Set());
    void getSupabase().from('random_pick_logs').delete().eq('class_id', currentClassId).eq('pick_date', today());
  };

  const pick = () => {
    if (pool.length === 0) return;
    setAnimating(true);
    let n = 0;
    const timer = setInterval(() => {
      setLast(pool[Math.floor(Math.random() * pool.length)]);
      n++;
      if (n >= 12) {
        clearInterval(timer);
        const winner = pool[Math.floor(Math.random() * pool.length)];
        setLast(winner);
        setPool((p) => p.filter((s) => s.id !== winner.id));
        setPickedToday((prev) => new Set(prev).add(winner.id));
        void getSupabase().from('random_pick_logs').insert({
          class_id: currentClassId,
          pick_date: today(),
          student_id: winner.id,
        });
        setAnimating(false);
      }
    }, 60);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🎲"
        title="课堂工具 · 随机点名"
        subtitle="当天不重复点名，点完自动进入下一轮"
        color={{ chip: 'bg-fuchsia-500/15 text-fuchsia-300', soft: 'bg-fuchsia-500/10', text: 'text-fuchsia-300' }}
      />

      <Card className="flex flex-col items-center gap-4 py-8">
        <div
          key={last?.id ?? 'empty'}
          className={cn(
            'flex h-44 w-44 items-center justify-center rounded-full text-center text-4xl font-bold text-white shadow-float',
            last
              ? 'bg-gradient-to-br from-brand-500 via-fuchsia-500 to-rose-500'
              : 'bg-slate-700 text-slate-400'
          )}
          style={last ? { animation: 'pop .35s ease' } : undefined}
        >
          {last ? (
            <div>
              <div className="text-2xl">🎉</div>
              <div className="mt-1">{last.name}</div>
              <div className="mt-1 text-sm font-normal opacity-80">{last.student_no}</div>
            </div>
          ) : (
            <Dices size={56} />
          )}
        </div>

        <Button size="lg" disabled={pool.length === 0 || animating} onClick={pick} className="w-48">
          {animating ? '抽取中…' : pool.length === 0 ? '本轮已点完' : '随机点名'}
        </Button>

        <div className="text-sm text-slate-400">
          剩余可点 <span className="font-semibold text-brand-300">{pool.length}</span> 人 · 今天已点{' '}
          <span className="font-semibold text-slate-200">{pickedToday.size}</span> 人
        </div>

        {pickedToday.size > 0 && (
          <div className="w-full">
            <div className="mb-1.5 text-xs text-slate-400">今天已点过的学生</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {students
                .filter((s) => pickedToday.has(s.id))
                .map((s) => (
                  <span key={s.id} className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs text-slate-400">
                    {s.name}
                  </span>
                ))}
            </div>
          </div>
        )}

        {pool.length === 0 && (
          <Button variant="outline" size="sm" onClick={resetPool}>
            重置本轮
          </Button>
        )}
      </Card>

      {students.length === 0 && (
        <Card>
          <Empty text="当前班级没有学生" />
        </Card>
      )}
    </div>
  );
}
