'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Sparkles, Wand2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { aiGenerate, hasAiConfig } from '@/lib/ai';
import type { CommentLibraryItem, Student, TermReport } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';

const TERMS = ['2025秋', '2026春', '2026秋', '2027春'];

export default function ReportsPage() {
  const { currentClassId, currentClass } = useClass();
  const term = currentClass?.term ?? TERMS[0];
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Record<string, TermReport>>({});
  const [edits, setEdits] = useState<Record<string, { comment_final: string; conduct_level: string }>>({});
  const [library, setLibrary] = useState<CommentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libOpen, setLibOpen] = useState(false);
  const [libForm, setLibForm] = useState({ category: '优点', content: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase().from('students').select('*').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no'),
      getSupabase().from('term_reports').select('*').eq('class_id', currentClassId).eq('term', term),
      getSupabase().from('comment_library').select('*').order('created_at', { ascending: false }),
    ]).then(([s, r, l]) => {
      setStudents((s.data ?? []) as Student[]);
      const m: Record<string, TermReport> = {};
      for (const rep of (r.data ?? []) as TermReport[]) m[rep.student_id] = rep;
      setReports(m);
      setLibrary((l.data ?? []) as CommentLibraryItem[]);
      setLoading(false);
    });
  }, [currentClassId, term, tick]);

  const generate = async (stu: Student) => {
    setBusy(stu.id);
    const sb = getSupabase();
    try {
      const { data } = await sb.rpc('fn_generate_comment', { p_student: stu.id, p_term: term });
      const draft = (data ?? '') as string;
      const existing = reports[stu.id];
      const payload = {
        class_id: currentClassId,
        student_id: stu.id,
        term,
        comment_draft: draft,
        comment_final: existing?.comment_final ?? draft,
        conduct_level: existing?.conduct_level ?? '合格',
        generated_at: new Date().toISOString(),
      };
      await sb.from('term_reports').upsert(payload, { onConflict: 'class_id,student_id,term' });
      await audit('generate_comment', 'term_report', stu.id);
      setEdits((p) => ({
        ...p,
        [stu.id]: { comment_final: payload.comment_final, conduct_level: payload.conduct_level ?? '良' },
      }));
      reload();
    } catch (e) {
      alert('生成失败：' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveReport = async (stu: Student) => {
    const ed = edits[stu.id] ?? {
      comment_final: reports[stu.id]?.comment_final ?? '',
      conduct_level: reports[stu.id]?.conduct_level ?? '良',
    };
    await getSupabase()
      .from('term_reports')
      .upsert(
        {
          class_id: currentClassId,
          student_id: stu.id,
          term,
          comment_final: ed.comment_final,
          conduct_level: ed.conduct_level,
          comment_draft: reports[stu.id]?.comment_draft ?? null,
        },
        { onConflict: 'class_id,student_id,term' }
      );
    await audit('update', 'term_report', stu.id);
    reload();
  };

  const aiPolish = async (stu: Student) => {
    if (!hasAiConfig()) {
      toast('请先在「设置 → AI 评语配置」填入服务地址和密钥', 'info');
      return;
    }
    const ed = edits[stu.id] ?? {
      comment_final: reports[stu.id]?.comment_final ?? '',
      conduct_level: reports[stu.id]?.conduct_level ?? '合格',
    };
    setAiBusy(stu.id);
    try {
      const prompt = `请为初一学生 ${stu.name} 撰写期末评语（200 字以内，语气亲切真诚，避免空话套话）。
要求：肯定优点，指出不足，提出期望，结尾有鼓励。
操行评定：${ed.conduct_level}。
已有素材：${reports[stu.id]?.comment_draft ?? '（无）'}。
当前初稿：${ed.comment_final || '（空）'}。`;
      const text = await aiGenerate(prompt);
      setEdits((p) => ({ ...p, [stu.id]: { ...ed, comment_final: text } }));
      toast('AI 评语已生成，请核对后保存');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setAiBusy(null);
    }
  };

  const exportExcel = () => {
    const rows: (string | number)[][] = [['学号', '姓名', '操行', '评语']];
    for (const stu of students) {
      const rep = reports[stu.id];
      const ed = edits[stu.id];
      rows.push([
        stu.student_no,
        stu.name,
        ed?.conduct_level ?? rep?.conduct_level ?? '合格',
        ed?.comment_final ?? rep?.comment_final ?? '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学期评语');
    XLSX.writeFile(wb, `学期评语-${term}.xlsx`);
    void audit('export', 'term_report', term);
    toast(`已导出 ${students.length} 条评语`);
  };

  const addLibraryItem = async () => {
    if (!libForm.content.trim()) return;
    const { data } = await getSupabase().auth.getUser();
    await getSupabase().from('comment_library').insert({
      user_id: data.user!.id,
      category: libForm.category,
      content: libForm.content.trim(),
    });
    setLibOpen(false);
    setLibForm({ category: '优点', content: '' });
    reload();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📖"
        title={`学期评语（${term}）`}
        subtitle="记录聚合生成草稿 → 修改定稿 → 打印操行评定"
        color={{ chip: 'bg-green-500/15 text-green-300', soft: 'bg-green-500/10', text: 'text-green-300' }}
      >
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download size={14} /> 导出 Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLibOpen(true)}>
          <Plus size={14} /> 评语库
        </Button>
      </PageHeader>

      <Card className="bg-brand-500/15">
        <p className="text-xs text-slate-400">
          操作：点「生成草稿」自动聚合该生本学期记录生成评语 → 在草稿上修改定稿 → 保存。
          五维操行（品德/学业/健康/劳动/审美）与批量打印见打印中心。
        </p>
      </Card>

      {students.length === 0 ? (
        <Card>
          <Empty text="暂无学生" />
        </Card>
      ) : (
        <div className="space-y-3">
          {students.map((stu) => {
            const rep = reports[stu.id];
            const ed = edits[stu.id] ?? {
              comment_final: rep?.comment_final ?? '',
              conduct_level: rep?.conduct_level ?? '良',
            };
            return (
              <Card key={stu.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{stu.name}</span>
                  <span className="text-xs text-slate-400">{stu.student_no}</span>
                  {rep?.comment_draft && rep.comment_draft !== rep?.comment_final && (
                    <Badge className="bg-yellow-500/15 text-yellow-300">草稿待定稿</Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Select
                      className="w-24"
                      value={ed.conduct_level}
                      onChange={(e) =>
                        setEdits((p) => ({ ...p, [stu.id]: { ...ed, conduct_level: e.target.value } }))
                      }
                    >
                      <option value="优秀">优秀</option>
                      <option value="合格">合格</option>
                      <option value="不合格">不合格</option>
                    </Select>
                    <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={aiBusy === stu.id} onClick={() => aiPolish(stu)}>
                      <Wand2 size={14} /> {aiBusy === stu.id ? 'AI 生成中…' : 'AI 润色'}
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={busy === stu.id} onClick={() => generate(stu)}>
                      <Sparkles size={14} /> 生成草稿
                    </Button>
                    <Button size="sm" className="whitespace-nowrap" onClick={() => saveReport(stu)}>
                      保存
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="min-h-[72px] text-sm"
                  placeholder="填写或修改评语…"
                  value={ed.comment_final}
                  onChange={(e) =>
                    setEdits((p) => ({ ...p, [stu.id]: { ...ed, comment_final: e.target.value } }))
                  }
                />
                {rep?.comment_draft && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-400">
                      查看生成的草稿（{rep.comment_draft.length} 字）
                    </summary>
                    <p className="mt-1 rounded bg-slate-800/60 p-2 text-xs text-slate-400">
                      {rep.comment_draft}
                    </p>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 评语库 */}
      <Modal
        open={libOpen}
        title="评语素材库"
        onClose={() => setLibOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setLibOpen(false)}>
              关闭
            </Button>
            <Button onClick={addLibraryItem} disabled={!libForm.content.trim()}>
              添加素材
            </Button>
          </>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="分类">
            <Select value={libForm.category} onChange={(e) => setLibForm({ ...libForm, category: e.target.value })}>
              <option value="优点">优点</option>
              <option value="期望">期望</option>
              <option value="鼓励">鼓励</option>
              <option value="事例">事例</option>
            </Select>
          </Field>
          <Field label="内容">
            <Input value={libForm.content} onChange={(e) => setLibForm({ ...libForm, content: e.target.value })} />
          </Field>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {library.length === 0 ? (
            <Empty text="素材库为空，先添加几条常用句子" />
          ) : (
            library.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-700/60 p-2.5">
                <div className="text-sm text-slate-500">
                  <Badge className="mr-1.5 bg-brand-500/15 text-brand-300">{l.category}</Badge>
                  {l.content}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
