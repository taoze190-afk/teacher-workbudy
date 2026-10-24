'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ExternalLink,
  FileText,
  MonitorPlay,
  Plus,
  Printer,
  Presentation,
  Trash2,
  X,
} from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { getSupabase, audit } from '@/lib/supabase';
import type { ClassroomAttachment, ClassroomResource, ClassroomQuizSession } from '@/lib/types';
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
  Segmented,
  Textarea,
} from '@/components/ui';
import { cn, compareStudentNo, formatDate, today } from '@/lib/utils';

type StatusFilter = 'all' | '已备' | '已上';

interface StudentRow {
  id: string;
  name: string;
  student_no: string;
}

const EMPTY_FORM = {
  title: '',
  lesson_ref: '',
  resource_date: today(),
  status: '已备',
  maic_url: '',
  notes: '',
};

/** 课堂答题：点一下 对 → 错 → 未记 循环 */
type Mark = 'none' | 'ok' | 'bad';

export default function ClassroomPage() {
  const { currentClassId } = useClass();
  const toast = useToast();
  const [rows, setRows] = useState<ClassroomResource[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomResource | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachments, setAttachments] = useState<ClassroomAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<ClassroomResource | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  // 课堂答题面板
  const [quizOf, setQuizOf] = useState<ClassroomResource | null>(null);
  const [quizLabel, setQuizLabel] = useState('随堂检测');
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb.from('classroom_resources').select('*').eq('class_id', currentClassId).order('resource_date', { ascending: false }),
      sb.from('students').select('id,name,student_no').eq('class_id', currentClassId).eq('active', true),
    ]).then(([res, stu]) => {
      setRows(
        ((res.data ?? []) as ClassroomResource[]).map((r) => ({
          ...r,
          attachments: r.attachments ?? [],
          quiz_sessions: r.quiz_sessions ?? [],
        }))
      );
      setStudents(
        ((stu.data ?? []) as StudentRow[]).sort((a, b) => compareStudentNo(a.student_no, b.student_no))
      );
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAttachments([]);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (r: ClassroomResource) => {
    setEditing(r);
    setForm({
      title: r.title,
      lesson_ref: r.lesson_ref ?? '',
      resource_date: (r.resource_date ?? today()).slice(0, 10),
      status: r.status ?? '已备',
      maic_url: r.maic_url ?? '',
      notes: r.notes ?? '',
    });
    setAttachments(r.attachments ?? []);
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.title.trim()) {
      setError('请填写课题名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        lesson_ref: form.lesson_ref.trim() || null,
        resource_date: form.resource_date || today(),
        status: form.status,
        maic_url: form.maic_url.trim() || null,
        notes: form.notes.trim() || null,
        attachments: attachments.filter((a) => a.url.trim() || a.name.trim()),
      };
      const sb = getSupabase();
      if (editing) {
        const { error: e } = await sb.from('classroom_resources').update(payload).eq('id', editing.id);
        if (e) throw e;
        await audit('update', 'classroom_resource', editing.id, { title: payload.title });
        toast('课堂记录已更新');
      } else {
        const { error: e } = await sb
          .from('classroom_resources')
          .insert({ ...payload, class_id: currentClassId, quiz_sessions: [] })
          .select()
          .single();
        if (e) throw e;
        await audit('insert', 'classroom_resource', undefined, { title: payload.title });
        toast('课堂记录已保存');
      }
      setModalOpen(false);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    await getSupabase().from('classroom_resources').delete().eq('id', confirmDel.id);
    await audit('delete', 'classroom_resource', confirmDel.id, { title: confirmDel.title });
    toast(`已删除「${confirmDel.title}」`);
    setConfirmDel(null);
    reload();
  };

  /* ---------- 课堂答题 ---------- */
  const openQuiz = (r: ClassroomResource) => {
    setQuizOf(r);
    setQuizLabel(`随堂检测 ${new Date().toLocaleDateString('zh-CN')}`);
    const m: Record<string, Mark> = {};
    for (const s of students) m[s.id] = 'none';
    setMarks(m);
  };

  const cycle = (id: string) =>
    setMarks((p) => ({ ...p, [id]: p[id] === 'none' ? 'ok' : p[id] === 'ok' ? 'bad' : 'none' }));

  const quizStats = useMemo(() => {
    const list = Object.values(marks);
    const ok = list.filter((m) => m === 'ok').length;
    const bad = list.filter((m) => m === 'bad').length;
    const done = ok + bad;
    return { ok, bad, done, rate: done > 0 ? Math.round((ok / done) * 100) : 0 };
  }, [marks]);

  const saveQuiz = async () => {
    if (!quizOf) return;
    if (quizStats.done === 0) {
      toast('还没有标记任何学生', 'info');
      return;
    }
    const session: ClassroomQuizSession = {
      label: quizLabel.trim() || '随堂检测',
      at: today(),
      results: students
        .filter((s) => marks[s.id] && marks[s.id] !== 'none')
        .map((s) => ({ student_id: s.id, name: s.name, ok: marks[s.id] === 'ok' })),
    };
    const next = [...(quizOf.quiz_sessions ?? []), session];
    const { error: e } = await getSupabase()
      .from('classroom_resources')
      .update({ quiz_sessions: next, status: '已上' })
      .eq('id', quizOf.id);
    if (e) {
      toast('保存失败：' + e.message, 'error');
      return;
    }
    await audit('insert', 'classroom_quiz', quizOf.id, {
      label: session.label,
      ok: quizStats.ok,
      bad: quizStats.bad,
    });
    toast(`答题结果已留档：对 ${quizStats.ok} · 错 ${quizStats.bad} · 正确率 ${quizStats.rate}%`);
    setQuizOf(null);
    reload();
  };

  const doPrint = (r: ClassroomResource) => {
    setPrintId(r.id);
    // 等打印区渲染出来再唤起打印；清除交给 afterprint——
    // 部分浏览器 window.print() 不阻塞，用定时器清除会打出空白页
    setTimeout(() => window.print(), 150);
  };

  useEffect(() => {
    const clear = () => setPrintId(null);
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const printRow = rows.find((r) => r.id === printId) ?? null;

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🎬"
        title="课堂"
        subtitle="备课教案 → 生成课堂（OpenMAIC）→ 课堂答题留档；只送课文与教案文本，学生名单不外传"
        color={{ chip: 'bg-teal-500/15 text-teal-300', soft: 'bg-teal-500/10', text: 'text-teal-300' }}
      >
        <Button onClick={openAdd}>
          <Plus size={16} /> 新建课堂
        </Button>
      </PageHeader>

      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<StatusFilter>
            options={[
              { value: 'all', label: `全部 ${rows.length}` },
              { value: '已备', label: `已备 ${rows.filter((r) => r.status === '已备').length}` },
              { value: '已上', label: `已上 ${rows.filter((r) => r.status === '已上').length}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <span className="text-xs text-slate-400">
            在{' '}
            <Link href="/lesson-prep" className="text-brand-300 hover:underline">
              备课教案
            </Link>{' '}
            里生成提示词 → 到 open.maic.chat 生成课堂 → 把链接和导出资料填回这里
          </span>
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <Empty
            text={
              rows.length === 0
                ? '还没有课堂记录：先新建一条，把«课文/单元»和课堂链接记下来'
                : '这个状态下没有记录'
            }
            action={
              rows.length === 0 ? (
                <Button onClick={openAdd}>
                  <Plus size={16} /> 新建课堂
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const last = r.quiz_sessions.length > 0 ? r.quiz_sessions[r.quiz_sessions.length - 1] : null;
            const ok = last ? last.results.filter((x) => x.ok).length : 0;
            const bad = last ? last.results.filter((x) => !x.ok).length : 0;
            const rate = ok + bad > 0 ? Math.round((ok / (ok + bad)) * 100) : 0;
            return (
              <Card key={r.id} className="!p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{r.title}</span>
                  {r.lesson_ref && <Badge className="bg-slate-500/15 text-slate-300">{r.lesson_ref}</Badge>}
                  <Badge
                    className={
                      r.status === '已上' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-500/15 text-brand-300'
                    }
                  >
                    {r.status}
                  </Badge>
                  <span className="ml-auto text-xs text-slate-400">{formatDate(r.resource_date)}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.maic_url ? (
                    <a href={r.maic_url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">
                        <Presentation size={14} /> 打开课堂
                      </Button>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">还没填课堂链接</span>
                  )}
                  {r.attachments.map((a, i) => {
                    const isPage = /\.html?($|\?)/i.test(a.url);
                    return isPage ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" title="在浏览器打开（离线也能用）">
                        <Button size="sm" variant="outline">
                          <MonitorPlay size={14} /> {a.name || '交互页面'}
                        </Button>
                      </a>
                    ) : (
                      <a key={i} href={a.url} download title="下载到本机">
                        <Button size="sm" variant="ghost">
                          <FileText size={14} /> {a.name || '资料'}
                        </Button>
                      </a>
                    );
                  })}
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => openQuiz(r)}>
                      <BarChart3 size={14} /> 课堂答题
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => doPrint(r)} title="打印这节课的记录与答题结果">
                      <Printer size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      onClick={() => setConfirmDel(r)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {last && (
                  <div className="mt-2 rounded-xl bg-slate-500/5 px-3 py-2 text-xs">
                    <span className="text-slate-400">最近答题 · {last.label}（{formatDate(last.at)}）：</span>
                    <span className="ml-1 font-semibold text-emerald-300">对 {ok}</span>
                    <span className="ml-2 font-semibold text-red-300">错 {bad}</span>
                    <span className="ml-2 text-slate-300">正确率 {rate}%</span>
                    {bad > 0 && (
                      <span className="ml-2 text-slate-400">
                        需关注：{last.results.filter((x) => !x.ok).map((x) => x.name).join('、')}
                      </span>
                    )}
                    {r.quiz_sessions.length > 1 && (
                      <span className="ml-2 text-slate-500">共 {r.quiz_sessions.length} 次记录</span>
                    )}
                  </div>
                )}

                {r.notes &&
                  (r.notes.length > 120 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-400 select-none">
                        课堂备注（{r.notes.length} 字，点击展开）
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{r.notes}</p>
                    </details>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">{r.notes}</p>
                  ))}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- 新建/编辑 ---------- */}
      <Modal
        open={modalOpen}
        title={editing ? '编辑课堂记录' : '新建课堂记录'}
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
          <Field label="课题 / 名称" required hint="如：《岳阳楼记》第2课时·写景与抒情">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="课文 / 单元" hint="便于按课文归档查找">
            <Input
              value={form.lesson_ref}
              onChange={(e) => setForm({ ...form, lesson_ref: e.target.value })}
              placeholder="如：岳阳楼记"
            />
          </Field>
          <Field label="上课日期">
            <Input
              type="date"
              value={form.resource_date}
              onChange={(e) => setForm({ ...form, resource_date: e.target.value })}
            />
          </Field>
          <Field label="状态">
            <Segmented<'已备' | '已上'>
              options={[
                { value: '已备', label: '已备' },
                { value: '已上', label: '已上' },
              ]}
              value={form.status === '已上' ? '已上' : '已备'}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="课堂链接"
              hint="在 open.maic.chat 生成课堂后，把课堂地址粘到这里；课上在希沃浏览器直接打开"
            >
              <Input
                value={form.maic_url}
                onChange={(e) => setForm({ ...form, maic_url: e.target.value })}
                placeholder="https://open.maic.chat/classroom/…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="导出资料链接" hint="课件 pptx、离线课堂包 zip、网盘链接都可以，上课前先下载到 U 盘备用">
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={a.name}
                      onChange={(e) =>
                        setAttachments((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="名称，如：课堂课件 pptx"
                      className="w-44"
                    />
                    <Input
                      value={a.url}
                      onChange={(e) =>
                        setAttachments((p) => p.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                      }
                      placeholder="链接地址"
                    />
                    <button
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      title="删除这条资料"
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAttachments((p) => [...p, { name: '', url: '' }])}
                >
                  <Plus size={14} /> 添加资料链接
                </Button>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="课堂备注" hint="学生卡在哪、哪个环节效果好，课后顺手记一句">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
      </Modal>

      {/* ---------- 课堂答题（大屏触屏） ---------- */}
      {quizOf && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/60 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-slate-100">{quizOf.title}</div>
              <div className="text-xs text-slate-400">点学生名字：绿=对 → 红=错 → 再点取消</div>
            </div>
            <input
              value={quizLabel}
              onChange={(e) => setQuizLabel(e.target.value)}
              placeholder="这次检测的名称，如：字词注音"
              className="w-56 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-400"
            />
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="font-semibold text-emerald-300">对 {quizStats.ok}</span>
              <span className="font-semibold text-red-300">错 {quizStats.bad}</span>
              <span className="text-slate-300">
                正确率 <b className="text-lg">{quizStats.rate}%</b>
              </span>
              <Button variant="outline" size="sm" onClick={() => openQuiz(quizOf)}>
                全部重置
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setQuizOf(null)}>
                <X size={16} /> 退出
              </Button>
              <Button size="sm" onClick={saveQuiz}>
                保存到本课记录
              </Button>
            </div>
          </div>
          {students.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              当前班级还没有学生，先到「学生档案」导入名单
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto p-4 sm:grid-cols-4 lg:grid-cols-6">
              {students.map((s) => {
                const m = marks[s.id] ?? 'none';
                return (
                  <button
                    key={s.id}
                    onClick={() => cycle(s.id)}
                    className={cn(
                      'flex min-h-[68px] flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 text-center transition-all active:scale-[.97]',
                      m === 'ok' && 'border-emerald-500 bg-emerald-500/20 text-emerald-200',
                      m === 'bad' && 'border-red-500 bg-red-500/20 text-red-200',
                      m === 'none' && 'border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-400'
                    )}
                  >
                    <span className="text-lg font-semibold leading-tight">{s.name}</span>
                    <span className="mt-0.5 text-[11px] opacity-70">
                      {s.student_no} · {m === 'ok' ? '对' : m === 'bad' ? '错' : '未记'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------- 打印区（屏幕隐藏，仅在打印时出现） ---------- */}
      {printRow && (
        <div className="print-area hidden">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {printRow.title}
            {printRow.lesson_ref ? `（${printRow.lesson_ref}）` : ''}
          </h2>
          <p style={{ fontSize: 12, marginBottom: 12 }}>
            班级课堂记录 · {formatDate(printRow.resource_date)} · 状态：{printRow.status}
          </p>
          {printRow.quiz_sessions.length === 0 ? (
            <p style={{ fontSize: 12 }}>暂无课堂答题记录。</p>
          ) : (
            printRow.quiz_sessions.map((q, i) => {
              const ok = q.results.filter((x) => x.ok).length;
              const bad = q.results.filter((x) => !x.ok).length;
              const rate = ok + bad > 0 ? Math.round((ok / (ok + bad)) * 100) : 0;
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {q.label}（{formatDate(q.at)}） · 对 {ok} · 错 {bad} · 正确率 {rate}%
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #999', padding: 4, textAlign: 'left' }}>学生</th>
                        <th style={{ border: '1px solid #999', padding: 4, textAlign: 'left' }}>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.results.map((r) => (
                        <tr key={r.student_id}>
                          <td style={{ border: '1px solid #999', padding: 4 }}>{r.name}</td>
                          <td style={{ border: '1px solid #999', padding: 4 }}>{r.ok ? '对' : '错'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
          {printRow.notes && <p style={{ fontSize: 12, marginTop: 8 }}>课堂备注：{printRow.notes}</p>}
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        title="删除课堂记录"
        message={`确定删除「${confirmDel?.title}」吗？该课的答题记录会一并删除。`}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={remove}
      />
    </div>
  );
}
