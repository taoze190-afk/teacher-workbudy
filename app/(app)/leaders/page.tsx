'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';
import { compareStudentNo } from '@/lib/utils';
import type { ClassLeader, Student } from '@/lib/types';
import { LEADER_ROLES } from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  Confirm,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';

export default function LeadersPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const term = new Date().getMonth() >= 7 ? `${new Date().getFullYear()}秋` : `${new Date().getFullYear() - 1}秋`;
  const [leaders, setLeaders] = useState<(ClassLeader & { students?: { name: string; student_no: string } | null })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', role: '班长', start_date: new Date().toISOString().slice(0, 10), end_date: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ClassLeader | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase()
        .from('class_leaders')
        .select('*,students(name,student_no)')
        .eq('class_id', currentClassId)
        .eq('term', term),
      getSupabase()
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true)
        .order('student_no'),
    ]).then(([l, s]) => {
      setLeaders((l.data ?? []) as unknown as (ClassLeader & { students?: { name: string; student_no: string } | null })[]);
      setStudents([...(s.data ?? []) as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    });
  }, [currentClassId, term, tick]);

  const save = async () => {
    if (!form.student_id) {
      alert('请选择学生');
      return;
    }
    setSaving(true);
    await getSupabase().from('class_leaders').insert({
      class_id: currentClassId,
      student_id: form.student_id,
      role: form.role,
      term,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    toast(`已任命${form.role}`);
    setSaving(false);
    setModalOpen(false);
    reload();
  };

  const remove = async () => {
    if (!confirmDel) return;
    await getSupabase().from('class_leaders').delete().eq('id', confirmDel.id);
    toast('已解除该班委职务');
    setConfirmDel(null);
    reload();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🏅"
        title={`班委（${term}）`}
        subtitle="按学期任命 · 职位预设"
        color={{ chip: 'bg-amber-500/15 text-amber-300', soft: 'bg-amber-500/10', text: 'text-amber-300' }}
      >
        <Button onClick={() => { setForm({ student_id: '', role: '班长', start_date: new Date().toISOString().slice(0, 10), end_date: '' }); setModalOpen(true); }}>
          <Plus size={16} /> 任命
        </Button>
      </PageHeader>

      {leaders.length === 0 ? (
        <Card>
          <Empty
            text="本学期还没有班委，先任命一位吧"
            action={
              <Button onClick={() => { setForm({ student_id: '', role: '班长', start_date: new Date().toISOString().slice(0, 10), end_date: '' }); setModalOpen(true); }}>
                <Plus size={16} /> 任命
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {leaders.map((l) => (
            <Card key={l.id} className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2">
                <Badge className="bg-brand-500/15 text-brand-300">{l.role}</Badge>
                <span className="text-sm font-semibold text-slate-100">{l.students?.name ?? '?'}</span>
                <span className="text-xs text-slate-400">{l.students?.student_no}</span>
              </div>
              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDel(l)}>
                <Trash2 size={14} />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="任命班委"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={save}>
              任命
            </Button>
          </>
        }
      >
        <div className="space-y-4">
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
          <Field label="职位">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {LEADER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始日期">
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="结束日期">
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!confirmDel}
        title="解除班委"
        message="确定解除该学生的班委职务吗？"
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={remove}
      />
    </div>
  );
}
