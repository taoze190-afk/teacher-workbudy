'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { Exam } from '@/lib/types';
import { DEFAULT_FULL_SCORE, DEFAULT_FULL_SCORE_FALLBACK, DEFAULT_SUBJECTS, EXAM_TYPES } from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function ExamsPage() {
  const { currentClassId, currentClass, refresh } = useClass();
  const toast = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    exam_type: '月考',
    exam_date: new Date().toISOString().slice(0, 10),
  });
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [newSubject, setNewSubject] = useState('');
  const [newSubjectScore, setNewSubjectScore] = useState('100');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fromLast, setFromLast] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<Exam | null>(null);
  // 编辑已有考试：科目或满分建好后写错是常事，之前只能删除重建，
  // 而删除考试会连带删掉所有成绩（on delete cascade），代价太大。
  const [editing, setEditing] = useState<Exam | null>(null);
  const [originalSubjects, setOriginalSubjects] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    getSupabase()
      .from('exams')
      .select('*')
      .eq('class_id', currentClassId)
      .order('exam_date', { ascending: false })
      .then(({ data }) => {
        setExams((data ?? []) as Exam[]);
        setLoading(false);
      });
  }, [currentClassId, tick]);

  // 各科默认满分：语文/数学/英语 120，其余 100（初一常见设置）
  const defaultSubjects = () => {
    const subs: Record<string, string> = {};
    for (const s of currentClass?.subjects?.length ? currentClass.subjects : DEFAULT_SUBJECTS) {
      subs[s] = DEFAULT_FULL_SCORE[s] ?? DEFAULT_FULL_SCORE_FALLBACK;
    }
    return subs;
  };

  const openAdd = async () => {
    setForm({ name: '', exam_type: '月考', exam_date: new Date().toISOString().slice(0, 10) });
    setSubjects(defaultSubjects());
    setNewSubject('');
    setNewSubjectScore(DEFAULT_FULL_SCORE_FALLBACK);
    setFromLast(false);
    setEditing(null);
    setOriginalSubjects([]);
    setError('');
    setModalOpen(true);
    // 优先沿用上一场考试的科目与满分：同一学段满分基本固定，
    // 省去每次重填，也避免把数学 120 误设成 100（那会让及格率/优秀率全算错）。
    const last = exams[0];
    if (!last) return;
    const { data } = await getSupabase()
      .from('exam_subjects')
      .select('subject,full_score')
      .eq('exam_id', last.id);
    const subs: Record<string, string> = {};
    for (const r of (data ?? []) as { subject: string; full_score: number }[]) {
      subs[r.subject] = String(r.full_score);
    }
    if (Object.keys(subs).length > 0) {
      setSubjects(subs);
      setFromLast(true);
    }
  };

  // 编辑已有考试：载入原有科目与满分
  const openEdit = async (exam: Exam) => {
    setEditing(exam);
    setForm({ name: exam.name, exam_type: exam.exam_type, exam_date: exam.exam_date });
    setNewSubject('');
    setNewSubjectScore(DEFAULT_FULL_SCORE_FALLBACK);
    setFromLast(false);
    setError('');
    setSubjects({});
    setOriginalSubjects([]);
    setModalOpen(true);
    const { data } = await getSupabase()
      .from('exam_subjects')
      .select('subject,full_score')
      .eq('exam_id', exam.id);
    const subs: Record<string, string> = {};
    const names: string[] = [];
    for (const r of (data ?? []) as { subject: string; full_score: number }[]) {
      subs[r.subject] = String(Number(r.full_score));
      names.push(r.subject);
    }
    setSubjects(subs);
    setOriginalSubjects(names);
  };

  const addSubject = () => {
    const name = newSubject.trim();
    if (!name) {
      setError('请填写科目名称');
      return;
    }
    if (name in subjects) {
      setError(`科目「${name}」已在列表里`);
      return;
    }
    const score = newSubjectScore.trim() === '' ? '100' : newSubjectScore;
    if (isNaN(Number(score)) || Number(score) <= 0) {
      setError('满分应为大于 0 的数字');
      return;
    }
    setError('');
    setSubjects((p) => ({ ...p, [name]: score }));
    setNewSubject('');
    setNewSubjectScore('100');
  };

  const save = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('请填写考试名称');
      return;
    }
    if (!form.exam_date) {
      setError('请选择考试日期');
      return;
    }
    // 满分必须是正数：填 0 或负数会让及格率/优秀率算成 100%、折合分变成 Infinity，
    // 一旦存进数据库，之后这场考试的统计全是错的，而且很难被发现。
    const entries = Object.entries(subjects).filter(([, v]) => v !== '');
    const bad = entries.find(([, v]) => {
      const n = Number(v);
      return !Number.isFinite(n) || n <= 0 || n > 1000;
    });
    if (bad) {
      setError(`「${bad[0]}」的满分需要是 1~1000 之间的数字（当前填的是「${bad[1]}」）`);
      return;
    }
    if (entries.length === 0) {
      setError('请至少保留一个科目并填写满分，否则这场考试无法录入任何成绩');
      return;
    }

    setSaving(true);
    try {
      const sb = getSupabase();
      const payload = {
        name: form.name.trim(),
        exam_type: form.exam_type,
        exam_date: form.exam_date,
      };
      let targetId = editing?.id ?? '';
      if (editing) {
        const { error: ue } = await sb.from('exams').update(payload).eq('id', editing.id);
        if (ue) throw ue;
      } else {
        const { data, error } = await sb
          .from('exams')
          .insert({ ...payload, class_id: currentClassId })
          .select()
          .single();
        if (error) throw error;
        targetId = (data as Exam).id;
      }

      const subjectRows = entries.map(([subject, score]) => ({
        exam_id: targetId,
        class_id: currentClassId,
        subject,
        full_score: Number(score),
      }));
      // upsert：新建时插入，编辑时更新已有科目的满分（表上有 (exam_id, subject) 唯一约束）
      const { error: se } = await sb
        .from('exam_subjects')
        .upsert(subjectRows, { onConflict: 'exam_id,subject' });
      if (se) throw new Error(`考试已保存，但科目与满分保存失败：${se.message}`);

      // 编辑时若移除了某个科目，只删掉该科目的「配置」；
      // 已录入的成绩记录保留 —— 把同名科目加回来就能继续看到，避免误删成绩。
      let removed: string[] = [];
      if (editing) {
        removed = originalSubjects.filter((s) => !entries.some(([k]) => k === s));
        for (const s of removed) {
          const { error: de } = await sb
            .from('exam_subjects')
            .delete()
            .eq('exam_id', targetId)
            .eq('subject', s);
          if (de) throw new Error(`移除科目「${s}」失败：${de.message}`);
        }
      }

      await audit(editing ? 'update' : 'insert', 'exam', targetId, { name: payload.name });
      toast(
        editing
          ? `考试「${payload.name}」已更新（${subjectRows.length} 个科目${removed.length ? `，移除 ${removed.join('、')}` : ''}）`
          : `考试「${payload.name}」已创建，${subjectRows.length} 个科目`
      );
      setModalOpen(false);
      setEditing(null);
      reload();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDel || deleting) return;
    setDeleting(true);
    try {
      const { error } = await getSupabase().from('exams').delete().eq('id', confirmDel.id);
      if (error) throw error;
      await audit('delete', 'exam', confirmDel.id);
      toast(`考试「${confirmDel.name}」及其成绩已删除`);
      setConfirmDel(null);
      reload();
    } catch (e) {
      toast('删除失败：' + (e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // 本班科目里还没加进这场考试的（用于「快速添加」）
  const presetSubjects = currentClass?.subjects?.length ? currentClass.subjects : DEFAULT_SUBJECTS;
  const missingPresets = presetSubjects.filter((s) => !(s in subjects));

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🗂️"
        title="考试管理"
        subtitle="单元测 / 月考 / 期中 / 期末，每科满分可设"
        color={{ chip: 'bg-brand-100 text-brand-300', soft: 'bg-brand-500/15', text: 'text-brand-300' }}
      >
        <Button onClick={openAdd}>
          <Plus size={16} /> 新建考试
        </Button>
      </PageHeader>

      {exams.length === 0 ? (
        <Card>
          <Empty
            text="还没有考试，先新建一场吧（单元测/月考/期中/期末）"
            action={
              <Button onClick={openAdd}>
                <Plus size={16} /> 新建考试
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((e) => (
            <Card key={e.id} className="p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/grades?exam=${e.id}`} className="font-semibold text-brand-300 hover:underline">
                    {e.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-400">{formatDate(e.exam_date)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className="bg-brand-500/15 text-brand-300">{e.exam_type}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400"
                    title="修改考试名称、日期或各科满分"
                    onClick={() => void openEdit(e)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDel(e)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑考试' : '新建考试'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? '保存中…' : editing ? '保存修改' : '创建'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="考试名称" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：期中考试 / 第一次月考" />
          </Field>
          <Field label="类型">
            <Select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="日期">
            <Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              科目与满分
              {fromLast && (
                <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-normal text-brand-300">
                  已沿用上一场考试
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">改满分不会丢失已录入的成绩</span>
          </div>

          {Object.keys(subjects).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-600 py-6 text-center text-xs leading-6 text-slate-500">
              还没有科目
              <br />
              从下面「快速添加」点选，或添加自定义科目（至少要有一科才能录入成绩）
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(subjects).map(([subject, score]) => (
                <div
                  key={subject}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-2.5 py-2 transition-colors hover:border-brand-400/70"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100" title={subject}>
                    {subject}
                  </span>
                  <label
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900/50 px-1.5 py-0.5"
                    title={`${subject} 的满分`}
                  >
                    <span className="text-[10px] text-slate-500">满分</span>
                    <input
                      type="number"
                      value={score}
                      onChange={(e) => setSubjects((p) => ({ ...p, [subject]: e.target.value }))}
                      placeholder="100"
                      className="h-6 w-11 bg-transparent text-center text-sm font-medium text-slate-100 outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <button
                    onClick={() =>
                      setSubjects((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== subject)))
                    }
                    title={`移除「${subject}」`}
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {missingPresets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">快速添加：</span>
              {missingPresets.map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    setSubjects((p) => ({ ...p, [s]: DEFAULT_FULL_SCORE[s] ?? DEFAULT_FULL_SCORE_FALLBACK }))
                  }
                  className="rounded-lg border border-slate-600 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:border-brand-400 hover:bg-brand-500/10 hover:text-brand-300"
                >
                  ＋ {s}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-2.5">
            <div className="mb-2 text-[11px] font-medium text-slate-400">添加自定义科目</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                placeholder="科目名称，如：地理生物合卷"
                className="min-w-[11rem] flex-1"
              />
              <Input
                type="number"
                value={newSubjectScore}
                onChange={(e) => setNewSubjectScore(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                placeholder="满分"
                title="满分（默认 100）"
                className="w-24 text-center"
              />
              <Button variant="outline" size="sm" onClick={addSubject}>
                <Plus size={14} /> 添加
              </Button>
            </div>
          </div>
          {editing && (
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              移除某科只是取消该科的展示，已录入的分数仍保留在数据库里（把同名科目加回来即可恢复）
            </p>
          )}
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
      </Modal>

      <Confirm
        open={!!confirmDel}
        title="删除考试"
        message={`确定删除「${confirmDel?.name}」及其全部成绩记录吗？此操作不可恢复。`}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={remove}
      />
    </div>
  );
}
