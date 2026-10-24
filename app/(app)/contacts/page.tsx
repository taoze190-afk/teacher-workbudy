'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { HomeSchoolContact, Student } from '@/lib/types';
import { CONTACT_METHODS } from '@/lib/constants';
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
import { daysFromToday, formatDate, today, compareStudentNo } from '@/lib/utils';

const EMPTY_FORM = {
  student_id: '',
  contact_date: today(),
  method: '电话',
  person: '爸爸',
  topic: '',
  summary: '',
  result: '',
  follow_up: '',
  follow_up_date: '',
};

export default function ContactsPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [contacts, setContacts] = useState<(HomeSchoolContact & { students?: { name: string } | null })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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
        .from('home_school_contacts')
        .select('*,students(name)')
        .eq('class_id', currentClassId)
        .order('contact_date', { ascending: false })
        .limit(200),
      getSupabase()
        .from('students')
        .select('id,name,student_no')
        .eq('class_id', currentClassId)
        .is('deleted_at', null)
        .eq('active', true)
        .order('student_no'),
    ]).then(([c, s]) => {
      setContacts((c.data ?? []) as unknown as (HomeSchoolContact & { students?: { name: string } | null })[]);
      setStudents([...(s.data ?? []) as Student[]].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const save = async () => {
    setError('');
    if (!form.student_id) {
      setError('请选择学生');
      return;
    }
    setSaving(true);
    const payload = {
      student_id: form.student_id,
      contact_date: form.contact_date,
      method: form.method,
      person: form.person || null,
      topic: form.topic || null,
      summary: form.summary || null,
      result: form.result || null,
      follow_up: form.follow_up || null,
      follow_up_date: form.follow_up_date || null,
      resolved: !form.follow_up_date,
    };
    try {
      await getSupabase().from('home_school_contacts').insert({ ...payload, class_id: currentClassId });
      await audit('insert', 'contact', form.student_id, { method: form.method });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      toast('联系记录已保存');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const overdue = contacts.filter((c) => c.follow_up_date && (daysFromToday(c.follow_up_date) ?? 0) < 0 && !c.resolved);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📞"
        title="家校联系"
        subtitle="电话 / 微信 / 面谈 / 家访 · 跟进逾期提醒"
        color={{ chip: 'bg-cyan-500/15 text-cyan-300', soft: 'bg-cyan-500/10', text: 'text-cyan-300' }}
      >
        <Button onClick={() => { setForm(EMPTY_FORM); setError(''); setModalOpen(true); }}>
          <Plus size={16} /> 记录联系
        </Button>
      </PageHeader>

      {overdue.length > 0 && (
        <Card className="border-red-500/40 bg-red-500/10">
          <div className="text-sm font-medium text-red-300">
            ⏰ {overdue.length} 条跟进已逾期（如红黄级学生家长需定期联系）
          </div>
        </Card>
      )}

      {contacts.length === 0 ? (
        <Card>
          <Empty
            text="暂无联系记录，先记录一次家校沟通吧"
            action={
              <Button onClick={() => { setForm(EMPTY_FORM); setError(''); setModalOpen(true); }}>
                <Plus size={16} /> 记录联系
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => {
            const due = daysFromToday(c.follow_up_date);
            return (
              <Card key={c.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{c.students?.name ?? '?'}</span>
                  <Badge className="bg-brand-500/15 text-brand-300">{c.method}</Badge>
                  {c.person && <Badge className="bg-slate-700/60 text-slate-500">{c.person}</Badge>}
                  {!c.resolved && c.follow_up_date && (
                    <Badge
                      className={
                        due !== null && due < 0 ? 'bg-red-500/15 text-red-300' : 'bg-yellow-500/15 text-yellow-300'
                      }
                    >
                      跟进中{due !== null && due < 0 ? `（逾期${-due}天）` : ''}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{formatDate(c.contact_date)}</span>
                </div>
                {c.topic && <div className="mt-1.5 text-xs font-medium text-slate-400">事由：{c.topic}</div>}
                {c.summary && <p className="mt-0.5 text-sm text-slate-500">{c.summary}</p>}
                {c.follow_up && <p className="mt-1 text-xs text-slate-400">跟进：{c.follow_up}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="记录家校联系"
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
            <Input type="date" value={form.contact_date} onChange={(e) => setForm({ ...form, contact_date: e.target.value })} />
          </Field>
          <Field label="方式">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="沟通对象">
            <Select value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
              {['爸爸', '妈妈', '爷爷', '奶奶', '其他'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="事由">
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </Field>
          <Field label="下次联系日期">
            <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
          </Field>
          <Field label="沟通要点">
            <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <Field label="结果 / 跟进事项">
            <Textarea value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
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
