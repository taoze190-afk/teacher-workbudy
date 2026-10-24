'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import ImportDialog from '@/components/ImportDialog';
import { useToast } from '@/components/Toast';
import { exportStudentProfiles } from '@/lib/export-students';
import type { Student } from '@/lib/types';
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
import { SPECIAL_LEVEL_COLOR } from '@/lib/constants';
import { maskPhone, today, compareStudentNo, cn } from '@/lib/utils';

const EMPTY_FORM = {
  student_no: '',
  name: '',
  gender: '',
  ethnicity: '',
  birthday: '',
  guardian_name: '',
  guardian_relation: '',
  guardian_phone: '',
  guardian2_name: '',
  guardian2_relation: '',
  guardian2_phone: '',
  family_structure: '',
  address: '',
  pickup_person: '',
  is_boarding: false,
  health_notes: '',
  primary_school: '',
  special_level: '无',
  special_reason: '',
  notes: '',
};

export default function StudentsPage() {
  const { currentClassId, currentClass, refresh, settings } = useClass();
  // 手机号是否打码：由「设置 → 列表手机号打码」控制。
  // 默认 false（显示完整号码）—— 班主任随时要给家长打电话，打码了反而要再点一次。
  const maskPhoneOn = settings?.mask_phone ?? false;
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<Student | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  // 重点学生汇总台账：按姓名统计条数，列表里给这些孩子打标识
  const [focusCount, setFocusCount] = useState<Record<string, number>>({});
  // 档案导出（详细版）
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOpts, setExportOpts] = useState({ survey: true, focus: true, custom: true });
  const [exportFormat, setExportFormat] = useState<'detail' | 'school'>('detail');
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb.from('students').select('*').eq('class_id', currentClassId).is('deleted_at', null).order('student_no'),
      sb.from('focus_summary_notes').select('student_name').eq('class_id', currentClassId),
    ]).then(([res, notes]) => {
      setStudents(
        [...((res.data ?? []) as unknown as Student[])].sort((a: any, b: any) =>
          compareStudentNo(a.student_no, b.student_no)
        )
      );
      const map: Record<string, number> = {};
      for (const n of (notes.data ?? []) as { student_name: string }[]) {
        map[n.student_name] = (map[n.student_name] ?? 0) + 1;
      }
      setFocusCount(map);
      setLoading(false);
    });
  }, [currentClassId, tick]);

  const doExport = async () => {
    if (!currentClassId) return;
    setExporting(true);
    try {
      const res = await exportStudentProfiles({
        classId: currentClassId,
        className: currentClass?.name ?? '',
        classInfo: {
          name: currentClass?.name,
          grade: currentClass?.grade,
          term: currentClass?.term,
          school_year: currentClass?.school_year,
        },
        students: filtered,
        format: exportFormat,
        includeSurvey: exportOpts.survey,
        includeFocus: exportOpts.focus,
        includeCustom: exportOpts.custom,
      });
      toast(`已导出 ${res.rows} 名学生 × ${res.cols} 列：${res.fileName}`);
      setExportOpen(false);
    } catch (e) {
      toast('导出失败：' + (e as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return students.filter((s) => {
      if (kw && !s.name.includes(kw) && !s.student_no.includes(kw)) return false;
      if (genderFilter && s.gender !== genderFilter) return false;
      if (levelFilter && s.special_level !== levelFilter) return false;
      return s.active;
    });
  }, [students, keyword, genderFilter, levelFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleSelect = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected((p) => {
      const n = new Set(p);
      if (allFilteredSelected) filtered.forEach((s) => n.delete(s.id));
      else filtered.forEach((s) => n.add(s.id));
      return n;
    });
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      student_no: s.student_no,
      name: s.name,
      gender: s.gender ?? '',
      ethnicity: s.ethnicity ?? '',
      birthday: s.birthday ? s.birthday.slice(0, 10) : '',
      guardian_name: s.guardian_name ?? '',
      guardian_relation: s.guardian_relation ?? '',
      guardian_phone: s.guardian_phone ?? '',
      guardian2_name: s.guardian2_name ?? '',
      guardian2_relation: s.guardian2_relation ?? '',
      guardian2_phone: s.guardian2_phone ?? '',
      family_structure: s.family_structure ?? '',
      address: s.address ?? '',
      pickup_person: s.pickup_person ?? '',
      is_boarding: s.is_boarding,
      health_notes: s.health_notes ?? '',
      primary_school: s.primary_school ?? '',
      special_level: s.special_level,
      special_reason: s.special_reason ?? '',
      notes: s.notes ?? '',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.student_no || !form.name) {
      setError('学号和姓名必填');
      return;
    }
    setSaving(true);
    const payload = {
      student_no: form.student_no,
      name: form.name,
      gender: form.gender || null,
      ethnicity: form.ethnicity.trim() || null,
      birthday: form.birthday || null,
      guardian_name: form.guardian_name || null,
      guardian_relation: form.guardian_relation || null,
      guardian_phone: form.guardian_phone || null,
      guardian2_name: form.guardian2_name || null,
      guardian2_relation: form.guardian2_relation || null,
      guardian2_phone: form.guardian2_phone || null,
      family_structure: form.family_structure || null,
      address: form.address || null,
      pickup_person: form.pickup_person || null,
      is_boarding: form.is_boarding,
      health_notes: form.health_notes || null,
      primary_school: form.primary_school || null,
      special_level: form.special_level,
      special_reason: form.special_reason || null,
      notes: form.notes || null,
    };
    try {
      const sb = getSupabase();
      if (editing) {
        const { error: e } = await sb.from('students').update(payload).eq('id', editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await sb
          .from('students')
          .insert({ ...payload, class_id: currentClassId });
        if (e) throw e;
      }
      setModalOpen(false);
      toast(editing ? `已保存「${payload.name}」的档案` : `已添加学生「${payload.name}」`);
      reload();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBatchBusy(true);
    try {
      const sb = getSupabase();
      // count: 'exact' 返回实际更新行数——RLS 拦截/会话过期时是 0 行且无 error，必须显式检查
      const { error, count } = await sb
        .from('students')
        .update({ deleted_at: new Date().toISOString(), active: false, left_at: today() }, { count: 'exact' })
        .eq('id', confirmDel.id);
      if (error) throw error;
      if (!count) {
        toast('删除失败：服务器未更新任何数据，请确认登录状态后重试', 'error');
        setConfirmDel(null);
        return;
      }
      await audit('delete', 'student', confirmDel.id, { name: confirmDel.name });
      toast(`已将「${confirmDel.name}」标记为删除（档案保留在回收站）`);
      setConfirmDel(null);
      reload();
    } catch (e) {
      toast('删除失败：' + (e as Error).message, 'error');
      setConfirmDel(null);
    } finally {
      setBatchBusy(false);
    }
  };

  const batchRemove = async () => {
    if (selected.size === 0) return;
    setBatchBusy(true);
    try {
      const sb = getSupabase();
      const { error, count } = await sb
        .from('students')
        .update({ deleted_at: new Date().toISOString(), active: false, left_at: today() }, { count: 'exact' })
        .in('id', [...selected]);
      if (error) throw error;
      if (!count) {
        toast(`没有学生被删除（选中 ${selected.size} 人）：请确认登录状态后重试`, 'error');
        return;
      }
      await audit('delete', 'student', 'batch', { count });
      toast(
        count === selected.size
          ? `已删除 ${count} 名学生（档案保留在回收站）`
          : `已删除 ${count}/${selected.size} 名学生（其余可能已被删除或无权限）`
      );
      setSelected(new Set());
      reload();
    } catch (e) {
      toast('批量删除失败：' + (e as Error).message, 'error');
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="👥"
        title="学生档案"
        subtitle="基本信息 · 家庭 · 健康 · 重点关注标记"
        color={{ chip: 'bg-blue-500/15 text-blue-300', soft: 'bg-blue-500/10', text: 'text-blue-300' }}
      >
        <Button variant="outline" onClick={() => setExportOpen(true)}>
          <Download size={16} /> 导出档案
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <FileUp size={16} /> 导入
        </Button>
        <Button onClick={openAdd}>
          <Plus size={16} /> 新增学生
        </Button>
      </PageHeader>

      {/* 搜索框 / 性别 / 级别 排在同一行。
          两个下拉用内联 style 固定宽度 —— Select 组件自带 w-full，若用类名给宽度会产生
          两个宽度类冲突（cn 只做拼接不消解），下拉会被撑开并与搜索框挤在一起。
          搜索框给最小宽度，屏幕再窄也不会被压没（放不下时整行换行）。 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[9rem] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索姓名 / 学号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select
          style={{ width: '4.6rem', flexShrink: 0 }}
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
        >
          <option value="">性别</option>
          <option value="男">男</option>
          <option value="女">女</option>
        </Select>
        <Select
          style={{ width: '4.6rem', flexShrink: 0 }}
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <option value="">级别</option>
          <option value="红">红</option>
          <option value="黄">黄</option>
          <option value="无">无</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span>
            已选 <b>{selected.size}</b> 人
          </span>
          <Button size="sm" variant="danger" disabled={batchBusy} onClick={() => setConfirmBatch(true)}>
            <Trash2 size={14} /> {batchBusy ? '删除中…' : '批量删除'}
          </Button>
          <button className="text-xs text-slate-400 hover:text-slate-500" onClick={() => setSelected(new Set())}>
            取消选择
          </button>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Card>
          <Empty
            text={students.length === 0 ? '还没有学生：先「导入」班级名单批量添加，或「新增」单个录入' : '没有匹配的学生'}
            action={
              students.length === 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <FileUp size={16} /> 导入学生
                  </Button>
                  <Button onClick={openAdd}>
                    <Plus size={16} /> 新增学生
                  </Button>
                </div>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* 桌面表格 */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                  <th className="w-8 pb-2 pr-1">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand-500 opacity-40 transition-opacity hover:opacity-100"
                      title="全选"
                    />
                  </th>
                  <th className="pb-2 pr-2">学号</th>
                  <th className="pb-2 pr-2">姓名</th>
                  <th className="w-10 pb-2 pr-2">性别</th>
                  <th className="pb-2 pr-2">生日</th>
                  <th className="pb-2 pr-2">监护人</th>
                  <th className="pb-2 pr-2">电话</th>
                  <th className="w-14 pb-2 pr-2">家庭</th>
                  <th className="w-12 pb-2 pr-2">级别</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="group border-b border-slate-50 last:border-0 hover:bg-slate-800/60">
                    <td className="py-2 pr-1">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        title="选中后可批量操作"
                        className={cn(
                          'h-3.5 w-3.5 cursor-pointer accent-brand-500 transition-opacity',
                          // 平时很淡，鼠标移到该行（或已勾选）时才明显 —— 避免勾选框抢走视觉焦点
                          selected.has(s.id)
                            ? 'opacity-100'
                            : 'opacity-25 hover:opacity-100 group-hover:opacity-100'
                        )}
                      />
                    </td>
                    <td className="py-2 pr-2 text-slate-400">{s.student_no}</td>
                    <td className="py-2 pr-2 font-medium">
                      <Link href={`/students/detail?id=${s.id}`} className="text-brand-300 hover:underline">
                        {s.name}
                      </Link>
                      {focusCount[s.name] > 0 && (
                        <Link
                          href={`/students/detail?id=${s.id}`}
                          title={`重点学生汇总里有 ${focusCount[s.name]} 条关注记录，点开查看`}
                          className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 align-middle text-[10px] font-medium text-rose-300 hover:bg-rose-500/25"
                        >
                          🛡 {focusCount[s.name]}
                        </Link>
                      )}
                    </td>
                    <td className="w-10 py-2 pr-2 text-slate-400">{s.gender ?? '—'}</td>
                    <td className="py-2 pr-2 text-slate-400">{s.birthday?.slice(0, 10) ?? '—'}</td>
                    <td className="py-2 pr-2 text-slate-300">
                      {s.guardian_name ?? '—'}
                      {s.guardian_relation && (
                        <span className="ml-1 text-[10px] text-slate-500">{s.guardian_relation}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-slate-300">
                      {s.guardian_phone ? (
                        maskPhoneOn ? (
                          <span title="已按「设置 → 列表手机号打码」隐藏中间四位">{maskPhone(s.guardian_phone)}</span>
                        ) : (
                          <a
                            href={`tel:${s.guardian_phone}`}
                            className="tabular-nums hover:text-brand-400"
                            title="点击拨打电话"
                          >
                            {s.guardian_phone}
                          </a>
                        )
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="w-14 py-2 pr-2 text-slate-400">{s.family_structure ?? '—'}</td>
                    <td className="w-12 py-2 pr-2">
                      <Badge className={SPECIAL_LEVEL_COLOR[s.special_level] ?? ''}>
                        {s.special_level}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          编辑
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmDel(s)} title="删除（标记转出）">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* 移动端卡片 */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  title="选中后可批量操作"
                  /* 触屏没有 hover，所以保持可见，但同样淡一点 */
                  className={cn(
                    'h-4 w-4 shrink-0 cursor-pointer accent-brand-500 transition-opacity',
                    selected.has(s.id) ? 'opacity-100' : 'opacity-40'
                  )}
                />
                <Link href={`/students/detail?id=${s.id}`} className="flex min-w-0 flex-1 items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {s.name}
                      <span className="ml-1.5 text-xs text-slate-400">{s.student_no}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {s.gender ?? ''} · {s.family_structure ?? '—'} ·{' '}
                      {s.guardian_phone
                        ? maskPhoneOn
                          ? maskPhone(s.guardian_phone)
                          : s.guardian_phone
                        : '无电话'}
                    </div>
                  </div>
                  <Badge className={SPECIAL_LEVEL_COLOR[s.special_level] ?? ''}>{s.special_level}</Badge>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        open={modalOpen}
        title={editing ? `编辑：${editing.name}` : '新增学生'}
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
          <Field label="学号" required>
            <Input
              value={form.student_no}
              onChange={(e) => setForm({ ...form, student_no: e.target.value })}
              placeholder="如 01（保留前导零）"
            />
          </Field>
          <Field label="姓名" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="性别">
            <Select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">未填</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </Select>
          </Field>
          <Field label="民族" hint="学校档案表用；不填则导出留空">
            <Input value={form.ethnicity} onChange={(e) => setForm({ ...form, ethnicity: e.target.value })} placeholder="如：汉族" />
          </Field>
          <Field label="生日">
            <Input
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
            />
          </Field>
          <Field label="监护人姓名">
            <Input
              value={form.guardian_name}
              onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
            />
          </Field>
          <Field label="监护人关系">
            <Input
              value={form.guardian_relation}
              onChange={(e) => setForm({ ...form, guardian_relation: e.target.value })}
              placeholder="如：父亲 / 母女"
            />
          </Field>
          <Field label="监护人电话">
            <Input
              value={form.guardian_phone}
              onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
              placeholder="11 位手机号"
            />
          </Field>
          <Field label="第二监护人">
            <Input
              value={form.guardian2_name}
              onChange={(e) => setForm({ ...form, guardian2_name: e.target.value })}
              placeholder="姓名"
            />
          </Field>
          <Field label="第二监护人关系/电话">
            <div className="flex gap-2">
              <Input
                value={form.guardian2_relation}
                onChange={(e) => setForm({ ...form, guardian2_relation: e.target.value })}
                placeholder="关系"
              />
              <Input
                value={form.guardian2_phone}
                onChange={(e) => setForm({ ...form, guardian2_phone: e.target.value })}
                placeholder="11 位手机号"
              />
            </div>
          </Field>
          <Field label="主要接送人">
            <Input
              value={form.pickup_person}
              onChange={(e) => setForm({ ...form, pickup_person: e.target.value })}
              placeholder="如：母亲 / 爷爷奶奶"
            />
          </Field>
          <Field label="毕业小学">
            <Input
              value={form.primary_school}
              onChange={(e) => setForm({ ...form, primary_school: e.target.value })}
            />
          </Field>
          <Field label="家庭结构">
            <Select
              value={form.family_structure}
              onChange={(e) => setForm({ ...form, family_structure: e.target.value })}
            >
              <option value="">未填</option>
              <option value="双亲">双亲</option>
              <option value="单亲">单亲</option>
              <option value="留守">留守</option>
              <option value="离异">离异</option>
              <option value="其他">其他</option>
            </Select>
          </Field>
          <Field label="家庭住址">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="如：××小区×栋×号"
            />
          </Field>
          <Field label="健康备注（过敏史/既往病史）">
            <Input
              value={form.health_notes}
              onChange={(e) => setForm({ ...form, health_notes: e.target.value })}
              placeholder="如：对花粉过敏；无既往病史"
            />
          </Field>
          <Field label="重点关注级别">
            <Select
              value={form.special_level}
              onChange={(e) => setForm({ ...form, special_level: e.target.value })}
            >
              <option value="无">无</option>
              <option value="黄">黄</option>
              <option value="红">红</option>
            </Select>
          </Field>
          <Field label="是否住校">
            <Select
              value={form.is_boarding ? '是' : '否'}
              onChange={(e) => setForm({ ...form, is_boarding: e.target.value === '是' })}
            >
              <option value="否">否</option>
              <option value="是">是</option>
            </Select>
          </Field>
          <Field label="关注原因（选填）">
            <Input
              value={form.special_reason}
              onChange={(e) => setForm({ ...form, special_reason: e.target.value })}
            />
          </Field>
          <Field label="备注" hint="健康信息、住址等可在此补充">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      </Modal>

      <Confirm
        open={!!confirmDel}
        title="确认删除学生"
        message={`确定将「${confirmDel?.name}」删除（标记转出）吗？该生档案与历史记录会保留，可在回收站恢复。`}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={remove}
      />

      <Confirm
        open={confirmBatch}
        title="批量删除学生"
        message={`确定删除选中的 ${selected.size} 名学生吗？（标记转出，档案与历史记录保留）`}
        danger
        onCancel={() => setConfirmBatch(false)}
        onConfirm={() => {
          setConfirmBatch(false);
          void batchRemove();
        }}
      />

      <Modal
        open={exportOpen}
        title="导出学生档案（详细版）"
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button disabled={exporting || filtered.length === 0} onClick={doExport}>
              <Download size={14} /> {exporting ? '导出中…' : `导出 ${filtered.length} 人`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800/60 p-3 text-xs leading-5 text-slate-400">
            将导出<b className="text-slate-200">当前筛选出的 {filtered.length} 名学生</b>。
            {currentClass?.role === '任教' && (
              <span className="ml-1 text-amber-300">（当前是任教班，名单以本班档案为准）</span>
            )}
          </div>

          <Field label="导出格式">
            <div className="space-y-2">
              {(
                [
                  ['detail', '详细版（全部字段）', '基本信息 + 关注级别与原因 + 备注，可再勾选调查表、关注台账、自写条目'],
                  ['school', '学校档案表格式（9 列）', '姓名 / 家长手机号 / 身份证号 / 性别 / 民族 / 级 / 年级 / 班级 / 出生日期'],
                ] as ['detail' | 'school', string, string][]
              ).map(([v, label, desc]) => (
                <label
                  key={v}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 transition-colors',
                    exportFormat === v ? 'border-brand-500/50 bg-brand-500/10' : 'border-slate-700 hover:border-slate-600'
                  )}
                >
                  <input
                    type="radio"
                    name="export-format"
                    checked={exportFormat === v}
                    onChange={() => setExportFormat(v)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <span>
                    <span className="block text-sm text-slate-200">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <div className={cn('space-y-2', exportFormat === 'school' && 'hidden')}>
            {(
              [
                ['survey', '包含新生调查表（28 题，按题目名分列）'],
                ['focus', '包含重点关注台账（来自「重点学生汇总」，含建议与跟进）'],
                ['custom', '包含自写条目 / 自写题目（老师自己加的字段）'],
              ] as [keyof typeof exportOpts, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={exportOpts[key]}
                  onChange={(e) => setExportOpts((p) => ({ ...p, [key]: e.target.checked }))}
                  className="mt-0.5 accent-brand-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {exportFormat === 'school' ? (
            <p className="text-[11px] leading-5 text-slate-500">
              学校格式：表头顺序与学校表格一致，交表直接可用。<b className="text-amber-300">「身份证号」列会留空</b>——
              按本系统的隐私设计，身份证号只在解析调查表时用来提取生日，解析后立即丢弃、从不入库，需要时请从学籍系统补齐。
              「民族」可在学生编辑里填，导入名单时表头写「民族」也能自动识别。
            </p>
          ) : (
            <p className="text-[11px] leading-5 text-slate-500">
              说明：导出的是 Excel（.xlsx），可直接用 WPS/Excel 打开、筛选排序或打印。
              调查表里「身份证号」这类只用于解析、从不入库的题目不会出现在文件中。
            </p>
          )}
        </div>
      </Modal>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="students"
        onImported={reload}
      />
    </div>
  );
}
