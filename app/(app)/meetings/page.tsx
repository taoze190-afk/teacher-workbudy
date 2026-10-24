'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { ParentMeeting, Student } from '@/lib/types';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Textarea } from '@/components/ui';
import { formatDate, today, compareStudentNo } from '@/lib/utils';

export default function MeetingsPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [meetings, setMeetings] = useState<(ParentMeeting & { attendee_count?: number })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', meeting_date: today(), agenda: '', summary: '' });
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase()
        .from('parent_meetings')
        .select('*')
        .eq('class_id', currentClassId)
        .order('meeting_date', { ascending: false }),
      getSupabase()
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true)
        .order('student_no'),
    ]).then(([m, s]) => {
      setMeetings((m.data ?? []) as (ParentMeeting & { attendee_count?: number })[]);
      setStudents([...(s.data ?? []) as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const save = async () => {
    if (!form.title) {
      alert('请填写会议标题');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await getSupabase()
        .from('parent_meetings')
        .insert({ ...form, class_id: currentClassId })
        .select()
        .single();
      if (error) throw error;
      // 预生成签到名单
      const attendees = students.map((s) => ({
        meeting_id: (data as ParentMeeting).id,
        student_id: s.id,
        class_id: currentClassId,
      }));
      await getSupabase().from('parent_meeting_attendees').insert(attendees);
      await audit('insert', 'parent_meeting', (data as ParentMeeting).id);
      toast(`家长会「${form.title}」已创建，签到名单已生成`);
      setModalOpen(false);
      reload();
    } catch (e) {
      alert('保存失败：' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📣"
        title="家长会"
        subtitle="会议记录 · 签到表打印"
        color={{ chip: 'bg-violet-500/15 text-violet-300', soft: 'bg-violet-500/10', text: 'text-violet-300' }}
      >
        <Button onClick={() => { setForm({ title: '', meeting_date: today(), agenda: '', summary: '' }); setModalOpen(true); }}>
          <Plus size={16} /> 新建家长会
        </Button>
      </PageHeader>

      {meetings.length === 0 ? (
        <Card>
          <Empty
            text="暂无家长会记录，先新建一场吧"
            action={
              <Button onClick={() => { setForm({ title: '', meeting_date: today(), agenda: '', summary: '' }); setModalOpen(true); }}>
                <Plus size={16} /> 新建家长会
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <Card key={m.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{m.title}</span>
                <Badge className="bg-brand-500/15 text-brand-300">{formatDate(m.meeting_date)}</Badge>
                <span className="ml-auto text-xs text-slate-400">
                  <Link href={`/print?type=signin&meeting=${m.id}`} className="text-brand-300 hover:underline">
                    打印签到表
                  </Link>
                </span>
              </div>
              {m.agenda && <p className="mt-2 text-xs text-slate-400">议程：{m.agenda}</p>}
              {m.summary && <p className="mt-1 text-sm text-slate-500">{m.summary}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="新建家长会"
        onClose={() => setModalOpen(false)}
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
          <Field label="主题" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：期中考试后家长会" />
          </Field>
          <Field label="日期">
            <Input type="date" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
          </Field>
          <Field label="议程">
            <Textarea value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </Field>
          <Field label="会议记录">
            <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
