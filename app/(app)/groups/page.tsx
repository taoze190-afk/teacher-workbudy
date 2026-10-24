'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';
import { compareStudentNo } from '@/lib/utils';
import type { Student, StudyGroup, StudyGroupMember } from '@/lib/types';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';

export default function GroupsPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [members, setMembers] = useState<Record<string, (Student & { role?: string })[]>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', group_type: '学习组', student_ids: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase().from('study_groups').select('*').eq('class_id', currentClassId),
      getSupabase().from('study_group_members').select('*').eq('class_id', currentClassId),
      getSupabase().from('students').select('id,name,student_no').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no'),
    ]).then(([g, m, s]) => {
      setGroups((g.data ?? []) as StudyGroup[]);
      const rows = (m.data ?? []) as StudyGroupMember[];
      const ids = new Map(((s.data ?? []) as unknown as Student[]).map((x) => [x.id, x]));
      const mm: Record<string, (Student & { role?: string })[]> = {};
      for (const r of rows) {
        const stu = ids.get(r.student_id);
        if (stu) (mm[r.group_id] ??= []).push({ ...stu, role: r.role });
      }
      setMembers(mm);
      setStudents([...(s.data ?? []) as unknown as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const save = async () => {
    if (!form.name || form.student_ids.length === 0) {
      alert('请填写小组名称并选择成员');
      return;
    }
    setSaving(true);
    const sb = getSupabase();
    const { data, error } = await sb
      .from('study_groups')
      .insert({ class_id: currentClassId, name: form.name, group_type: form.group_type })
      .select()
      .single();
    if (error) {
      alert('创建失败：' + error.message);
      setSaving(false);
      return;
    }
    await sb.from('study_group_members').insert(
      form.student_ids.map((id, i) => ({
        group_id: (data as StudyGroup).id,
        student_id: id,
        class_id: currentClassId,
        role: i === 0 ? '组长' : '组员',
      }))
    );
    setSaving(false);
    setModalOpen(false);
    toast(`学习小组「${form.name}」已创建`);
    reload();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🤝"
        title="学习小组"
        subtitle="首位为组长 · 分组与帮扶"
        color={{ chip: 'bg-sky-500/15 text-sky-300', soft: 'bg-sky-500/10', text: 'text-sky-300' }}
      >
        <Button onClick={() => { setForm({ name: '', group_type: '学习组', student_ids: [] }); setModalOpen(true); }}>
          <Plus size={16} /> 新建小组
        </Button>
      </PageHeader>

      {groups.length === 0 ? (
        <Card>
          <Empty
            text="暂无小组，先新建一个吧"
            action={
              <Button onClick={() => { setForm({ name: '', group_type: '学习组', student_ids: [] }); setModalOpen(true); }}>
                <Plus size={16} /> 新建小组
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{g.name}</span>
                <Badge className="bg-brand-500/15 text-brand-300">{g.group_type}</Badge>
                <span className="ml-auto text-xs text-slate-400">{members[g.id]?.length ?? 0} 人</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(members[g.id] ?? []).map((s) => (
                  <Badge
                    key={s.id}
                    className={s.role === '组长' ? 'bg-brand-500/15 text-brand-300' : 'bg-slate-700/60 text-slate-500'}
                  >
                    {s.role === '组长' ? '★ ' : ''}{s.name}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="新建小组"
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? '创建中…' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="小组名称" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：第一组" />
            </Field>
            <Field label="类型">
              <Select value={form.group_type} onChange={(e) => setForm({ ...form, group_type: e.target.value })}>
                <option value="学习组">学习组</option>
                <option value="行政组">行政组</option>
                <option value="值日组">值日组</option>
              </Select>
            </Field>
          </div>
          <Field label="成员（首位为组长，可多选）" required>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-700 p-2">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={form.student_ids.includes(s.id)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        student_ids: e.target.checked
                          ? [...p.student_ids, s.id]
                          : p.student_ids.filter((x) => x !== s.id),
                      }))
                    }
                  />
                  {s.student_no} {s.name}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
