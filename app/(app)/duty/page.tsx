'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Printer, RotateCw, Wand2, X } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { DutyAssignment, DutyGroup, DutyRecord, DutyTask, Student } from '@/lib/types';
import {
  DUTY_GROUP_PRESET,
  DUTY_GROUP_RULES,
  DUTY_PRESET_MATRIX,
  DUTY_REMINDERS,
  DUTY_STUDENT_RULES,
  DUTY_TASK_PRESET,
  DUTY_TIME_NOTES,
} from '@/lib/constants';
import { Badge, Button, Card, CardTitle, Empty, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { cn, formatDate, today } from '@/lib/utils';

// 今日值日生（按学号每天轮换）
function todayDutyStudents(students: Student[], date: string): Student[] {
  if (students.length === 0) return [];
  const base = new Date('2000-01-01T00:00:00').getTime();
  const days = Math.floor((new Date(date + 'T00:00:00').getTime() - base) / 86400000);
  const idx = ((days % students.length) + students.length) % students.length;
  return [students[idx]];
}

export default function DutyPage() {
  const { currentClassId, currentClass } = useClass();
  const toast = useToast();
  const [groups, setGroups] = useState<DutyGroup[]>([]);
  const [tasks, setTasks] = useState<DutyTask[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<DutyRecord[]>([]);
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<{ group: DutyGroup; task: DutyTask } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    (async () => {
      const [{ data: st }, { data: tk }, { data: gp }, { data: as }] = await Promise.all([
        sb.from('students').select('id,name,student_no').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true),
        sb.from('duty_tasks').select('*').eq('class_id', currentClassId).order('sort_order'),
        sb.from('duty_groups').select('*').eq('class_id', currentClassId).order('sort_order'),
        sb.from('duty_assignments').select('*').eq('class_id', currentClassId),
      ]);
      setStudents((st ?? []) as unknown as Student[]);

      let taskList = (tk ?? []) as DutyTask[];
      if (taskList.length === 0) {
        const { data } = await sb
          .from('duty_tasks')
          .insert(DUTY_TASK_PRESET.map((name, i) => ({ class_id: currentClassId, name, sort_order: i + 1 })))
          .select();
        taskList = (data ?? []) as DutyTask[];
      }
      setTasks(taskList);

      let groupList = (gp ?? []) as DutyGroup[];
      if (groupList.length === 0) {
        const { data } = await sb
          .from('duty_groups')
          .insert(DUTY_GROUP_PRESET.map((name, i) => ({ class_id: currentClassId, name, sort_order: i + 1 })))
          .select();
        groupList = (data ?? []) as DutyGroup[];
      }
      setGroups(groupList);
      setAssignments((as ?? []) as DutyAssignment[]);
      setLoading(false);
    })();
  }, [currentClassId, tick]);

  useEffect(() => {
    if (!currentClassId) return;
    getSupabase()
      .from('duty_records')
      .select('*')
      .eq('class_id', currentClassId)
      .eq('date', date)
      .then(({ data }) => setRecords((data ?? []) as DutyRecord[]));
  }, [currentClassId, date, tick]);

  const nameOf = (sid: string) => students.find((s) => s.id === sid)?.name ?? '?';
  const currentGroup = groups.find((g) => g.sort_order === 1) ?? null;
  const todayDuty = todayDutyStudents(students, date);

  const cellStudents = (groupId: string, taskId: string) =>
    assignments.filter((a) => a.group_id === groupId && a.task_id === taskId).map((a) => a.student_id);

  const openCell = (group: DutyGroup, task: DutyTask) => {
    setEditCell({ group, task });
    setPicked(cellStudents(group.id, task.id));
  };

  const saveCell = async () => {
    if (!editCell || !currentClassId) return;
    const sb = getSupabase();
    await sb.from('duty_assignments').delete().eq('group_id', editCell.group.id).eq('task_id', editCell.task.id);
    if (picked.length > 0) {
      await sb.from('duty_assignments').insert(
        picked.map((sid) => ({
          class_id: currentClassId,
          group_id: editCell.group.id,
          task_id: editCell.task.id,
          student_id: sid,
        }))
      );
    }
    await audit('update', 'duty_assignment', editCell.group.id, { task: editCell.task.name, count: picked.length });
    toast(`${editCell.group.name} · ${editCell.task.name} 已保存`);
    setEditCell(null);
    reload();
  };

  // 自动分工：按学号顺序分 7 组，组内 2 扫地 / 2 拖地 / 1 擦窗 / 1 倒垃圾
  const autoAssign = async () => {
    if (!currentClassId || groups.length === 0 || tasks.length === 0) return;
    const sb = getSupabase();
    const ordered = [...students].sort((a, b) => (a.student_no > b.student_no ? 1 : -1));
    const per = Math.ceil(ordered.length / groups.length);
    await sb.from('duty_assignments').delete().eq('class_id', currentClassId);
    const rows: { class_id: string; group_id: string; task_id: string; student_id: string }[] = [];
    groups.forEach((g, gi) => {
      const chunk = ordered.slice(gi * per, (gi + 1) * per);
      const plan: [number, number][] = [
        [0, 2], // 扫地 2 人
        [1, 2], // 拖地 2 人
        [2, 1], // 擦窗户和瓷砖 1 人
        [3, 1], // 倒垃圾 1 人
      ];
      let cursor = 0;
      for (const [ti, count] of plan) {
        const task = tasks[ti];
        if (!task) continue;
        for (let k = 0; k < count; k++) {
          const stu = chunk[cursor];
          cursor++;
          if (!stu) break;
          rows.push({ class_id: currentClassId, group_id: g.id, task_id: task.id, student_id: stu.id });
        }
      }
    });
    if (rows.length > 0) await sb.from('duty_assignments').insert(rows);
    toast(`已按学号顺序自动分工（${rows.length} 条），第 5 项由当天值日生负责`);
    reload();
  };

  const rotateGroup = async () => {
    if (!currentClassId) return;
    const sb = getSupabase();
    const n = groups.length;
    if (n > 1) {
      // 本周组排到最后（其余前移）
      const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);
      for (let i = 0; i < sorted.length; i++) {
        await sb
          .from('duty_groups')
          .update({ sort_order: i === 0 ? n : i })
          .eq('id', sorted[i].id);
      }
    }
    await audit('rotate', 'duty_group');
    toast('已切换到下一组值日');
    reload();
  };

  // 一键按原值日表预填姓名（按姓名匹配学生名单）
  const applyPresetMatrix = async () => {
    if (!currentClassId || groups.length === 0 || tasks.length === 0) {
      toast('请先重置为值日表预设（建立 5 项任务与 7 个组）', 'info');
      return;
    }
    const sb = getSupabase();
    const nameMap = new Map<string, string>();
    students.forEach((s) => nameMap.set(s.name.replace(/\s/g, ''), s.id));
    const missing: string[] = [];
    const rows: { class_id: string; group_id: string; task_id: string; student_id: string }[] = [];
    for (const [taskName, groupsArr] of Object.entries(DUTY_PRESET_MATRIX)) {
      const task = tasks.find((t) => t.name === taskName);
      if (!task) continue;
      groupsArr.forEach((names, gi) => {
        const g = groups[gi];
        if (!g) return;
        for (const nm of names) {
          const id = nameMap.get(nm.replace(/\s/g, ''));
          if (id) rows.push({ class_id: currentClassId, group_id: g.id, task_id: task.id, student_id: id });
          else missing.push(nm);
        }
      });
    }
    await sb.from('duty_assignments').delete().eq('class_id', currentClassId);
    if (rows.length > 0) await sb.from('duty_assignments').insert(rows);
    await audit('import', 'duty_assignments', currentClassId, { count: rows.length });
    const uniqMissing = [...new Set(missing)];
    toast(
      uniqMissing.length > 0
        ? `已预填 ${rows.length} 条；${uniqMissing.length} 位同学不在名单中：${uniqMissing.join('、')}`
        : `已按原值日表预填 ${rows.length} 条分工`,
      uniqMissing.length > 0 ? 'info' : 'success'
    );
    reload();
  };

  // 重置任务与分组为班级值日表预设（5 任务 × 7 组）
  const resetPreset = async () => {
    if (!currentClassId) return;
    const sb = getSupabase();
    await sb.from('duty_assignments').delete().eq('class_id', currentClassId);
    await sb.from('duty_tasks').delete().eq('class_id', currentClassId);
    await sb.from('duty_groups').delete().eq('class_id', currentClassId);
    await sb.from('duty_tasks').insert(DUTY_TASK_PRESET.map((name, i) => ({ class_id: currentClassId, name, sort_order: i + 1 })));
    await sb.from('duty_groups').insert(DUTY_GROUP_PRESET.map((name, i) => ({ class_id: currentClassId, name, sort_order: i + 1 })));
    toast('已重置为班级值日表预设（5 项任务 + 7 个组），可点「按学号自动分工」快速分配');
    reload();
  };

  const setCheck = async (taskId: string, ok: boolean) => {
    if (!currentClassId) return;
    const sb = getSupabase();
    const existing = records.find((r) => r.task_id === taskId);
    if (existing) await sb.from('duty_records').update({ ok }).eq('id', existing.id);
    else await sb.from('duty_records').insert({ class_id: currentClassId, date, task_id: taskId, ok });
    setTick((t) => t + 1);
  };

  if (loading) return <Loading />;

  const checkedCount = tasks.filter((t) => records.some((r) => r.task_id === t.id)).length;
  const okCount = tasks.filter((t) => records.find((r) => r.task_id === t.id)?.ok).length;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🧹"
        title="卫生值日表"
        subtitle={`${currentClass?.name ?? ''} · 值日组每周轮换 · 值日生按学号每天轮换`}
        color={{ chip: 'bg-brand-500/15 text-brand-300', soft: 'bg-brand-500/15', text: 'text-brand-300' }}
      >
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Button size="sm" variant="outline" onClick={autoAssign}>
          <Wand2 size={14} /> 按学号自动分工
        </Button>
        <Button size="sm" onClick={applyPresetMatrix}>
          <Wand2 size={14} /> 按值日表预填姓名
        </Button>
        <Button size="sm" variant="outline" onClick={resetPreset}>
          重置为值日表预设
        </Button>
        <Button size="sm" variant="outline" onClick={rotateGroup}>
          <RotateCw size={14} /> 下周轮换
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer size={14} /> 打印值日表
        </Button>
      </PageHeader>

      {/* 本周值日组 + 今日值日生 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle right={currentGroup ? <Badge className="bg-brand-500/15 text-brand-300">本周</Badge> : undefined}>
            本周值日组
          </CardTitle>
          <div className="text-2xl font-bold text-slate-100">{currentGroup?.name ?? '未设置'}</div>
          <p className="mt-1 text-xs text-slate-400">
            共 {groups.length} 组轮换；组内分工见下表，一日三扫，劳动委员定时检查。
          </p>
        </Card>
        <Card>
          <CardTitle right={<Badge className="bg-amber-500/15 text-amber-300">{formatDate(date)}</Badge>}>
            今日值日生（擦黑板、整理讲台、写课表）
          </CardTitle>
          <div className="text-2xl font-bold text-slate-100">
            {todayDuty.length > 0 ? todayDuty.map((s) => s.name).join('、') : '—'}
          </div>
          <p className="mt-1 text-xs text-slate-400">按学号每天轮换；早读前、每节课前、放学之前完成。</p>
        </Card>
      </div>

      {/* 分工矩阵 */}
      <Card className="print-area">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">{currentClass?.name ?? ''} 卫生值日表 · 值日分组安排</h3>
          <span className="no-print text-xs text-slate-400">点表格里的姓名可修改该组该任务的责任人</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40 border border-slate-700 bg-slate-800/60 p-2 text-left text-xs text-slate-400">任务</th>
                {groups.map((g) => (
                  <th
                    key={g.id}
                    className={cn(
                      'border border-slate-700 p-2 text-xs',
                      g.sort_order === 1 ? 'bg-brand-500/20 font-semibold text-brand-300' : 'bg-slate-800/60 text-slate-400'
                    )}
                  >
                    {g.name}
                    {g.sort_order === 1 && '（本周）'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="border border-slate-700 bg-slate-800/40 p-2 text-xs font-medium text-slate-300">{t.name}</td>
                  {groups.map((g) => {
                    const ids = cellStudents(g.id, t.id);
                    const isLast = t.id === tasks[tasks.length - 1]?.id;
                    return (
                      <td
                        key={g.id}
                        onClick={() => !isLast && openCell(g, t)}
                        className={cn(
                          'border border-slate-700 p-2 text-center text-xs',
                          !isLast && 'cursor-pointer hover:bg-brand-500/10',
                          g.sort_order === 1 && 'bg-brand-500/5'
                        )}
                      >
                        {isLast ? (
                          <span className="text-slate-400">当天值日生</span>
                        ) : ids.length > 0 ? (
                          <span className="text-slate-200">
                            {ids.map((id) => nameOf(id)).join('、')}
                          </span>
                        ) : (
                          <span className="text-slate-500">＋ 分配</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 值日时间 */}
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-bold text-slate-100">值日时间</div>
          <ul className="space-y-0.5 text-xs text-slate-300">
            {DUTY_TIME_NOTES.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>

        {/* 值日要求 */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-sm font-bold text-slate-100">值日要求 · 值日生</div>
            <ul className="space-y-0.5 text-xs text-slate-300">
              {DUTY_STUDENT_RULES.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-bold text-slate-100">值日要求 · 值日组</div>
            <ul className="space-y-0.5 text-xs text-slate-300">
              {DUTY_GROUP_RULES.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* 郑重提醒 */}
        <div className="mt-3">
          <div className="mb-1.5 text-sm font-bold text-slate-100">郑重提醒</div>
          <ul className="space-y-0.5 text-xs text-slate-300">
            {DUTY_REMINDERS.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 劳动委员检查 */}
      <Card>
        <CardTitle right={<Badge className="bg-slate-700/60 text-slate-300">{okCount}/{checkedCount} 达标</Badge>}>
          劳动委员检查 · {formatDate(date)}（{currentGroup?.name ?? ''}）
        </CardTitle>
        {tasks.length === 0 ? (
          <Empty
            text="暂无值日任务，先重置为值日表预设吧（5 项任务 + 7 个组）"
            action={
              <Button size="sm" onClick={resetPreset}>
                重置为值日表预设
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const rec = records.find((r) => r.task_id === t.id);
              return (
                <div
                  key={t.id}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2',
                    rec
                      ? rec.ok
                        ? 'border-green-500/30 bg-green-500/10'
                        : 'border-red-500/30 bg-red-500/10'
                      : 'border-slate-700 bg-slate-800/60'
                  )}
                >
                  <span className="text-sm text-slate-200">{t.name}</span>
                  <span className="text-xs text-slate-400">
                    {t.id === tasks[tasks.length - 1]?.id
                      ? `本次：${todayDuty.map((s) => s.name).join('、') || '—'}`
                      : cellStudents(currentGroup?.id ?? '', t.id).map((id) => nameOf(id)).join('、') || '未分配'}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {rec ? (
                      <>
                        <Badge className={rec.ok ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}>
                          {rec.ok ? '达标' : '有问题'}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => setCheck(t.id, true)} title="改为达标">
                          <Check size={13} className="text-green-300" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCheck(t.id, false)} title="改为有问题">
                          <X size={13} className="text-red-300" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setCheck(t.id, true)}>
                          <Check size={13} /> 达标
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setCheck(t.id, false)}>
                          <X size={13} /> 有问题
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-slate-400">
              说明：检查不达标时，请找对应同学继续打扫；若当天卫生不过关，按班级规定全组加扫一天。
            </p>
          </div>
        )}
      </Card>

      {/* 分配责任人 */}
      <Modal
        open={!!editCell}
        title={`${editCell?.group.name ?? ''} · ${editCell?.task.name ?? ''}`}
        onClose={() => setEditCell(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditCell(null)}>
              取消
            </Button>
            <Button onClick={saveCell}>保存（{picked.length} 人）</Button>
          </>
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPicked(picked.length === students.length ? [] : students.map((s) => s.id))}
          >
            {picked.length === students.length ? '取消全选' : '全选'}
          </Button>
          <span className="text-xs text-slate-400">已选 {picked.length} 人</span>
        </div>
        <div className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-slate-700 p-2 sm:grid-cols-3">
          {students.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-left text-sm transition-colors',
                  on ? 'border-brand-400 bg-brand-500/15 text-brand-300' : 'border-slate-700 text-slate-300 hover:border-brand-400'
                )}
              >
                {s.name}
                <span className="ml-1 text-[10px] text-slate-500">{s.student_no}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
