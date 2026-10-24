'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { Student, Talk } from '@/lib/types';
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
import { daysFromToday, formatDate, today } from '@/lib/utils';

const EMPTY_FORM = {
  student_id: '',
  talk_date: today(),
  place: '',
  duration_min: '',
  trigger_type: '例行',
  topic: '',
  key_points: '',
  student_response: '',
  follow_up: '',
  follow_up_date: '',
};

export default function TalksPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [talks, setTalks] = useState<(Talk & { students?: { name: string } | null })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Talk | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase()
        .from('talks')
        .select('*,students(name)')
        .eq('class_id', currentClassId)
        .order('talk_date', { ascending: false })
        .limit(200),
      getSupabase()
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true)
        .order('student_no'),
    ]).then(([t, s]) => {
      setTalks((t.data ?? []) as unknown as (Talk & { students?: { name: string } | null })[]);
      setStudents((s.data ?? []) as Student[]);
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (tk: Talk) => {
    setEditing(tk);
    setForm({
      student_id: tk.student_id,
      talk_date: tk.talk_date.slice(0, 10),
      place: tk.place ?? '',
      duration_min: tk.duration_min != null ? String(tk.duration_min) : '',
      trigger_type: tk.trigger_type ?? '例行',
      topic: tk.topic ?? '',
      key_points: tk.key_points ?? '',
      student_response: tk.student_response ?? '',
      follow_up: tk.follow_up ?? '',
      follow_up_date: tk.follow_up_date ? tk.follow_up_date.slice(0, 10) : '',
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
      talk_date: form.talk_date,
      place: form.place || null,
      duration_min: form.duration_min ? Number(form.duration_min) : null,
      trigger_type: form.trigger_type,
      topic: form.topic || null,
      key_points: form.key_points || null,
      student_response: form.student_response || null,
      follow_up: form.follow_up || null,
      follow_up_date: form.follow_up_date || null,
    };
    try {
      const sb = getSupabase();
      if (editing) {
        await sb.from('talks').update(payload).eq('id', editing.id);
      } else {
        await sb.from('talks').insert({ ...payload, class_id: currentClassId });
      }
      await audit('insert', 'talk', form.student_id);
      setModalOpen(false);
      toast(editing ? '谈话记录已更新' : '谈话记录已保存');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const overdue = talks.filter((t) => t.follow_up_date && (daysFromToday(t.follow_up_date) ?? 0) < 0);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="💬"
        title="谈心谈话"
        subtitle="结构化记录 · 跟进提醒"
        color={{ chip: 'bg-teal-500/15 text-teal-300', soft: 'bg-teal-500/10', text: 'text-teal-300' }}
      >
        <Button onClick={openAdd}>
          <Plus size={16} /> 记录谈话
        </Button>
      </PageHeader>

      {overdue.length > 0 && (
        <Card className="border-red-500/40 bg-red-500/10">
          <div className="text-sm font-medium text-red-300">
            ⏰ 有 {overdue.length} 条跟进已逾期，请尽快处理
          </div>
        </Card>
      )}

      {talks.length === 0 ? (
        <Card>
          <Empty
            text="暂无谈话记录，先记录一次谈心吧"
            action={
              <Button onClick={openAdd}>
                <Plus size={16} /> 记录谈话
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {talks.map((tk) => {
            const due = daysFromToday(tk.follow_up_date);
            return (
              <Card key={tk.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {tk.students?.name ?? '?'}
                  </span>
                  <Badge className="bg-slate-700/60 text-slate-500">{tk.topic ?? '未填主题'}</Badge>
                  {tk.trigger_type && (
                    <Badge className="bg-brand-500/15 text-brand-300">{tk.trigger_type}</Badge>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{formatDate(tk.talk_date)}</span>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(tk)}>
                    编辑
                  </Button>
                </div>
                {tk.key_points && (
                  <p className="mt-2 text-sm text-slate-500">{tk.key_points}</p>
                )}
                {tk.follow_up_date && (
                  <p
                    className={`mt-1 text-xs ${
                      due !== null && due < 0 ? 'font-medium text-red-500' : 'text-slate-400'
                    }`}
                  >
                    跟进：{tk.follow_up || '—'}（{formatDate(tk.follow_up_date)}
                    {due !== null && due < 0 ? `，已逾期 ${-due} 天` : ''}）
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑谈话' : '记录谈话'}
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
            <Input type="date" value={form.talk_date} onChange={(e) => setForm({ ...form, talk_date: e.target.value })} />
          </Field>
          <Field label="地点">
            <Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="如：办公室 / 走廊" />
          </Field>
          <Field label="时长（分钟）">
            <Input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} />
          </Field>
          <Field label="起因">
            <Select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}>
              <option value="主动约谈">主动约谈</option>
              <option value="事件触发">事件触发</option>
              <option value="家长要求">家长要求</option>
              <option value="例行">例行</option>
            </Select>
          </Field>
          <Field label="主题">
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </Field>
          <Field label="谈话要点">
            <Textarea value={form.key_points} onChange={(e) => setForm({ ...form, key_points: e.target.value })} />
          </Field>
          <Field label="学生反馈">
            <Textarea value={form.student_response} onChange={(e) => setForm({ ...form, student_response: e.target.value })} />
          </Field>
          <Field label="跟进事项">
            <Input value={form.follow_up} onChange={(e) => setForm({ ...form, follow_up: e.target.value })} />
          </Field>
          <Field label="下次跟进日期">
            <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
          </Field>
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
