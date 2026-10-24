'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Pencil, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import Watermark from '@/components/Watermark';
import type { CustomFieldEntry, FocusSummaryNote, SpecialFocusLog, Student, TimelineItem } from '@/lib/types';
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
  Select,
  Textarea,
} from '@/components/ui';
import { FAMILY_STRUCTURES, FOCUS_SUMMARY_CATEGORIES, SPECIAL_LEVEL_COLOR } from '@/lib/constants';
import { SURVEY_GROUP_LABEL, SURVEY_QUESTIONS, type SurveyGroup } from '@/lib/survey';
import { maskPhone, formatDate, cn, today, addDays } from '@/lib/utils';
import { useToast } from '@/components/Toast';

const KIND_STYLE: Record<string, string> = {
  考勤: 'bg-blue-500/10 text-blue-300',
  作业: 'bg-orange-500/10 text-orange-300',
  事件: 'bg-purple-500/10 text-purple-300',
  谈话: 'bg-green-500/10 text-green-300',
  家校: 'bg-cyan-500/10 text-cyan-300',
  荣誉: 'bg-yellow-500/10 text-yellow-300',
  成绩: 'bg-brand-500/15 text-brand-300',
};

// 重点学生汇总的类别配色（与「重点学生汇总」页一致）
const CATEGORY_COLOR: Record<string, string> = {
  健康安全: 'bg-red-500/15 text-red-300',
  心理行为: 'bg-violet-500/15 text-violet-300',
  家庭经济: 'bg-amber-500/15 text-amber-300',
  睡眠问题: 'bg-blue-500/15 text-blue-300',
  家长诉求: 'bg-emerald-500/15 text-emerald-300',
};

const EMPTY_BASIC = {
  gender: '',
  ethnicity: '',
  birthday: '',
  family_structure: '',
  is_boarding: '0',
  primary_school: '',
  entrance_score: '',
  address: '',
  guardian_name: '',
  guardian_relation: '',
  guardian_phone: '',
  guardian2_name: '',
  guardian2_phone: '',
  pickup_person: '',
  health_notes: '',
  notes: '',
};
type BasicDraft = typeof EMPTY_BASIC;

const EMPTY_FOCUS = { id: '', category: '健康安全', detail: '', advice: '' };

function StudentDetail() {
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { refresh, settings, currentClassId } = useClass();
  // 手机号打码由「设置 → 列表手机号打码」控制，默认显示完整号码
  const maskPhoneOn = settings?.mask_phone ?? false;
  const toast = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [focusNotes, setFocusNotes] = useState<FocusSummaryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 基本信息编辑
  const [basicEditing, setBasicEditing] = useState(false);
  const [basicDraft, setBasicDraft] = useState<BasicDraft>(EMPTY_BASIC);
  const [basicSaving, setBasicSaving] = useState(false);

  // 调查表编辑
  const [surveyEditing, setSurveyEditing] = useState(false);
  const [surveyDraft, setSurveyDraft] = useState<Record<string, string>>({});
  const [surveySaving, setSurveySaving] = useState(false);

  // 自写条目（两个区块共用一份，按 section 区分）
  const [customFields, setCustomFields] = useState<CustomFieldEntry[]>([]);

  // 关注级别调整（与「重点关注」页同一套：级别 + 原因 + 下次联系，并写入变更台账）
  const [levelModal, setLevelModal] = useState<{ level: string; reason: string; nextDate: string } | null>(null);
  const [levelSaving, setLevelSaving] = useState(false);
  const [levelLogs, setLevelLogs] = useState<SpecialFocusLog[]>([]);

  // 重点关注台账
  const [focusModal, setFocusModal] = useState<typeof EMPTY_FOCUS | null>(null);
  const [focusSaving, setFocusSaving] = useState(false);
  const [confirmDelFocus, setConfirmDelFocus] = useState<FocusSummaryNote | null>(null);

  const load = async () => {
    if (!id) {
      setError('缺少学生 ID');
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    const { data: s, error: e } = await sb.from('students').select('*').eq('id', id).single();
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    const stu = s as Student;
    setStudent(stu);
    setCustomFields(stu.custom_fields ?? []);
    const [tRes, fRes, lRes] = await Promise.all([
      sb.from('v_growth_timeline').select('*').eq('student_id', id).order('ts', { ascending: false }).limit(100),
      // 重点学生汇总按「班级 + 姓名」关联（与汇总页同一张表）
      sb
        .from('focus_summary_notes')
        .select('*')
        .eq('class_id', stu.class_id)
        .eq('student_name', stu.name)
        .order('created_at'),
      sb
        .from('special_focus_logs')
        .select('*')
        .eq('student_id', id)
        .order('change_date', { ascending: false })
        .limit(20),
    ]);
    setTimeline((tRes?.data ?? []) as TimelineItem[]);
    setFocusNotes((fRes?.data ?? []) as FocusSummaryNote[]);
    setLevelLogs((lRes?.data ?? []) as SpecialFocusLog[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Loading />;
  if (error || !student) return <ErrorBox message={error || '学生不存在'} />;

  const phoneCell = (p?: string | null): ReactNode => {
    if (!p) return '—';
    if (maskPhoneOn) return <span title="已按「设置 → 列表手机号打码」隐藏中间四位">{maskPhone(p)}</span>;
    return (
      <a href={`tel:${p}`} className="tabular-nums text-brand-300 hover:underline" title="点击拨打电话">
        {p}
      </a>
    );
  };

  const survey = (student.survey ?? null) as Record<string, string> | null;
  const hasSurvey = !!survey && Object.keys(survey).length > 0;
  const surveyGroups: SurveyGroup[] = ['basic', 'family', 'health', 'mind', 'expect'];

  const customOf = (section: 'basic' | 'survey') => customFields.filter((c) => c.section === section);

  const addCustom = (section: 'basic' | 'survey') =>
    setCustomFields((p) => [...p, { section, label: '', value: '' }]);

  const setCustom = (idx: number, key: 'label' | 'value', v: string) =>
    setCustomFields((p) => p.map((c, i) => (i === idx ? { ...c, [key]: v } : c)));

  const removeCustom = (idx: number) => setCustomFields((p) => p.filter((_, i) => i !== idx));

  /** 过滤掉完全空白的自写条目后落库 */
  const cleanCustom = () =>
    customFields
      .map((c) => ({ ...c, label: c.label.trim(), value: c.value.trim() }))
      .filter((c) => c.label || c.value);

  /* ---------- 基本信息编辑 ---------- */
  const startBasicEdit = () => {
    setBasicDraft({
      gender: student.gender ?? '',
      ethnicity: student.ethnicity ?? '',
      birthday: (student.birthday ?? '').slice(0, 10),
      family_structure: student.family_structure ?? '',
      is_boarding: student.is_boarding ? '1' : '0',
      primary_school: student.primary_school ?? '',
      entrance_score: student.entrance_score != null ? String(student.entrance_score) : '',
      address: student.address ?? '',
      guardian_name: student.guardian_name ?? '',
      guardian_relation: student.guardian_relation ?? '',
      guardian_phone: student.guardian_phone ?? '',
      guardian2_name: student.guardian2_name ?? '',
      guardian2_phone: student.guardian2_phone ?? '',
      pickup_person: student.pickup_person ?? '',
      health_notes: student.health_notes ?? '',
      notes: student.notes ?? '',
    });
    setBasicEditing(true);
  };

  const saveBasic = async () => {
    if (!student) return;
    setBasicSaving(true);
    try {
      const d = basicDraft;
      const payload = {
        gender: d.gender || null,
        ethnicity: d.ethnicity.trim() || null,
        birthday: d.birthday || null,
        family_structure: d.family_structure || null,
        is_boarding: d.is_boarding === '1',
        primary_school: d.primary_school.trim() || null,
        entrance_score: d.entrance_score.trim() === '' ? null : Number(d.entrance_score),
        address: d.address.trim() || null,
        guardian_name: d.guardian_name.trim() || null,
        guardian_relation: d.guardian_relation.trim() || null,
        guardian_phone: d.guardian_phone.trim() || null,
        guardian2_name: d.guardian2_name.trim() || null,
        guardian2_phone: d.guardian2_phone.trim() || null,
        pickup_person: d.pickup_person.trim() || null,
        health_notes: d.health_notes.trim() || null,
        notes: d.notes.trim() || null,
        custom_fields: cleanCustom(),
      };
      const { error: e } = await getSupabase().from('students').update(payload).eq('id', student.id);
      if (e) throw e;
      await audit('update', 'student', student.id, { from: 'profile' });
      setStudent({ ...student, ...payload } as Student);
      setCustomFields(payload.custom_fields);
      setBasicEditing(false);
      toast('基本信息已更新');
      refresh();
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setBasicSaving(false);
    }
  };

  /* ---------- 调查表编辑 ---------- */
  const startSurveyEdit = () => {
    setSurveyDraft({ ...(survey ?? {}) });
    setSurveyEditing(true);
  };

  const saveSurvey = async () => {
    if (!student) return;
    setSurveySaving(true);
    try {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(surveyDraft)) {
        if (v.trim()) cleaned[k] = v.trim();
      }
      const payload = { survey: cleaned, custom_fields: cleanCustom() };
      const { error } = await getSupabase().from('students').update(payload).eq('id', student.id);
      if (error) throw error;
      setStudent({ ...student, survey: cleaned } as Student);
      setCustomFields(payload.custom_fields);
      setSurveyEditing(false);
      toast('调查表已更新');
      refresh();
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setSurveySaving(false);
    }
  };

  /* ---------- 关注级别 ---------- */
  const openLevel = () => {
    setLevelModal({
      level: student.special_level,
      reason: student.special_reason ?? '',
      nextDate: student.special_level === '无' ? '' : addDays(today(), student.special_level === '红' ? 7 : 14),
    });
  };

  const saveLevel = async () => {
    if (!student || !levelModal) return;
    setLevelSaving(true);
    try {
      const sb = getSupabase();
      const reason = levelModal.reason.trim() || null;
      // 旧级别必须在 update 之前取：本地状态对象可能被客户端就地更新（演示模式即如此），
      // update 之后再读会拿到新值，导致"级别是否变化"判断永远为假、台账漏记。
      const fromLevel = student.special_level;
      const toLevel = levelModal.level;
      const { error } = await sb
        .from('students')
        .update({ special_level: toLevel, special_reason: reason })
        .eq('id', student.id);
      if (error) throw error;
      // 级别真的变了才写台账（只改原因不产生噪音记录）
      if (toLevel !== fromLevel) {
        const { error: logErr } = await sb.from('special_focus_logs').insert({
          class_id: student.class_id,
          student_id: student.id,
          change_date: today(),
          level_from: fromLevel,
          level_to: toLevel,
          reason,
          next_contact_date: toLevel === '无' ? null : levelModal.nextDate || null,
        });
        if (logErr) throw logErr;
      }
      await audit('update', 'student_focus_level', student.id, {
        from: fromLevel,
        to: toLevel,
        from_page: 'profile',
      });
      toast(
        toLevel === '无'
          ? `已解除「${student.name}」的重点关注`
          : `已把「${student.name}」的关注级别设为「${toLevel}」`
      );
      setLevelModal(null);
      await load();
      refresh();
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setLevelSaving(false);
    }
  };

  /* ---------- 重点关注台账 ---------- */
  const saveFocus = async () => {
    if (!student || !focusModal) return;
    if (!focusModal.detail.trim()) {
      toast('请填写具体情况', 'info');
      return;
    }
    setFocusSaving(true);
    try {
      const sb = getSupabase();
      const payload = {
        class_id: student.class_id,
        student_name: student.name,
        gender: student.gender ?? null,
        family_structure: student.family_structure ?? null,
        category: focusModal.category,
        detail: focusModal.detail.trim(),
        advice: focusModal.advice.trim() || null,
      };
      if (focusModal.id) {
        const { error } = await sb.from('focus_summary_notes').update(payload).eq('id', focusModal.id);
        if (error) throw error;
        await audit('update', 'focus_summary_note', focusModal.id, { from: 'profile' });
        toast('关注条目已更新');
      } else {
        const { error } = await sb.from('focus_summary_notes').insert(payload);
        if (error) throw error;
        await audit('insert', 'focus_summary_note', undefined, { student: student.name, from: 'profile' });
        toast('已加入重点关注');
      }
      setFocusModal(null);
      await load();
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setFocusSaving(false);
    }
  };

  const removeFocus = async () => {
    if (!confirmDelFocus) return;
    await getSupabase().from('focus_summary_notes').delete().eq('id', confirmDelFocus.id);
    await audit('delete', 'focus_summary_note', confirmDelFocus.id, { from: 'profile' });
    toast('已删除该条关注记录');
    setConfirmDelFocus(null);
    await load();
  };

  const basicRows: [string, ReactNode][] = [
    ['性别', student.gender ?? '—'],
    ['民族', student.ethnicity ?? '—'],
    ['生日', student.birthday ? formatDate(student.birthday) : '—'],
    ['家庭结构', student.family_structure ?? '—'],
    ['住校', student.is_boarding ? '是' : '否'],
    ['毕业小学', student.primary_school ?? '—'],
    ['入学成绩', student.entrance_score != null ? String(student.entrance_score) : '—'],
    ['住址', student.address ?? '—'],
    [
      '监护人',
      student.guardian_name
        ? `${student.guardian_name}${student.guardian_relation ? `（${student.guardian_relation}）` : ''}`
        : '—',
    ],
    ['电话', phoneCell(student.guardian_phone)],
    ['第二监护人', student.guardian2_name ?? '—'],
    ['第二电话', phoneCell(student.guardian2_phone)],
    ['主要接送人', student.pickup_person ?? '—'],
  ];

  const basicCustom = customOf('basic');
  const surveyCustom = customOf('survey');

  return (
    <div className="space-y-4">
      <Watermark />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/students" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700/60">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-slate-100">
          {student.name}
          <span className="ml-2 text-sm font-normal text-slate-400">学号 {student.student_no}</span>
        </h1>
        <Badge className={SPECIAL_LEVEL_COLOR[student.special_level] ?? ''}>
          {student.special_level === '无' ? '普通' : `重点关注（${student.special_level}）`}
        </Badge>
        {focusNotes.length > 0 && (
          <Badge className="bg-rose-500/15 text-rose-300">汇总台账 {focusNotes.length} 条</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 基本信息（可直接编辑 + 自写条目） */}
        <Card className="lg:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">基本信息</h3>
            {basicEditing ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setBasicEditing(false)}>
                  <X size={14} /> 取消
                </Button>
                <Button size="sm" disabled={basicSaving} onClick={saveBasic}>
                  {basicSaving ? '保存中…' : '保存'}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startBasicEdit}>
                <Pencil size={14} /> 编辑
              </Button>
            )}
          </div>

          {basicEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="性别">
                  <Select value={basicDraft.gender} onChange={(e) => setBasicDraft({ ...basicDraft, gender: e.target.value })}>
                    <option value="">未填</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </Select>
                </Field>
                <Field label="民族">
                  <Input
                    value={basicDraft.ethnicity}
                    onChange={(e) => setBasicDraft({ ...basicDraft, ethnicity: e.target.value })}
                    placeholder="如：汉族"
                  />
                </Field>
                <Field label="生日">
                  <Input type="date" value={basicDraft.birthday} onChange={(e) => setBasicDraft({ ...basicDraft, birthday: e.target.value })} />
                </Field>
                <Field label="家庭结构">
                  <Select
                    value={basicDraft.family_structure}
                    onChange={(e) => setBasicDraft({ ...basicDraft, family_structure: e.target.value })}
                  >
                    <option value="">未填</option>
                    {FAMILY_STRUCTURES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="是否住校">
                  <Select value={basicDraft.is_boarding} onChange={(e) => setBasicDraft({ ...basicDraft, is_boarding: e.target.value })}>
                    <option value="0">否</option>
                    <option value="1">是</option>
                  </Select>
                </Field>
                <Field label="毕业小学">
                  <Input value={basicDraft.primary_school} onChange={(e) => setBasicDraft({ ...basicDraft, primary_school: e.target.value })} />
                </Field>
                <Field label="入学成绩">
                  <Input
                    type="number"
                    value={basicDraft.entrance_score}
                    onChange={(e) => setBasicDraft({ ...basicDraft, entrance_score: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="住址">
                <Input value={basicDraft.address} onChange={(e) => setBasicDraft({ ...basicDraft, address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="监护人姓名">
                  <Input value={basicDraft.guardian_name} onChange={(e) => setBasicDraft({ ...basicDraft, guardian_name: e.target.value })} />
                </Field>
                <Field label="关系">
                  <Input value={basicDraft.guardian_relation} onChange={(e) => setBasicDraft({ ...basicDraft, guardian_relation: e.target.value })} />
                </Field>
                <Field label="监护人电话">
                  <Input value={basicDraft.guardian_phone} onChange={(e) => setBasicDraft({ ...basicDraft, guardian_phone: e.target.value })} />
                </Field>
                <Field label="第二监护人">
                  <Input value={basicDraft.guardian2_name} onChange={(e) => setBasicDraft({ ...basicDraft, guardian2_name: e.target.value })} />
                </Field>
                <Field label="第二电话">
                  <Input value={basicDraft.guardian2_phone} onChange={(e) => setBasicDraft({ ...basicDraft, guardian2_phone: e.target.value })} />
                </Field>
                <Field label="主要接送人">
                  <Input value={basicDraft.pickup_person} onChange={(e) => setBasicDraft({ ...basicDraft, pickup_person: e.target.value })} />
                </Field>
              </div>
              <Field label="健康备注（过敏史 / 既往病史）">
                <Textarea value={basicDraft.health_notes} onChange={(e) => setBasicDraft({ ...basicDraft, health_notes: e.target.value })} />
              </Field>
              <Field label="备注">
                <Textarea value={basicDraft.notes} onChange={(e) => setBasicDraft({ ...basicDraft, notes: e.target.value })} />
              </Field>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {basicRows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="shrink-0 text-slate-400">{k}</dt>
                  <dd className="text-right text-slate-200">{v}</dd>
                </div>
              ))}
              {/* 自写条目（查看态） */}
              {basicCustom
                .filter((c) => c.label || c.value)
                .map((c, i) => (
                  <div key={`c${i}`} className="flex justify-between gap-2">
                    <dt className="shrink-0 text-slate-400">{c.label || '（未命名）'}</dt>
                    <dd className="whitespace-pre-line text-right text-slate-200">{c.value || '—'}</dd>
                  </div>
                ))}
            </dl>
          )}

          {/* 自写条目（编辑态）：两个区块共用，这里只管 basic */}
          {basicEditing && (
            <div className="mt-4 border-t border-slate-700/60 pt-3">
              <div className="mb-2 text-xs font-medium text-slate-400">自写条目（自己加的字段）</div>
              <div className="space-y-2">
                {basicCustom.map((c) => {
                  const idx = customFields.indexOf(c);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={c.label}
                        onChange={(e) => setCustom(idx, 'label', e.target.value)}
                        placeholder="字段名，如：暑假就医"
                        className="w-32"
                      />
                      <Input value={c.value} onChange={(e) => setCustom(idx, 'value', e.target.value)} placeholder="内容" />
                      <button
                        onClick={() => removeCustom(idx)}
                        title="删除这条"
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => addCustom('basic')}>
                  <Plus size={14} /> 添加自写条目
                </Button>
              </div>
            </div>
          )}

          {!basicEditing && (
            <>
              {student.health_notes && (
                <div className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-300">
                  ⚕️ 健康备注：{student.health_notes}
                </div>
              )}
              {student.special_reason && student.special_level !== '无' && (
                <div className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-300">
                  ⚠️ 关注原因：{student.special_reason}
                </div>
              )}
              {student.notes && (
                <div className="mt-2 rounded-lg bg-slate-800/60 p-2.5 text-xs text-slate-400">
                  📝 备注：{student.notes}
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">💡 信息可直接在此编辑；字段不够用时加「自写条目」</p>
            </>
          )}
        </Card>

        {/* 成长时间线 */}
        <Card className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">成长时间线</h3>
          {timeline.length === 0 ? (
            <Empty text="暂无记录" />
          ) : (
            <ol className="relative ml-2 space-y-3 border-l border-slate-700 pl-4">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21.5px] top-1.5 h-2 w-2 rounded-full bg-brand-400" />
                  <div className="flex items-center gap-2">
                    <Badge className={KIND_STYLE[t.kind] ?? 'bg-slate-700/60 text-slate-500'}>{t.kind}</Badge>
                    <span className="text-sm font-medium text-slate-200">{t.title ?? ''}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDate(t.ts)}</span>
                  </div>
                  {t.detail && <div className="mt-0.5 text-xs text-slate-400">{t.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* 重点关注台账（数据来自「重点学生汇总」，按姓名关联） */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
            <AlertTriangle size={15} className="text-rose-400" />
            重点关注台账
            <span className="ml-1 text-xs font-normal text-slate-400">
              （与「
              <Link href="/focus-summary" className="text-brand-300 hover:underline">
                重点学生汇总
              </Link>
              」同一批数据，这里改了两边同步）
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={openLevel}>
              <ShieldAlert size={14} /> 调整关注级别
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFocusModal({ ...EMPTY_FOCUS })}>
              <Plus size={14} /> 加关注条目
            </Button>
          </div>
        </div>

        {/* 当前关注级别（可改） */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-800/40 px-3 py-2 text-xs">
          <span className="text-slate-400">当前级别</span>
          <Badge className={SPECIAL_LEVEL_COLOR[student.special_level] ?? ''}>
            {student.special_level === '无' ? '普通（未关注）' : `${student.special_level}级`}
          </Badge>
          {student.special_reason && (
            <span className="min-w-0 flex-1 truncate text-slate-300">原因：{student.special_reason}</span>
          )}
          <button onClick={openLevel} className="ml-auto shrink-0 text-brand-300 hover:underline">
            修改
          </button>
        </div>

        {focusNotes.length === 0 ? (
          <Empty
            text="这位同学还没有重点关注记录。点名原因写一条，班会、家访、心理老师联动时都用得上。"
            emoji="🛡️"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="outline" onClick={openLevel}>
                  <ShieldAlert size={14} /> 调整关注级别
                </Button>
                <Button size="sm" onClick={() => setFocusModal({ ...EMPTY_FOCUS })}>
                  <Plus size={14} /> 加关注条目
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="space-y-2">
            {focusNotes.map((n) => (
              <li key={n.id} className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={CATEGORY_COLOR[n.category] ?? 'bg-slate-500/15 text-slate-300'}>
                    {n.category}
                  </Badge>
                  {n.family_structure && (
                    <span className="text-[11px] text-slate-400">{n.family_structure}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setFocusModal({
                          id: n.id,
                          category: n.category,
                          detail: n.detail ?? '',
                          advice: n.advice ?? '',
                        })
                      }
                    >
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setConfirmDelFocus(n)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm text-slate-200">{n.detail}</p>
                {n.advice && (
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-400">建议/跟进：{n.advice}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {levelLogs.length > 0 && (
          <details className="mt-3 border-t border-slate-700/60 pt-3">
            <summary className="cursor-pointer select-none text-xs text-slate-400">
              级别变更记录（{levelLogs.length} 次，点开看历史）
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {levelLogs.map((l) => (
                <li key={l.id}>
                  {formatDate(l.change_date)}：
                  <span className="text-slate-300">
                    {l.level_from === '无' ? '普通' : l.level_from} → {l.level_to === '无' ? '普通' : l.level_to}
                  </span>
                  {l.reason ? `（${l.reason}）` : ''}
                  {l.next_contact_date ? ` · 下次联系 ${formatDate(l.next_contact_date)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* 新生调查表（可编辑每题 + 自写题目） */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            📋 新生调查表
            <span className="ml-2 text-xs font-normal text-slate-400">
              （入学时家长填写，共 {SURVEY_QUESTIONS.length} 题，可直接修改；也可自写题目）
            </span>
          </h3>
          {surveyEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSurveyEditing(false)}>
                <X size={14} /> 取消
              </Button>
              <Button size="sm" disabled={surveySaving} onClick={saveSurvey}>
                {surveySaving ? '保存中…' : '保存修改'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startSurveyEdit}>
              <Pencil size={14} /> {hasSurvey ? '编辑' : '手动录入'}
            </Button>
          )}
        </div>

        {!hasSurvey && !surveyEditing && (
          <p className="mb-3 rounded-lg bg-slate-800/60 p-2.5 text-xs text-slate-400">
            还没有调查表数据。可以点右上「手动录入」按题填写，也可以到「
            <Link href="/import" className="text-brand-300 hover:underline">
              导入中心
            </Link>
            」上传家长填写的调查表自动解析。
          </p>
        )}

        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {surveyGroups.map((g) => {
            const items = SURVEY_QUESTIONS.filter(
              (q) => q.group === g && !q.noStore && (surveyEditing || survey?.[String(q.no)])
            );
            const groupCustom = surveyEditing
              ? surveyCustom
              : surveyCustom.filter((c) => c.label || c.value);
            // 自写题目挂在最后一个分组下，避免空分组被跳过
            const isLastGroup = g === surveyGroups[surveyGroups.length - 1];
            if (items.length === 0 && !(isLastGroup && groupCustom.length > 0)) return null;
            return (
              <div key={g}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {SURVEY_GROUP_LABEL[g]}
                </div>
                <dl className="space-y-1.5 text-xs">
                  {items.map((q) => (
                    <div key={q.no} className="flex justify-between gap-3">
                      <dt className="w-24 shrink-0 pt-1.5 text-slate-400">{q.label}</dt>
                      <dd className="min-w-0 flex-1">
                        {surveyEditing ? (
                          <textarea
                            value={surveyDraft[String(q.no)] ?? ''}
                            onChange={(e) => setSurveyDraft((p) => ({ ...p, [String(q.no)]: e.target.value }))}
                            rows={Math.min(3, Math.max(1, Math.ceil((surveyDraft[String(q.no)] ?? '').length / 30)))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-brand-400"
                          />
                        ) : (
                          <span className="block whitespace-pre-line text-right leading-5 text-slate-200">
                            {survey?.[String(q.no)] || '—'}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}

                  {/* 自写题目 */}
                  {isLastGroup &&
                    groupCustom.map((c) => {
                      const idx = customFields.indexOf(c);
                      return (
                        <div key={idx} className="flex justify-between gap-3">
                          <dt className="w-24 shrink-0 pt-1.5 text-brand-300">
                            {surveyEditing ? (
                              <input
                                value={c.label}
                                onChange={(e) => setCustom(idx, 'label', e.target.value)}
                                placeholder="自写题目"
                                className="w-full rounded-lg border border-brand-500/40 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-brand-400"
                              />
                            ) : (
                              <span>{c.label || '（未命名）'}</span>
                            )}
                          </dt>
                          <dd className="min-w-0 flex-1">
                            {surveyEditing ? (
                              <div className="flex items-start gap-1">
                                <textarea
                                  value={c.value}
                                  onChange={(e) => setCustom(idx, 'value', e.target.value)}
                                  rows={Math.min(3, Math.max(1, Math.ceil(c.value.length / 30)))}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-brand-400"
                                />
                                <button
                                  onClick={() => removeCustom(idx)}
                                  title="删除这条自写题目"
                                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="block whitespace-pre-line text-right leading-5 text-slate-200">
                                {c.value || '—'}
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}

                  {isLastGroup && surveyEditing && (
                    <div className="pt-1">
                      <Button variant="outline" size="sm" onClick={() => addCustom('survey')}>
                        <Plus size={14} /> 添加自写题目
                      </Button>
                    </div>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 关注级别调整 */}
      <Modal
        open={!!levelModal}
        title={`调整关注级别：${student.name}`}
        onClose={() => setLevelModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setLevelModal(null)}>
              取消
            </Button>
            <Button disabled={levelSaving} onClick={saveLevel}>
              {levelSaving ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        {levelModal && (
          <div className="space-y-4">
            <Field label="级别" required>
              <Select
                value={levelModal.level}
                onChange={(e) =>
                  setLevelModal({
                    ...levelModal,
                    level: e.target.value,
                    // 选级别后自动给一个合理的下次联系日期：红 7 天、黄 14 天
                    nextDate:
                      e.target.value === '无'
                        ? ''
                        : addDays(today(), e.target.value === '红' ? 7 : 14),
                  })
                }
              >
                <option value="无">无（解除关注）</option>
                <option value="黄">黄（需观察）</option>
                <option value="红">红（重点关注）</option>
              </Select>
            </Field>
            <Field label="关注原因" hint="写具体事实，如：父母离异后情绪波动大；月考多科不及格">
              <Textarea
                value={levelModal.reason}
                onChange={(e) => setLevelModal({ ...levelModal, reason: e.target.value })}
              />
            </Field>
            <Field label="下次联系日期" hint="红级建议 7 天、黄级 14 天；设为「无」时不需要">
              <Input
                type="date"
                value={levelModal.nextDate}
                disabled={levelModal.level === '无'}
                onChange={(e) => setLevelModal({ ...levelModal, nextDate: e.target.value })}
              />
            </Field>
            <p className="text-xs leading-5 text-slate-400">
              级别变更会写入台账，可追溯历史（本页下方「级别变更记录」能看到）。
              设为「黄/红」后，这位同学会出现在「重点关注」和「重点学生汇总」的提醒里。
            </p>
          </div>
        )}
      </Modal>

      {/* 重点关注条目编辑 */}
      <Modal
        open={!!focusModal}
        title={focusModal?.id ? '编辑关注条目' : '加入重点关注'}
        onClose={() => setFocusModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setFocusModal(null)}>
              取消
            </Button>
            <Button disabled={focusSaving} onClick={saveFocus}>
              {focusSaving ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        {focusModal && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-800/60 p-2.5 text-xs text-slate-400">
              对象：<b className="text-slate-200">{student.name}</b>
              {student.family_structure ? ` · ${student.family_structure}` : ''}
              <span className="ml-1">（性别与家庭结构会随学生档案存档）</span>
            </div>
            <Field label="类别" required>
              <Select
                value={focusModal.category}
                onChange={(e) => setFocusModal({ ...focusModal, category: e.target.value })}
              >
                {FOCUS_SUMMARY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="具体情况" required hint="写清楚事实：诊断、表现、家庭状况，越具体越有用">
              <Textarea
                value={focusModal.detail}
                onChange={(e) => setFocusModal({ ...focusModal, detail: e.target.value })}
                placeholder="如：先天性心脏室间隔缺损，术后康复"
              />
            </Field>
            <Field label="建议 / 跟进措施">
              <Textarea
                value={focusModal.advice}
                onChange={(e) => setFocusModal({ ...focusModal, advice: e.target.value })}
                placeholder="如：严禁剧烈运动；体育课、跑操需特殊关照"
              />
            </Field>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!confirmDelFocus}
        title="删除关注条目"
        message={`确定删除这条「${confirmDelFocus?.category ?? ''}」记录吗？删除后「重点学生汇总」里也会同步消失。`}
        danger
        onCancel={() => setConfirmDelFocus(null)}
        onConfirm={removeFocus}
      />
    </div>
  );
}

export default function StudentDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudentDetail />
    </Suspense>
  );
}
