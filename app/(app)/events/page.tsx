'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { BehaviorEvent, Student } from '@/lib/types';
import { EVENT_TYPES, EVENT_TYPE_COLOR } from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { formatDate, today, compareStudentNo } from '@/lib/utils';

const EMPTY_FORM = {
  student_id: '',
  event_date: today(),
  event_type: '表扬',
  category: '',
  description: '',
  action_taken: '',
  severity: '低',
  guardian_notified: false,
  resolved: false,
  follow_up: '',
};

export default function EventsPage() {
  const { currentClassId } = useClass();
  const [events, setEvents] = useState<(BehaviorEvent & { students?: { name: string } | null })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BehaviorEvent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase()
        .from('behavior_events')
        .select('*,students(name)')
        .eq('class_id', currentClassId)
        .order('event_date', { ascending: false })
        .limit(200),
      getSupabase()
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true)
        .order('student_no'),
    ]).then(([e, s]) => {
      setEvents((e.data ?? []) as unknown as (BehaviorEvent & { students?: { name: string } | null })[]);
      setStudents([...(s.data ?? []) as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (ev: BehaviorEvent) => {
    setEditing(ev);
    setForm({
      student_id: ev.student_id,
      event_date: ev.event_date.slice(0, 10),
      event_type: ev.event_type,
      category: ev.category ?? '',
      description: ev.description ?? '',
      action_taken: ev.action_taken ?? '',
      severity: ev.severity ?? '低',
      guardian_notified: ev.guardian_notified,
      resolved: ev.resolved,
      follow_up: ev.follow_up ?? '',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.student_id) {
      setError('请选择学生');
      return;
    }
    setSaving(true);
    const payload = {
      student_id: form.student_id,
      event_date: form.event_date,
      event_type: form.event_type,
      category: form.category || null,
      description: form.description || null,
      action_taken: form.action_taken || null,
      severity: form.event_type === '违纪' || form.event_type === '冲突' ? form.severity : null,
      guardian_notified: form.guardian_notified,
      resolved: form.resolved,
      follow_up: form.follow_up || null,
    };
    try {
      const sb = getSupabase();
      if (editing) {
        await sb.from('behavior_events').update(payload).eq('id', editing.id);
      } else {
        await sb.from('behavior_events').insert({ ...payload, class_id: currentClassId });
      }
      await audit('insert', 'behavior_event', form.student_id, { type: form.event_type });
      setModalOpen(false);
      toast(editing ? '事件记录已更新' : '事件已登记');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return events.filter((e) => {
      if (typeFilter && e.event_type !== typeFilter) return false;
      if (kw && !(e.students?.name ?? '').includes(kw) && !(e.description ?? '').includes(kw)) return false;
      if (monthFilter && !e.event_date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [events, typeFilter, keyword, monthFilter]);

  const exportExcel = () => {
    const rows: (string | number)[][] = [['日期', '学生', '类型', '类别', '描述', '处理方式', '严重度', '已通知家长', '状态']];
    for (const ev of filtered) {
      rows.push([
        ev.event_date,
        ev.students?.name ?? '',
        ev.event_type,
        ev.category ?? '',
        ev.description ?? '',
        ev.action_taken ?? '',
        ev.severity ?? '',
        ev.guardian_notified ? '是' : '否',
        ev.resolved ? '已处理' : '未处理',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '事件台账');
    XLSX.writeFile(wb, `事件台账-${new Date().toISOString().slice(0, 10)}.xlsx`);
    void audit('export', 'behavior_event');
    toast(`已导出 ${filtered.length} 条事件`);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📌"
        title="事件台账"
        subtitle="表扬 · 违纪 · 冲突 · 意外，随堂速记的落点"
        color={{ chip: 'bg-red-500/15 text-red-300', soft: 'bg-red-500/10', text: 'text-red-300' }}
      >
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="w-40 pl-8" placeholder="搜姓名/内容" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <Input type="month" className="w-32" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-24">
          <option value="">全部类型</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download size={14} /> 导出
        </Button>
        <Button onClick={openAdd}>
          <Plus size={16} /> 登记事件
        </Button>
      </PageHeader>

      {filtered.length === 0 ? (
        <Card>
          <Empty
            text="暂无事件记录，先登记一条吧"
            action={
              <Button onClick={openAdd}>
                <Plus size={16} /> 登记事件
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => (
            <Card key={ev.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">
                  {ev.students?.name ?? '?'}
                </span>
                <Badge className={EVENT_TYPE_COLOR[ev.event_type] ?? ''}>{ev.event_type}</Badge>
                {ev.category && <Badge className="bg-slate-700/60 text-slate-500">{ev.category}</Badge>}
                {ev.severity && (
                  <Badge
                    className={
                      ev.severity === '高'
                        ? 'bg-red-500/15 text-red-300'
                        : ev.severity === '中'
                        ? 'bg-orange-500/15 text-orange-300'
                        : 'bg-slate-700/60 text-slate-500'
                    }
                  >
                    严重度 {ev.severity}
                  </Badge>
                )}
                {!ev.resolved && ev.event_type !== '表扬' && (
                  <Badge className="bg-yellow-500/15 text-yellow-300">未处理</Badge>
                )}
                <span className="ml-auto text-xs text-slate-400">{formatDate(ev.event_date)}</span>
                <Button variant="ghost" size="sm" onClick={() => openEdit(ev)}>
                  编辑
                </Button>
              </div>
              {ev.description && (
                <p className="mt-2 text-sm text-slate-500">{ev.description}</p>
              )}
              {ev.action_taken && (
                <p className="mt-1 text-xs text-slate-400">处理：{ev.action_taken}</p>
              )}
              {ev.guardian_notified && (
                <p className="mt-1 text-xs text-brand-300">已通知家长</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑事件' : '登记事件'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="学生" required>
            <Select
              value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
            >
              <option value="">请选择</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_no} {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="日期">
            <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          </Field>
          <Field label="类型">
            <Select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="类别标签" hint="如：上课说话 / 助人为乐">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="描述" hint="发生了什么">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="处理方式">
            <Textarea value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} />
          </Field>
          {(form.event_type === '违纪' || form.event_type === '冲突') && (
            <>
              <Field label="严重度">
                <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="低">低</option>
                  <option value="中">中</option>
                  <option value="高">高</option>
                </Select>
              </Field>
              <Field label="跟进事项">
                <Input value={form.follow_up} onChange={(e) => setForm({ ...form, follow_up: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.guardian_notified}
                  onChange={(e) => setForm({ ...form, guardian_notified: e.target.checked })}
                />
                已通知家长
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.resolved}
                  onChange={(e) => setForm({ ...form, resolved: e.target.checked })}
                />
                已处理
              </label>
            </>
          )}
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
      </Modal>
    </div>
  );
}
