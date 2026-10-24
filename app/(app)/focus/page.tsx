'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import AppLockGate from '@/components/AppLockGate';
import Watermark from '@/components/Watermark';
import type { Student } from '@/lib/types';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { SPECIAL_LEVEL_COLOR } from '@/lib/constants';
import { addDays, formatDate, today } from '@/lib/utils';

export default function FocusPage() {
  const { currentClassId } = useClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Student | null>(null);
  const [level, setLevel] = useState('黄');
  const [reason, setReason] = useState('');
  const [nextDate, setNextDate] = useState(addDays(today(), 14));
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    getSupabase()
      .from('students')
      .select('*')
      .eq('class_id', currentClassId)
      .is('deleted_at', null)
      .eq('active', true)
      .in('special_level', ['黄', '红'])
      .then(({ data }) => {
        setStudents((data ?? []) as Student[]);
        setLoading(false);
      });
  }, [currentClassId, tick]);

  const openSet = (s: Student) => {
    setModal(s);
    setLevel(s.special_level);
    setReason(s.special_reason ?? '');
    setNextDate(addDays(today(), s.special_level === '红' ? 7 : 14));
  };

  const save = async () => {
    if (!modal) return;
    const sb = getSupabase();
    await sb
      .from('students')
      .update({ special_level: level, special_reason: reason || null })
      .eq('id', modal.id);
    await sb.from('special_focus_logs').insert({
      class_id: currentClassId,
      student_id: modal.id,
      change_date: today(),
      level_from: modal.special_level,
      level_to: level,
      reason: reason || null,
      next_contact_date: nextDate || null,
    });
    await audit('view_sensitive', 'focus', modal.id, { level });
    setModal(null);
    reload();
  };

  if (loading) return <Loading />;

  return (
    <AppLockGate>
    <div className="space-y-4">
      <Watermark />
      <PageHeader
        emoji="⚠️"
        title="重点关注"
        subtitle="私密台账 · 红级每周联系 1 次，黄级每 2 周 1 次；此页需 PIN 解锁"
        color={{ chip: 'bg-rose-500/15 text-rose-300', soft: 'bg-rose-500/10', text: 'text-rose-300' }}
      />

      {students.length === 0 ? (
        <Card>
          <Empty
            text="暂无重点关注学生：到「学生档案」把关注级别调成黄级或红级，这里会自动出现并开始联系提醒"
            action={
              <Link href="/students">
                <Button variant="outline" size="sm">
                  去学生档案设置关注级别
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {students.map((s) => (
            <Card key={s.id} className="p-3.5">
              <div className="flex items-center gap-2">
                <Badge className={SPECIAL_LEVEL_COLOR[s.special_level] ?? ''}>{s.special_level}</Badge>
                <span className="text-sm font-semibold text-slate-100">{s.name}</span>
                <span className="text-xs text-slate-400">{s.student_no}</span>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => openSet(s)}>
                  调整
                </Button>
              </div>
              {s.special_reason && (
                <p className="mt-2 text-xs text-slate-400">原因：{s.special_reason}</p>
              )}
              {s.notes && <p className="mt-1 text-xs text-slate-400">备注：{s.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!modal}
        title={`调整关注级别：${modal?.name ?? ''}`}
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              取消
            </Button>
            <Button onClick={save}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="级别">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="无">无（解除关注）</option>
              <option value="黄">黄（需观察）</option>
              <option value="红">红（重点关注）</option>
            </Select>
          </Field>
          <Field label="关注原因">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="下次联系日期">
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </Field>
          <p className="text-xs text-slate-400">级别变更会写入台账（special_focus_logs），可追溯历史。</p>
        </div>
      </Modal>
    </div>
    </AppLockGate>
  );
}
