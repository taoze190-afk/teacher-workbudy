'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { FOCUS_SUMMARY_CATEGORIES } from '@/lib/constants';
import type { FocusSummaryNote, Student } from '@/lib/types';
import { Badge, Button, Card, Confirm, Empty, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

const CATEGORY_COLOR: Record<string, string> = {
  健康安全: 'bg-red-500/15 text-red-300',
  心理行为: 'bg-violet-500/15 text-violet-300',
  家庭经济: 'bg-amber-500/15 text-amber-300',
  睡眠问题: 'bg-blue-500/15 text-blue-300',
  家长诉求: 'bg-emerald-500/15 text-emerald-300',
};

const EMPTY_EDIT = { id: '', student_name: '', gender: '', family_structure: '', category: '健康安全', detail: '', advice: '' };
type EditForm = typeof EMPTY_EDIT;

// 从 .doc（豆包导出的 HTML 表格）解析条目：类别按表序，字段按表头名智能映射
// （六张表的列数不同：健康安全/心理行为 6 列、家庭经济 4 列、睡眠与家长诉求 5 列，
//   固定位置取值会错位丢内容，必须按表头「姓名/性别/家庭结构/标注类型/具体情况/诉求/建议/跟进」映射）
function parseDocTables(html: string): { student_name: string; gender: string; family_structure: string; category: string; detail: string; advice: string }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')];
  const CATEGORY_BY_INDEX = ['健康安全', '心理行为', '', '家庭经济', '睡眠问题', '家长诉求'];
  const out: { student_name: string; gender: string; family_structure: string; category: string; detail: string; advice: string }[] = [];
  tables.forEach((t, ti) => {
    const category = CATEGORY_BY_INDEX[ti];
    if (!category) return; // 第 3 张是家庭结构统计（由学生档案计算），跳过
    const trs = [...t.querySelectorAll('tr')];
    if (trs.length === 0) return;
    // 表头 → 字段映射
    const headers = [...trs[0].querySelectorAll('td,th')].map((c) => (c.textContent ?? '').replace(/\s+/g, '').trim());
    const iName = headers.findIndex((h) => h.includes('姓名'));
    const iGender = headers.findIndex((h) => h === '性别');
    const iFamily = headers.findIndex((h) => h.includes('家庭结构'));
    const iTag = headers.findIndex((h) => h.includes('标注类型'));
    const iDetail = headers.findIndex((h) => h.includes('具体情况') || h.includes('诉求'));
    const iAdvice = headers.findIndex((h) => h.includes('建议') || h.includes('跟进'));
    if (iName === -1) return;
    for (const r of trs.slice(1)) {
      const cells = [...r.querySelectorAll('td')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
      const get = (i: number) => (i > -1 ? cells[i] ?? '' : '');
      const name = get(iName);
      if (!name) continue;
      const tag = get(iTag).replace(/（红字体）/g, '').trim();
      let detail = get(iDetail);
      if (tag) detail = detail ? `【${tag}】${detail}` : `【${tag}】`;
      out.push({
        student_name: name,
        gender: get(iGender),
        family_structure: get(iFamily),
        category,
        detail,
        advice: get(iAdvice),
      });
    }
  });
  return out;
}

export default function FocusSummaryPage() {
  const { currentClassId, currentClass } = useClass();
  const toast = useToast();
  const [notes, setNotes] = useState<FocusSummaryNote[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<FocusSummaryNote | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    Promise.all([
      getSupabase().from('focus_summary_notes').select('*').eq('class_id', currentClassId).order('created_at'),
      getSupabase().from('students').select('id,name,family_structure,gender').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true),
    ]).then(([n, s]) => {
      setNotes((n.data ?? []) as FocusSummaryNote[]);
      setStudents((s.data ?? []) as unknown as Student[]);
      setLoading(false);
    });
  }, [currentClassId]);

  // 家庭结构统计（从学生档案实时计算）
  const familyStats = useMemo(() => {
    const total = students.length;
    const byStructure = new Map<string, string[]>();
    for (const s of students) {
      const key = s.family_structure || '未填';
      (byStructure.get(key) ?? byStructure.set(key, []).get(key)!).push(s.name);
    }
    const rows = [...byStructure.entries()]
      .map(([structure, names]) => ({ structure, count: names.length, names }))
      .sort((a, b) => b.count - a.count);
    const special = rows.filter((r) => r.structure !== '双亲' && r.structure !== '未填');
    return { total, rows, special };
  }, [students]);

  const grouped = useMemo(() => {
    const g = new Map<string, FocusSummaryNote[]>();
    for (const c of FOCUS_SUMMARY_CATEGORIES) g.set(c, []);
    for (const n of notes) (g.get(n.category) ?? g.set(n.category, []).get(n.category)!).push(n);
    return [...g.entries()];
  }, [notes]);

  const startAdd = (category: string) => {
    setEditForm({ ...EMPTY_EDIT, category });
  };

  const startEdit = (n: FocusSummaryNote) => {
    setEditForm({
      id: n.id,
      student_name: n.student_name,
      gender: n.gender ?? '',
      family_structure: n.family_structure ?? '',
      category: n.category.split(' · ')[0],
      detail: n.detail ?? '',
      advice: n.advice ?? '',
    });
  };

  const save = async () => {
    if (!currentClassId) {
      toast('请先选择班级', 'error');
      return;
    }
    if (!editForm || !editForm.student_name.trim()) {
      toast('请填写学生姓名', 'error');
      return;
    }
    setSaving(true);
    try {
      const sb = getSupabase();
      const payload = {
        class_id: currentClassId,
        student_name: editForm.student_name.trim(),
        gender: editForm.gender || null,
        family_structure: editForm.family_structure || null,
        category: editForm.category,
        detail: editForm.detail || null,
        advice: editForm.advice || null,
      };
      if (editForm.id) {
        const { error } = await sb.from('focus_summary_notes').update(payload).eq('id', editForm.id);
        if (error) throw error;
        setNotes((p) => p.map((x) => (x.id === editForm.id ? { ...x, ...payload } : x)));
        toast('已更新');
      } else {
        const { data, error } = await sb.from('focus_summary_notes').insert(payload).select().single();
        if (error) throw error;
        setNotes((p) => [...p, data as FocusSummaryNote]);
        toast(`已添加「${payload.student_name}」的${payload.category}记录`);
      }
      setEditForm(null);
      void audit('update', 'focus_summary', editForm.id || 'new', { name: payload.student_name });
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    const { error } = await getSupabase().from('focus_summary_notes').delete().eq('id', confirmDel.id);
    if (error) {
      toast('删除失败：' + error.message, 'error');
    } else {
      setNotes((p) => p.filter((x) => x.id !== confirmDel.id));
      toast('已删除');
    }
    setConfirmDel(null);
  };

  // 导入 .doc（豆包导出的 HTML 表格）
  const onFile = async (file: File) => {
    try {
      const html = await file.text();
      const parsed = parseDocTables(html);
      if (parsed.length === 0) {
        toast('未解析到条目（请上传豆包导出的原始 .doc 文件）', 'error');
        return;
      }
      const sb = getSupabase();
      const rows = parsed.map((p) => ({ ...p, class_id: currentClassId }));
      const { error } = await sb.from('focus_summary_notes').insert(rows);
      if (error) throw error;
      setNotes((prev) => [...prev, ...rows.map((r, i) => ({ ...r, id: `imp-${Date.now()}-${i}` })) as FocusSummaryNote[]]);
      setImportCount(parsed.length);
      void audit('import', 'focus_summary', currentClassId ?? undefined, { count: parsed.length });
      toast(`导入成功：${parsed.length} 条记录`);
    } catch (e) {
      toast('导入失败：' + (e as Error).message, 'error');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🧩"
        title="重点学生汇总"
        subtitle="新生重点关注（含家庭结构）· 健康安全 / 心理行为 / 家庭经济 / 睡眠 / 家长诉求"
        color={{ chip: 'bg-rose-500/15 text-rose-300', soft: 'bg-rose-500/10', text: 'text-rose-300' }}
      >
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> 导入 Word 汇总表
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".doc,.docx,.html,.htm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" onClick={() => startAdd('健康安全')}>
          <Plus size={14} /> 添加记录
        </Button>
      </PageHeader>

      {importCount != null && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-300">
          导入成功：{importCount} 条记录已并入下方台账（同名学生多类别的会分行显示）。
        </div>
      )}

      {/* 家庭结构统计 */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">家庭结构统计（{familyStats.total} 名学生）</h3>
          <span className="text-xs text-slate-400">来自学生档案，随档案自动更新</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {familyStats.rows.map((r) => (
            <div
              key={r.structure}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                r.structure === '双亲'
                  ? 'border-slate-700 bg-slate-800/60 text-slate-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              )}
            >
              <b>{r.structure}</b>：{r.count} 人
              {r.structure !== '双亲' && r.structure !== '未填' && (
                <div className="mt-0.5 text-[11px] text-slate-400">{r.names.join('、')}</div>
              )}
            </div>
          ))}
        </div>
        {familyStats.special.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            特殊家庭结构（{familyStats.special.map((s) => s.structure).join('、')}）学生建议在情感陪伴与心理关怀上适当倾斜。
          </p>
        )}
      </Card>

      {/* 分类台账（可编辑） */}
      {notes.length === 0 && !editForm ? (
        <Card>
          <Empty
            text="暂无记录：可导入 Word 汇总表自动解析，或手工添加记录"
            emoji="🧩"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> 导入 Word 汇总表
                </Button>
                <Button size="sm" onClick={() => startAdd('健康安全')}>
                  <Plus size={14} /> 添加记录
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        FOCUS_SUMMARY_CATEGORIES.map((cat) => {
          const items = grouped.find(([c]) => c.startsWith(cat))?.[1] ?? [];
          const color = CATEGORY_COLOR[cat] ?? 'bg-slate-500/15 text-slate-300';
          return (
            <Card key={cat} accent={color.replace('text-', 'bg-').split(' ')[0]}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Badge className={color}>{cat}</Badge>
                  <span className="text-xs font-normal text-slate-400">{items.length} 条</span>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => startAdd(cat)}>
                  <Plus size={14} /> 添加
                </Button>
              </div>
              {items.length === 0 && !editForm ? (
                <p className="text-xs text-slate-500">暂无</p>
              ) : (
                <div className="space-y-2">
                  {items.map((n) => (
                    <Fragment key={n.id}>
                      {editForm?.id === n.id ? (
                        <div className="rounded-xl border border-brand-500/40 bg-slate-800/60 p-3">
                          {/* 编辑单条（复用编辑表单单元格） */}
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Input value={editForm!.student_name} onChange={(e) => setEditForm((p) => p && { ...p, student_name: e.target.value })} placeholder="姓名" />
                            <Input value={editForm!.gender} onChange={(e) => setEditForm((p) => p && { ...p, gender: e.target.value })} placeholder="性别" />
                            <Input value={editForm!.family_structure} onChange={(e) => setEditForm((p) => p && { ...p, family_structure: e.target.value })} placeholder="家庭结构" />
                            <Input value={editForm!.detail} onChange={(e) => setEditForm((p) => p && { ...p, detail: e.target.value })} placeholder="具体情况" />
                          </div>
                          <Textarea className="mt-2 min-h-[52px]" value={editForm!.advice} onChange={(e) => setEditForm((p) => p && { ...p, advice: e.target.value })} placeholder="校园关注建议" />
                          <div className="mt-2 flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditForm(null)}>取消</Button>
                            <Button size="sm" disabled={saving} onClick={save}>保存</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-start justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-800/40 p-2.5">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-200">
                              {n.student_name}
                              {n.gender && <span className="ml-1.5 text-xs text-slate-400">{n.gender}</span>}
                              {n.family_structure && (
                                <Badge className="ml-2 bg-slate-700/60 text-slate-400">{n.family_structure}</Badge>
                              )}
                            </div>
                            {n.detail && <div className="mt-0.5 text-xs text-slate-300">{n.detail}</div>}
                            {n.advice && <div className="mt-0.5 text-xs text-slate-400">建议：{n.advice}</div>}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(n)}>编辑</Button>
                            <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDel(n)}>
                              删除
                            </Button>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* 新增/编辑弹窗 */}
      {editForm && editForm.id === '' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEditForm(null)} />
          <div className="modal-panel relative z-10 w-full max-w-lg rounded-2xl bg-slate-800 p-5 shadow-float">
            <h2 className="mb-4 text-base font-bold text-slate-100">
              添加记录（{editForm.category}）
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Input value={editForm.student_name} onChange={(e) => setEditForm((p) => ({ ...p!, student_name: e.target.value }))} placeholder="学生姓名*" />
                <Input value={editForm.gender} onChange={(e) => setEditForm((p) => ({ ...p!, gender: e.target.value }))} placeholder="性别" />
                <Input value={editForm.family_structure} onChange={(e) => setEditForm((p) => ({ ...p!, family_structure: e.target.value }))} placeholder="家庭结构" />
              </div>
              <Textarea value={editForm.detail} onChange={(e) => setEditForm((p) => ({ ...p!, detail: e.target.value }))} placeholder="具体情况" />
              <Textarea value={editForm.advice} onChange={(e) => setEditForm((p) => ({ ...p!, advice: e.target.value }))} placeholder="校园关注建议" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditForm(null)}>取消</Button>
              <Button disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</Button>
            </div>
          </div>
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        title="删除记录"
        message={`确定删除「${confirmDel?.student_name}」的${confirmDel?.category}记录吗？`}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={remove}
      />
    </div>
  );
}
