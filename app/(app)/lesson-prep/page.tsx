'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpenText, FileDown, Plus, Presentation, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import {
  buildTemplateLesson,
  aiGenerateLesson,
  generatePptx,
  hasAi,
  saveLessonSettings,
  TEXTBOOK_LESSONS,
  LESSON_GOAL_DIMS,
  LESSON_STYLES,
} from '@/lib/lesson';
import { buildClassroomPrompt, copyText } from '@/lib/classroom-prompt';
import type { LessonPlan, LessonPlanContent, LessonSettings } from '@/lib/types';
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
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils';

type Tab = 'lib' | 'plan' | 'export';

const TEXTBOOKS = ['部编版', '人教版', '苏教版', '北师大版', '其他'];
const GRADES = ['初一上', '初一下', '初二上', '初二下', '初三上', '初三下'];

const EMPTY_CONTENT: LessonPlanContent = {
  meta: { grade: '初一上', textbook: '部编版', lesson: '', period: '第一课时', duration: '45分钟', style: '启发探究型' },
  goals: LESSON_GOAL_DIMS.map((dimension) => ({ dimension, content: '' })),
  keyPoints: [''],
  difficulties: [''],
  questions: [''],
  prep: { teacher: '', student: '' },
  process: ['情境导入', '初读感知', '精读品味', '研读探究', '拓展延伸', '课堂小结'].map((step) => ({
    step,
    duration: '8分钟',
    teacherActivity: '',
    studentActivity: '',
    intent: '',
  })),
  boardDesign: '',
  homework: { base: '', extended: '' },
  standards: [''],
  reflection: '',
  interaction: { opening: '', dialogues: '', evaluation: '' },
};

export default function LessonPrepPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('lib');
  const [settings, setSettings] = useState<LessonSettings>({
    owner_id: '',
    textbook: '部编版',
    grade: '初一上',
    lessons: [],
    outline_text: '',
    standard_text: '',
  });
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [current, setCurrent] = useState<LessonPlan | null>(null);
  const [content, setContent] = useState<LessonPlanContent>(EMPTY_CONTENT);
  const [lesson, setLesson] = useState('');
  const [customLesson, setCustomLesson] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<LessonPlan | null>(null);
  const [pptBusy, setPptBusy] = useState(false);
  const [exportPlanId, setExportPlanId] = useState('');
  const [promptPreview, setPromptPreview] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sb = getSupabase();
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const owner = u.user.id;
      const [{ data: st }, { data: pl }] = await Promise.all([
        sb.from('lesson_settings').select('*').eq('owner_id', owner).maybeSingle(),
        sb.from('lesson_plans').select('*').eq('owner_id', owner).order('updated_at', { ascending: false }),
      ]);
      if (st) setSettings({ owner_id: owner, textbook: st.textbook ?? '部编版', grade: st.grade ?? '初一上', lessons: st.lessons ?? [], outline_text: st.outline_text ?? '', standard_text: st.standard_text ?? '' });
      else setSettings((p) => ({ ...p, owner_id: owner }));
      setPlans((pl ?? []) as LessonPlan[]);
    })();
  }, [tick]);

  const saveLib = async () => {
    if (!settings.owner_id) {
      toast('请先登录', 'error');
      return;
    }
    try {
      await saveLessonSettings(settings);
      await audit('update', 'lesson_settings', settings.owner_id);
      toast('备课资料已保存');
      reload();
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    }
  };

  const toggleLesson = (l: string) => {
    setSettings((p) => ({
      ...p,
      lessons: p.lessons.includes(l) ? p.lessons.filter((x) => x !== l) : [...p.lessons, l],
    }));
  };

  const addCustomLesson = () => {
    const l = customLesson.trim();
    if (!l) return;
    setSettings((p) => ({ ...p, lessons: p.lessons.includes(l) ? p.lessons : [...p.lessons, l] }));
    setCustomLesson('');
  };

  const generate = async () => {
    const title = lesson.trim() || content.meta.lesson;
    if (!title) {
      setError('请先选择或输入课文名称');
      return;
    }
    setGenBusy(true);
    setError('');
    try {
      let c: LessonPlanContent;
      if (hasAi()) {
        try {
          c = await aiGenerateLesson(
            title,
            settings.grade,
            settings.textbook,
            settings.outline_text ?? '',
            settings.standard_text ?? '',
            content.meta.style
          );
          toast('AI 教案已生成（含课文解读参考，可直接使用）');
        } catch (e) {
          c = buildTemplateLesson(title, settings.grade, settings.textbook, content.meta.style);
          toast('AI 调用失败，已改用内置课文知识库生成完整教案（可直接上课）', 'info');
        }
      } else {
        c = buildTemplateLesson(title, settings.grade, settings.textbook, content.meta.style);
        toast('已用内置课文知识库生成完整教案（可直接上课）', 'success');
      }
      setContent(c);
      setLesson(title);
      setTab('plan');
    } catch (e) {
      setError('生成失败：' + (e as Error).message);
    } finally {
      setGenBusy(false);
    }
  };

  const savePlan = async () => {
    if (!content.meta.lesson && !lesson) {
      setError('请填写课文名称');
      return;
    }
    const title = content.meta.lesson || lesson;
    setSaving(true);
    const sb = getSupabase();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    const payload = {
      owner_id: u.user.id,
      grade: settings.grade,
      textbook: settings.textbook,
      lesson_title: title,
      content: { ...content, meta: { ...content.meta, lesson: title } },
      updated_at: new Date().toISOString(),
    };
    let id: string | undefined;
    if (current) {
      const { error: ue } = await sb.from('lesson_plans').update(payload).eq('id', current.id);
      if (ue) {
        setError('保存失败：' + ue.message);
        setSaving(false);
        return;
      }
      id = current.id;
    } else {
      const { data, error: e } = await sb.from('lesson_plans').insert(payload).select().single();
      if (e) {
        setError('保存失败：' + e.message);
        setSaving(false);
        return;
      }
      id = (data as LessonPlan).id;
    }
    await audit('update', 'lesson_plan', id, { lesson: title });
    setSaving(false);
    toast(`教案《${title}》已保存`);
    reload();
  };

  const loadPlan = (p: LessonPlan) => {
    setCurrent(p);
    if (p.content) setContent(normalizeContent(p.content));
    setLesson(p.lesson_title);
    setTab('plan');
  };

  // 兼容旧数据：缺字段用默认值补齐
  function normalizeContent(c?: LessonPlanContent | null): LessonPlanContent {
    return {
      meta: { ...EMPTY_CONTENT.meta, ...(c?.meta ?? {}) },
      goals: c?.goals?.length ? c.goals : EMPTY_CONTENT.goals,
      keyPoints: c?.keyPoints?.length ? c.keyPoints : [''],
      difficulties: c?.difficulties?.length ? c.difficulties : [''],
      questions: c?.questions?.length ? c.questions : [''],
      prep: { ...EMPTY_CONTENT.prep, ...(c?.prep ?? {}) },
      process: c?.process?.length ? c.process : EMPTY_CONTENT.process,
      boardDesign: c?.boardDesign ?? '',
      homework: { ...EMPTY_CONTENT.homework, ...(c?.homework ?? {}) },
      standards: c?.standards?.length ? c.standards : [''],
      reflection: c?.reflection ?? '',
      interaction: { ...EMPTY_CONTENT.interaction, ...(c?.interaction ?? {}) },
    };
  }

  const removePlan = async () => {
    if (!confirmDel) return;
    await getSupabase().from('lesson_plans').delete().eq('id', confirmDel.id);
    toast('教案已删除');
    setConfirmDel(null);
    reload();
  };

  // 从已保存的教案中任选一份，导出为课堂教学 PPT
  const exportPptById = async (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (!p) {
      toast('请先选择要导出的教案', 'info');
      return;
    }
    setPptBusy(true);
    try {
      await generatePptx(normalizeContent(p.content));
      toast(`《${p.lesson_title}》课堂教学 PPT 已生成并下载`);
      void audit('export', 'lesson_ppt', p.lesson_title);
    } catch (e) {
      toast('PPT 生成失败：' + (e as Error).message, 'error');
    } finally {
      setPptBusy(false);
    }
  };

  // 把教案拼成"课堂生成提示词"，复制后可直接粘到 open.maic.chat 生成互动课堂
  const copyClassroomPrompt = async (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (!p) {
      toast('请先选择教案', 'info');
      return;
    }
    const text = buildClassroomPrompt(p);
    const ok = await copyText(text);
    if (ok) {
      toast(`《${p.lesson_title}》课堂提示词已复制——到 open.maic.chat 粘贴即可生成课堂`);
      void audit('export', 'classroom_prompt', p.lesson_title);
    } else {
      toast('复制失败：浏览器不允许剪贴板，请手动选择下方文本框内容', 'error');
      setPromptPreview(text);
    }
  };

  // 默认选中：当前正在编辑的教案，否则第一份
  useEffect(() => {
    if (!exportPlanId && plans.length > 0) {
      setExportPlanId(current?.id ?? plans[0].id);
    }
  }, [plans, current, exportPlanId]);

  const setGoal = (i: number, v: string) =>
    setContent((p) => ({ ...p, goals: p.goals.map((g, gi) => (gi === i ? { ...g, content: v } : g)) }));
  const setKeyPoint = (i: number, v: string) =>
    setContent((p) => ({ ...p, keyPoints: p.keyPoints.map((k, ki) => (ki === i ? v : k)) }));
  const setDifficulty = (i: number, v: string) =>
    setContent((p) => ({ ...p, difficulties: p.difficulties.map((k, ki) => (ki === i ? v : k)) }));
  const setStep = (i: number, field: keyof LessonPlanContent['process'][number], v: string) =>
    setContent((p) => ({ ...p, process: p.process.map((s, si) => (si === i ? { ...s, [field]: v } : s)) }));
  const setStandard = (i: number, v: string) =>
    setContent((p) => ({ ...p, standards: p.standards.map((k, ki) => (ki === i ? v : k)) }));

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📖"
        title="备课教案"
        subtitle="语文 · 课标/大纲 → 专业教案 → 一键生成教学 PPT"
        color={{ chip: 'bg-brand-50 text-brand-700', soft: 'bg-brand-50', text: 'text-brand-700' }}
      >
        <div className="flex gap-1.5">
          {(
            [
              ['lib', '📚 备课资料'],
              ['plan', '✍️ 教案'],
              ['export', '📤 导出 PPT'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-brand-700 text-white' : 'bg-slate-800 text-slate-300 shadow-card hover:text-brand-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} />}

      {/* ============ 资料库 ============ */}
      {tab === 'lib' && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-sm font-bold text-slate-100">教材与年级</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="教材版本">
                <Select value={settings.textbook} onChange={(e) => setSettings({ ...settings, textbook: e.target.value })}>
                  {TEXTBOOKS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="年级">
                <Select value={settings.grade} onChange={(e) => setSettings({ ...settings, grade: e.target.value })}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-slate-400">我的课文库（用于备课，可多选/自定义）</div>
              <div className="flex flex-wrap gap-1.5">
                {(TEXTBOOK_LESSONS[settings.grade] ?? []).map((l) => (
                  <button
                    key={l}
                    onClick={() => toggleLesson(l)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                      settings.lessons.includes(l)
                        ? 'border-brand-400 bg-brand-500/15 text-brand-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-brand-400'
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={customLesson}
                  onChange={(e) => setCustomLesson(e.target.value)}
                  placeholder="自定义课文，如：春夜喜雨（杜甫）"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomLesson()}
                />
                <Button variant="outline" size="sm" onClick={addCustomLesson}>
                  <Plus size={14} /> 添加
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-bold text-slate-100">教学大纲与课程标准（粘贴文本，AI 生成教案时会参考）</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="教学大纲">
                <Textarea
                  className="min-h-[160px]"
                  value={settings.outline_text ?? ''}
                  onChange={(e) => setSettings({ ...settings, outline_text: e.target.value })}
                  placeholder="粘贴本册教学大纲：单元目标、课时安排、教学进度等"
                />
              </Field>
              <Field label="课程标准（2022 版义务教育语文课标节选）">
                <Textarea
                  className="min-h-[160px]"
                  value={settings.standard_text ?? ''}
                  onChange={(e) => setSettings({ ...settings, standard_text: e.target.value })}
                  placeholder="粘贴课程标准相关条目：核心素养、学习任务群、教学建议等"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Button onClick={saveLib}>保存备课资料</Button>
            </div>
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-bold text-slate-100">历史教案（{plans.length} 份）</h3>
            {plans.length === 0 ? (
              <Empty text="还没有教案，去「教案」页生成第一份" emoji="📖" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3">
                    <button onClick={() => loadPlan(p)} className="min-w-0 text-left">
                      <div className="truncate text-sm font-medium text-slate-200">{p.lesson_title}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.textbook} · {p.grade} · 更新于 {(p.updated_at ?? p.created_at ?? '').slice(0, 10)}
                      </div>
                    </button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDel(p)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ============ 教案 ============ */}
      {tab === 'plan' && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="课文">
                <Select value={lesson} onChange={(e) => setLesson(e.target.value)} className="w-64">
                  <option value="">请选择课文</option>
                  {settings.lessons.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="课时">
                <Select
                  value={content.meta.period}
                  onChange={(e) => setContent((p) => ({ ...p, meta: { ...p.meta, period: e.target.value } }))}
                  className="w-32"
                >
                  <option value="第一课时">第一课时</option>
                  <option value="第二课时">第二课时</option>
                </Select>
              </Field>
              <Field label="时长">
                <Select
                  value={content.meta.duration}
                  onChange={(e) => setContent((p) => ({ ...p, meta: { ...p.meta, duration: e.target.value } }))}
                  className="w-28"
                >
                  <option value="40分钟">40分钟</option>
                  <option value="45分钟">45分钟</option>
                  <option value="两课时">两课时连上</option>
                </Select>
              </Field>
              <Field label="教学风格">
                <Select
                  value={content.meta.style}
                  onChange={(e) => setContent((p) => ({ ...p, meta: { ...p.meta, style: e.target.value } }))}
                  className="w-32"
                >
                  {LESSON_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button disabled={genBusy} onClick={generate}>
                <Sparkles size={14} /> {genBusy ? '生成中…' : '生成教案'}
              </Button>
              <Button variant="outline" size="md" disabled={saving} onClick={savePlan}>
                {current ? '更新教案' : '保存教案'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {hasAi()
                ? '已配置 AI：生成时会先做课文深度解读，再生成完整教案'
                : '使用内置课文知识库生成完整教案（可直接上课）；在「设置 → AI 评语配置」填入接口可获得更贴合课文的版本'}
            </p>
          </Card>

          {content.meta.lesson && (
            <div className="space-y-3">
              {/* 教学目标 */}
              <Card>
                <h3 className="mb-2 text-sm font-bold text-slate-100">一、教学目标（核心素养四维）</h3>
                <div className="space-y-2">
                  {content.goals.map((g, i) => (
                    <div key={g.dimension} className="flex items-start gap-2">
                      <Badge className="mt-1.5 shrink-0 bg-brand-500/15 text-brand-300">{g.dimension}</Badge>
                      <Input value={g.content} onChange={(e) => setGoal(i, e.target.value)} />
                    </div>
                  ))}
                </div>
              </Card>

              {/* 重难点 */}
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">二、教学重点</h3>
                  <div className="space-y-2">
                    {content.keyPoints.map((k, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={k} onChange={(e) => setKeyPoint(i, e.target.value)} />
                        <Button variant="ghost" size="sm" onClick={() => setContent((p) => ({ ...p, keyPoints: p.keyPoints.filter((_, gi) => gi !== i) }))}>
                          <Trash2 size={13} className="text-red-400" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setContent((p) => ({ ...p, keyPoints: [...p.keyPoints, ''] }))}>
                      <Plus size={13} /> 添加
                    </Button>
                  </div>
                </Card>
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">三、教学难点</h3>
                  <div className="space-y-2">
                    {content.difficulties.map((k, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={k} onChange={(e) => setDifficulty(i, e.target.value)} />
                        <Button variant="ghost" size="sm" onClick={() => setContent((p) => ({ ...p, difficulties: p.difficulties.filter((_, gi) => gi !== i) }))}>
                          <Trash2 size={13} className="text-red-400" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setContent((p) => ({ ...p, difficulties: [...p.difficulties, ''] }))}>
                      <Plus size={13} /> 添加
                    </Button>
                  </div>
                </Card>
              </div>

              {/* 核心问题 + 教学准备 */}
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">核心问题设计（统领课堂探究）</h3>
                  <div className="space-y-2">
                    {content.questions.map((k, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={k} onChange={(e) => setContent((p) => ({ ...p, questions: p.questions.map((x, xi) => (xi === i ? e.target.value : x)) }))} />
                        <Button variant="ghost" size="sm" onClick={() => setContent((p) => ({ ...p, questions: p.questions.filter((_, gi) => gi !== i) }))}>
                          <Trash2 size={13} className="text-red-400" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setContent((p) => ({ ...p, questions: [...p.questions, ''] }))}>
                      <Plus size={13} /> 添加
                    </Button>
                  </div>
                </Card>
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">教学准备</h3>
                  <Field label="教师准备（课件/教具/资料）">
                    <Textarea className="min-h-[56px]" value={content.prep.teacher} onChange={(e) => setContent((p) => ({ ...p, prep: { ...p.prep, teacher: e.target.value } }))} />
                  </Field>
                  <Field label="学生预习要求">
                    <Textarea className="min-h-[56px]" value={content.prep.student} onChange={(e) => setContent((p) => ({ ...p, prep: { ...p.prep, student: e.target.value } }))} />
                  </Field>
                </Card>
              </div>

              {/* 教学过程 */}
              <Card>
                <h3 className="mb-3 text-sm font-bold text-slate-100">四、教学过程（时间 · 教师活动 · 学生活动 · 设计意图）</h3>
                <div className="space-y-3">
                  {content.process.map((s, i) => (
                    <div key={s.step} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge className="bg-brand-500/15 text-brand-300">{s.step}</Badge>
                        <Input
                          className="h-7 w-24"
                          value={s.duration}
                          onChange={(e) => setStep(i, 'duration', e.target.value)}
                          placeholder="时长"
                        />
                      </div>
                      <div className="grid gap-2 lg:grid-cols-3">
                        <Textarea className="min-h-[56px]" placeholder="教师活动" value={s.teacherActivity} onChange={(e) => setStep(i, 'teacherActivity', e.target.value)} />
                        <Textarea className="min-h-[56px]" placeholder="学生活动" value={s.studentActivity} onChange={(e) => setStep(i, 'studentActivity', e.target.value)} />
                        <Textarea className="min-h-[56px]" placeholder="设计意图" value={s.intent} onChange={(e) => setStep(i, 'intent', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">五、板书设计</h3>
                  <Textarea className="min-h-[120px]" value={content.boardDesign} onChange={(e) => setContent((p) => ({ ...p, boardDesign: e.target.value }))} placeholder="板书结构图（文本表示层级）" />
                </Card>
                <Card>
                  <h3 className="mb-2 text-sm font-bold text-slate-100">六、作业布置（分层）</h3>
                  <Field label="基础作业">
                    <Textarea className="min-h-[52px]" value={content.homework.base} onChange={(e) => setContent((p) => ({ ...p, homework: { ...p.homework, base: e.target.value } }))} />
                  </Field>
                  <Field label="拓展作业">
                    <Textarea className="min-h-[52px]" value={content.homework.extended} onChange={(e) => setContent((p) => ({ ...p, homework: { ...p.homework, extended: e.target.value } }))} />
                  </Field>
                </Card>
              </div>

              <Card>
                <h3 className="mb-2 text-sm font-bold text-slate-100">七、对应课程标准</h3>
                <div className="space-y-2">
                  {content.standards.map((k, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={k} onChange={(e) => setStandard(i, e.target.value)} />
                      <Button variant="ghost" size="sm" onClick={() => setContent((p) => ({ ...p, standards: p.standards.filter((_, gi) => gi !== i) }))}>
                        <Trash2 size={13} className="text-red-400" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setContent((p) => ({ ...p, standards: [...p.standards, ''] }))}>
                    <Plus size={13} /> 添加
                  </Button>
                </div>
              </Card>

              {/* 反思预设 + 互动话术 */}
              <Card>
                <h3 className="mb-2 text-sm font-bold text-slate-100">教学反思预设（可能出现的问题及应对）</h3>
                <Textarea className="min-h-[70px]" value={content.reflection} onChange={(e) => setContent((p) => ({ ...p, reflection: e.target.value }))} />
              </Card>

              <Card>
                <h3 className="mb-2 text-sm font-bold text-slate-100">课堂互动话术（导入/对话/评价，减少临场发挥压力）</h3>
                <div className="grid gap-3 lg:grid-cols-3">
                  <Field label="导入话术（2-3 种）">
                    <Textarea className="min-h-[110px]" value={content.interaction.opening} onChange={(e) => setContent((p) => ({ ...p, interaction: { ...p.interaction, opening: e.target.value } }))} />
                  </Field>
                  <Field label="核心师生对话（含预设回答与点评）">
                    <Textarea className="min-h-[110px]" value={content.interaction.dialogues} onChange={(e) => setContent((p) => ({ ...p, interaction: { ...p.interaction, dialogues: e.target.value } }))} />
                  </Field>
                  <Field label="鼓励性评价语（10 条以上）">
                    <Textarea className="min-h-[110px]" value={content.interaction.evaluation} onChange={(e) => setContent((p) => ({ ...p, interaction: { ...p.interaction, evaluation: e.target.value } }))} />
                  </Field>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ============ 导出 ============ */}
      {tab === 'export' && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-slate-100">选择教案</span>
              <Select
                value={exportPlanId}
                onChange={(e) => setExportPlanId(e.target.value)}
                className="w-72"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lesson_title}（{p.grade} · {(p.updated_at ?? '').slice(0, 10)}）
                  </option>
                ))}
              </Select>
              <Button disabled={!exportPlanId || pptBusy} onClick={() => exportPptById(exportPlanId)}>
                <FileDown size={14} /> {pptBusy ? '生成中…' : '生成课堂教学 PPT（.pptx）'}
              </Button>
              <Button variant="outline" disabled={!exportPlanId} onClick={() => copyClassroomPrompt(exportPlanId)}>
                <Presentation size={14} /> 生成课堂提示词（复制）
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              💡 PPT 按课堂流程生成：封面 → 学习目标 → 课堂主问题 → 各环节学生任务 → 小结 → 作业。
              教师活动与设计意图会写入每页的演讲者备注，投影时学生看不到，放映备注视图即可提词。
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              🎬 「生成课堂提示词」把本课的学习目标、重难点、环节拼成一段提示词，复制后粘到{' '}
              <a href="https://open.maic.chat" target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">
                open.maic.chat
              </a>{' '}
              即可生成可交互课件 + 随堂测验，生成完把课堂链接和导出资料填回
              <Link href="/classroom" className="ml-1 text-brand-300 hover:underline">
                「课堂」
              </Link>
              页。提示词里只有课文与教案内容，不含任何学生信息。
            </p>
            {promptPreview && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-slate-400">剪贴板不可用，请手动复制：</div>
                <Textarea
                  value={promptPreview}
                  readOnly
                  className="h-64 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}
            {plans.length === 0 && (
              <p className="mt-2 text-xs text-brand-300">还没有已保存的教案——先到「教案」页生成并保存，再回来导出。</p>
            )}
          </Card>
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        title="删除教案"
        message={`确定删除《${confirmDel?.lesson_title}》吗？`}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={removePlan}
      />
    </div>
  );
}
