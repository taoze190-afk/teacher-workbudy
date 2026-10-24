'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardList,
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import { ATTENDANCE_STATUS_COLOR } from '@/lib/constants';
import { Badge, Button, Card, CardTitle, Empty, Loading, PageHeader, StatCard } from '@/components/ui';
import { cn, daysFromToday, formatDate, isBirthdayThisMonth, isBirthdayToday, today } from '@/lib/utils';

interface Anomaly {
  id: string;
  status: string;
  late_minutes?: number | null;
  student_id?: string | null;
  students: { name: string; student_no: string } | null;
}

interface HomeworkMiss {
  id: string;
  subject: string;
  students: { name: string; student_no: string } | null;
}

interface DueItem {
  kind: string;
  student_id?: string | null;
  due_date: string | null;
  detail: string | null;
}

interface Birthday {
  id: string;
  name: string;
  birthday: string | null;
}

interface Todo {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
}

const QUICK_LINKS = [
  { href: '/attendance', label: '今日考勤', icon: AlarmClock, chip: 'bg-amber-500/15 text-amber-300 ring-amber-400/25', hover: 'hover:border-amber-400/50 hover:bg-amber-500/10' },
  { href: '/homework', label: '作业登记', icon: BookOpenCheck, chip: 'bg-orange-500/15 text-orange-300 ring-orange-400/25', hover: 'hover:border-orange-400/50 hover:bg-orange-500/10' },
  { href: '/duty', label: '值日检查', icon: ClipboardList, chip: 'bg-lime-500/15 text-lime-300 ring-lime-400/25', hover: 'hover:border-lime-400/50 hover:bg-lime-500/10' },
  { href: '/tools', label: '随机点名', icon: ListTodo, chip: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/25', hover: 'hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10' },
  { href: '/schedule', label: '我的课表', icon: CalendarDays, chip: 'bg-cyan-500/15 text-cyan-300 ring-cyan-400/25', hover: 'hover:border-cyan-400/50 hover:bg-cyan-500/10' },
  { href: '/students', label: '学生档案', icon: ClipboardList, chip: 'bg-blue-500/15 text-blue-300 ring-blue-400/25', hover: 'hover:border-blue-400/50 hover:bg-blue-500/10' },
];

// 待办快捷模板：无数据时一键落一条，避免面对空白框发呆
const TODO_TEMPLATES = ['准备班会材料', '收体检回执', '布置假期作业', '联系重点关注学生家长', '检查值日安排'];

// 到期跟进 → 对应模块
const DUE_HREF: Record<string, string> = {
  谈话跟进: '/talks',
  联系跟进: '/contacts',
};

const P_LABEL: Record<number, string> = {
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
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function DashboardPage() {
  const { currentClassId, currentClass } = useClass();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [missed, setMissed] = useState<HomeworkMiss[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [dutyGroup, setDutyGroup] = useState<{ name: string; members: { students: { name: string } | null }[] } | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todayGrid, setTodayGrid] = useState<Record<string, string>>({});
  const [newTodo, setNewTodo] = useState('');
  const [newTodoDate, setNewTodoDate] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // 今日课程（取自课表）
  useEffect(() => {
    if (!currentClassId) return;
    getSupabase()
      .from('schedule_entries')
      .select('*')
      .eq('class_id', currentClassId)
      .then(({ data }) => {
        const g: Record<string, string> = {};
        for (const e of (data ?? []) as any[]) g[`${e.weekday}-${e.period}`] = e.subject ?? '';
        setTodayGrid(g);
      });
  }, [currentClassId]);

  const dow = new Date().getDay();
  const todayCourses =
    dow >= 1 && dow <= 5
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          .filter((p) => todayGrid[`${dow}-${p}`])
          .map((p) => ({ p, s: todayGrid[`${dow}-${p}`] }))
      : [];

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    const t = today();

    (async () => {
      // 今日值日组：先取本周组，再并发取成员（与主查询并行发起）
      const dutyGroupP = sb
        .from('duty_groups')
        .select('id,name')
        .eq('class_id', currentClassId)
        .order('sort_order')
        .limit(1)
        .maybeSingle();
      const dutyGroup = (await dutyGroupP).data;
      const dutyMembersP = dutyGroup
        ? sb.from('duty_group_members').select('students(name)').eq('group_id', dutyGroup.id)
        : Promise.resolve({ data: [] });

      const [a, h, d, b, todoRes, dutyMembersRes] = await Promise.all([
        sb
          .from('attendance_records')
          .select('id,status,late_minutes,student_id,students(name,student_no)')
          .eq('class_id', currentClassId)
          .eq('date', t)
          .neq('status', '正常'),
        sb
          .from('homework_records')
          .select('id,subject,students(name,student_no)')
          .eq('class_id', currentClassId)
          .eq('date', t)
          .eq('status', '未交'),
        sb.from('v_due_reminders').select('*').eq('class_id', currentClassId),
        sb.from('students').select('id,name,birthday').eq('class_id', currentClassId).eq('active', true),
        sb.from('todos').select('id,title,due_date,done').eq('class_id', currentClassId).order('created_at'),
        dutyMembersP,
      ]);

      setAnomalies((a.data ?? []) as unknown as Anomaly[]);
      setMissed((h.data ?? []) as unknown as HomeworkMiss[]);
      setDue((d.data ?? []) as DueItem[]);
      setBirthdays(((b.data ?? []) as Birthday[]).filter((s) => isBirthdayThisMonth(s.birthday)));
      setTodos((todoRes.data ?? []) as unknown as Todo[]);

      if (dutyGroup) {
        setDutyGroup({
          name: dutyGroup.name,
          members: (dutyMembersRes.data ?? []) as unknown as { students: { name: string } | null }[],
        });
      } else {
        setDutyGroup(null);
      }

      setLoading(false);
    })();
  }, [currentClassId, tick]);

  /* ---------- 待办 CRUD ---------- */
  const insertTodo = async (title: string, due: string | null) => {
    if (!title.trim() || !currentClassId || adding) return;
    setAdding(true);
    const { data, error } = await getSupabase()
      .from('todos')
      .insert({
        class_id: currentClassId,
        title: title.trim(),
        due_date: due || null,
        done: false,
      })
      .select('id,title,due_date,done')
      .single();
    if (!error && data) setTodos((p) => [...p, data as unknown as Todo]);
    setAdding(false);
  };

  const addTodo = async () => {
    const title = newTodo.trim();
    if (!title) return;
    await insertTodo(title, newTodoDate);
    setNewTodo('');
    setNewTodoDate('');
  };

  const toggleTodo = async (t: Todo) => {
    setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const { error } = await getSupabase().from('todos').update({ done: !t.done }).eq('id', t.id);
    if (error) setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
  };

  const removeTodo = async (id: string) => {
    setTodos((p) => p.filter((x) => x.id !== id));
    await getSupabase().from('todos').delete().eq('id', id);
  };

  const sortedTodos = useMemo(() => {
    const rank = (t: Todo) => (t.done ? 2 : daysFromToday(t.due_date) !== null && (daysFromToday(t.due_date) ?? 0) < 0 ? 0 : 1);
    return [...todos].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [todos]);

  const todayBirthdays = birthdays.filter((s) => isBirthdayToday(s.birthday));

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const teacherName = currentClass?.homeroom_teacher || '老师';
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 ${DAY_NAMES[dow]}`;

  return (
    <div className="space-y-5">
      {/* 问候区 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
            {greeting}，{teacherName}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {dateLabel} · {currentClass?.name ?? ''}
            {currentClass?.term && ` · ${currentClass.term}学期`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw size={14} /> 刷新
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* 统计卡：预警项为 0 时收敛为绿色「正常」，>0 时暖色高亮抢占注意力 */}
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="考勤异常"
              value={anomalies.length}
              warn
              zeroHint="今日全员正常"
              hint="今日 · 点击去处理"
              tone="red"
              href="/attendance"
            />
            <StatCard
              label="未交作业"
              value={missed.length}
              warn
              zeroHint="作业全部收齐"
              hint="今日 · 点击去登记"
              tone="amber"
              href="/homework"
            />
            <StatCard
              label="待跟进"
              value={due.length}
              warn
              zeroHint="没有逾期事项"
              hint="谈话 / 联系到期提醒"
              tone="brand"
            />
            <StatCard
              label="本月生日"
              value={birthdays.length}
              hint={todayBirthdays.length ? `🎂 今天有 ${todayBirthdays.length} 个` : '本月没有学生生日'}
              tone="violet"
            />
          </div>

          {/* 快捷入口：轻底 + 彩色圆形图标 + 明亮文字 */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_LINKS.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-800/60 px-2 py-3 text-xs font-medium text-slate-200 transition-all hover:-translate-y-0.5',
                    q.hover
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset',
                      q.chip
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="truncate">{q.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* 待办（可直接勾选 / 新增 / 删除） */}
            <Card className="md:row-span-2">
              <CardTitle
                right={<Badge className="bg-slate-700/60 text-slate-400">{todos.filter((t) => !t.done).length} 项未完成</Badge>}
              >
                待办事项
              </CardTitle>
              {/* 新建输入与列表同一条视觉流：外层容器承担边框与聚焦态 */}
              <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-900/50 p-1.5 transition-all focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20">
                <input
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                  placeholder="添加待办，回车快速创建…"
                  className="min-w-[8rem] flex-1 bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  type="date"
                  value={newTodoDate}
                  onChange={(e) => setNewTodoDate(e.target.value)}
                  className="w-[8.5rem] shrink-0 bg-transparent px-1 py-1.5 text-xs text-slate-300 outline-none [color-scheme:dark]"
                  title="截止日期（可选）"
                />
                <Button size="sm" className="shrink-0 px-2.5" disabled={!newTodo.trim() || adding} onClick={addTodo}>
                  <Plus size={15} />
                </Button>
              </div>

              {sortedTodos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/70 px-3 py-4 text-center">
                  <p className="text-xs text-slate-400">还没有待办 · 点下面的模板一键添加</p>
                  <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                    {TODO_TEMPLATES.map((t) => (
                      <button
                        key={t}
                        disabled={adding}
                        onClick={() => void insertTodo(t, null)}
                        className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-brand-400 hover:text-brand-200 disabled:opacity-50"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                    {sortedTodos.map((t) => {
                      const d = daysFromToday(t.due_date);
                      const overdue = !t.done && d !== null && d < 0;
                      return (
                        <li
                          key={t.id}
                          className={cn(
                            'group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-slate-800/60',
                            t.done && 'opacity-50'
                          )}
                        >
                          <button
                            onClick={() => toggleTodo(t)}
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                              t.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-600 hover:border-emerald-400'
                            )}
                            title={t.done ? '标记为未完成' : '完成'}
                          >
                            {t.done && <Check size={12} strokeWidth={3} />}
                          </button>
                          <span className={cn('min-w-0 flex-1 truncate text-sm text-slate-200', t.done && 'line-through')}>
                            {t.title}
                          </span>
                          {t.due_date && (
                            <span className={cn('shrink-0 text-xs', overdue ? 'font-medium text-red-400' : 'text-slate-400')}>
                              {overdue ? `逾期 ${Math.abs(d!)} 天` : formatDate(t.due_date).slice(5)}
                            </span>
                          )}
                          <button
                            onClick={() => removeTodo(t.id)}
                            className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-700/50 pt-2">
                    <span className="text-[11px] text-slate-500">常用模板</span>
                    {TODO_TEMPLATES.slice(0, 3).map((t) => (
                      <button
                        key={t}
                        disabled={adding}
                        onClick={() => void insertTodo(t, null)}
                        className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-brand-200 disabled:opacity-50"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* 今日课程 */}
            <Card>
              <CardTitle
                right={
                  <Link href="/schedule" className="text-xs text-brand-300 hover:underline">
                    管理课表
                  </Link>
                }
                dot="bg-cyan-400"
              >
                今日课程 · {DAY_NAMES[dow]}
              </CardTitle>
              {dow === 0 || dow === 6 ? (
                <p className="text-sm text-slate-400">今天是周末，好好休息 😄</p>
              ) : todayCourses.length === 0 ? (
                <p className="text-sm text-slate-400">今天还没有排课 —— 去「我的课表」设置一下吧</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {todayCourses.map(({ p, s }) => (
                    <span
                      key={p}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-xs',
                        s === '语文'
                          ? 'border-brand-500/40 bg-brand-500/15 font-semibold text-brand-300'
                          : 'border-slate-700 bg-slate-800 text-slate-500'
                      )}
                    >
                      {P_LABEL[p]} · {s}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* 今日值日 & 生日 */}
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <CardTitle dot="bg-lime-400">今日值日</CardTitle>
                  {dutyGroup ? (
                    <div>
                      <div className="mb-1.5 text-sm font-medium text-slate-200">{dutyGroup.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {dutyGroup.members.map((m, i) => (
                          <Badge key={i} className="bg-slate-700/60 text-slate-500">
                            {m.students?.name ?? '?'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">未配置值日组</p>
                  )}
                </div>
                <div>
                  <CardTitle dot="bg-violet-400">本月生日</CardTitle>
                  {birthdays.length === 0 ? (
                    <p className="text-xs text-slate-400">本月没有学生生日</p>
                  ) : (
                    <ul className="space-y-1">
                      {birthdays.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex items-center justify-between text-sm">
                          <span>
                            {isBirthdayToday(s.birthday) && <span className="mr-1">🎂</span>}
                            {s.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {s.birthday ? formatDate(s.birthday).slice(5) : ''}
                            {isBirthdayToday(s.birthday) && (
                              <span className="ml-1 font-medium text-brand-300">今天！</span>
                            )}
                          </span>
                        </li>
                      ))}
                      {birthdays.length > 5 && (
                        <li className="text-xs text-slate-500">还有 {birthdays.length - 5} 人…</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </Card>

            {/* 今日考勤异常 */}
            <Card>
              <CardTitle
                right={
                  anomalies.length > 0 ? (
                    <Link href="/attendance">
                      <Badge className="bg-red-500/10 text-red-300">{anomalies.length} 人 · 去处理</Badge>
                    </Link>
                  ) : undefined
                }
                dot="bg-red-400"
              >
                今日考勤异常
              </CardTitle>
              {anomalies.length === 0 ? (
                <Empty text="今日全员正常" emoji="✅" />
              ) : (
                <ul className="divide-y divide-slate-50">
                  {anomalies.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        {a.students?.name ?? '?'}
                        <span className="ml-1 text-xs text-slate-400">{a.students?.student_no}</span>
                      </div>
                      <Badge className={ATTENDANCE_STATUS_COLOR[a.status] ?? ''}>
                        {a.status}
                        {a.status === '迟到' && a.late_minutes ? ` ${a.late_minutes}分` : ''}
                      </Badge>
                    </li>
                  ))}
                  {anomalies.length > 8 && (
                    <li className="pt-2 text-xs text-slate-500">还有 {anomalies.length - 8} 人…</li>
                  )}
                </ul>
              )}
            </Card>

            {/* 今日未交作业 */}
            <Card>
              <CardTitle
                right={
                  missed.length > 0 ? (
                    <Link href="/homework">
                      <Badge className="bg-amber-500/10 text-amber-300">{missed.length} 人次 · 去登记</Badge>
                    </Link>
                  ) : undefined
                }
                dot="bg-amber-400"
              >
                今日未交作业
              </CardTitle>
              {missed.length === 0 ? (
                <Empty text="作业全部收齐" emoji="🎉" />
              ) : (
                <ul className="divide-y divide-slate-50">
                  {missed.slice(0, 8).map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        {m.students?.name ?? '?'}
                        <span className="ml-1 text-xs text-slate-400">{m.students?.student_no}</span>
                      </div>
                      <Badge className="bg-slate-700/60 text-slate-500">{m.subject}</Badge>
                    </li>
                  ))}
                  {missed.length > 8 && (
                    <li className="pt-2 text-xs text-slate-500">还有 {missed.length - 8} 人次…</li>
                  )}
                </ul>
              )}
            </Card>

            {/* 到期跟进 */}
            <Card>
              <CardTitle dot="bg-brand-400">到期跟进</CardTitle>
              {due.length === 0 ? (
                <Empty text="没有逾期事项" emoji="✅" />
              ) : (
                <ul className="space-y-1.5">
                  {due.slice(0, 8).map((d, i) => {
                    const href = d.student_id && DUE_HREF[d.kind];
                    return (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Badge className="shrink-0 bg-slate-700/60 text-slate-500">{d.kind}</Badge>
                          {href ? (
                            <Link href={href} className="truncate text-slate-500 hover:text-brand-300 hover:underline">
                              {d.detail ?? ''}
                            </Link>
                          ) : (
                            <span className="truncate text-slate-500">{d.detail ?? ''}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-red-400">
                          逾期 {Math.abs(daysFromToday(d.due_date) ?? 0)} 天
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
