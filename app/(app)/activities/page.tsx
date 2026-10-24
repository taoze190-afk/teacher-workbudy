'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { Activity } from '@/lib/types';
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
import { formatDate, today } from '@/lib/utils';

const EMPTY_FORM = {
  name: '',
  act_type: '主题教育',
  act_date: today(),
  description: '',
  result: '',
};

export default function ActivitiesPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    getSupabase()
      .from('activities')
      .select('*')
      .eq('class_id', currentClassId)
      .order('act_date', { ascending: false })
      .then(({ data }) => {
        setActivities((data ?? []) as Activity[]);
        setLoading(false);
      });
  }, [currentClassId, tick]);

  const save = async () => {
    setError('');
    if (!form.name) {
      setError('请填写活动名称');
      return;
    }
    setSaving(true);
    try {
      const sb = getSupabase();
      if (editing) {
        await sb.from('activities').update(form).eq('id', editing.id);
      } else {
        await sb.from('activities').insert({ ...form, class_id: currentClassId });
      }
      await audit('insert', 'activity');
      setModalOpen(false);
      toast(editing ? '活动记录已更新' : '活动记录已保存');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🎉"
        title="活动"
        subtitle="运动会 / 文艺汇演 / 社会实践 / 主题教育"
        color={{ chip: 'bg-pink-500/15 text-pink-300', soft: 'bg-pink-500/10', text: 'text-pink-300' }}
      >
        <Button
          onClick={() => {
            setEditing(null);
            setForm(EMPTY_FORM);
            setError('');
            setModalOpen(true);
          }}
        >
          <Plus size={16} /> 记录活动
        </Button>
      </PageHeader>

      {activities.length === 0 ? (
        <Card>
          <Empty
            text="暂无活动记录，先记录一次吧"
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY_FORM);
                  setError('');
                  setModalOpen(true);
                }}
              >
                <Plus size={16} /> 记录活动
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <Card key={a.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{a.name}</span>
                {a.act_type && <Badge className="bg-brand-500/15 text-brand-300">{a.act_type}</Badge>}
                <span className="ml-auto text-xs text-slate-400">{formatDate(a.act_date)}</span>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setForm({ name: a.name, act_type: a.act_type ?? '主题教育', act_date: a.act_date.slice(0, 10), description: a.description ?? '', result: a.result ?? '' }); setModalOpen(true); }}>
                  编辑
                </Button>
              </div>
              {a.description && <p className="mt-2 text-sm text-slate-500">{a.description}</p>}
              {a.result && <p className="mt-1 text-xs text-slate-400">结果/获奖：{a.result}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑活动' : '记录活动'}
        onClose={() => setModalOpen(false)}
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
          <Field label="活动名称" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="类型">
            <Select value={form.act_type} onChange={(e) => setForm({ ...form, act_type: e.target.value })}>
              <option value="运动会">运动会</option>
              <option value="文艺汇演">文艺汇演</option>
              <option value="社会实践">社会实践</option>
              <option value="主题教育">主题教育</option>
              <option value="其他">其他</option>
            </Select>
          </Field>
          <Field label="日期">
            <Input type="date" value={form.act_date} onChange={(e) => setForm({ ...form, act_date: e.target.value })} />
          </Field>
          <Field label="结果与获奖">
            <Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
          </Field>
          <Field label="活动描述">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
