'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ImagePlus, Plus, Save } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { ocrImage, parseLeaveFromText } from '@/lib/ocr';
import type { AttendanceRecord, AttendanceSession, LeaveRequest, Student } from '@/lib/types';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_COLOR,
} from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Confirm,
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
import { cn, compareStudentNo, formatDate, today } from '@/lib/utils';

// 请假条存根缩略图（私有桶，签名 URL 展示）
function LeaveImage({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let on = true;
    getSupabase()
      .storage.from('photos')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (on && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      on = false;
    };
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="查看请假条存根">
      <img src={url} alt="请假条" className="h-12 w-12 rounded-lg border border-slate-700 object-cover" />
    </a>
  );
}

export default function AttendancePage() {
  const { currentClassId, currentClass } = useClass();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [records, setRecords] = useState<Record<string, string>>({}); // studentId -> status
  const [loaded, setLoaded] = useState<Record<string, string>>({}); // 服务器已保存快照（脏状态对比）
  const [lateMap, setLateMap] = useState<Record<string, number>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<string | null>(null); // studentId
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveForm, setLeaveForm] = useState({
    student_id: '',
    leave_type: '病假',
    start_date: today(),
    end_date: today(),
    reason: '',
    contact_method: '电话',
    images: [] as File[],
  });
  const [monthStats, setMonthStats] = useState<{ name: string; late: number; absent: number; leave: number }[]>([]);
  const [leaveStats, setLeaveStats] = useState<{
    perStudent: [string, { 病假: number; 事假: number; 公假: number; total: number }][];
    perType: [string, { count: number; students: Set<string> }][];
  }>({ perStudent: [], perType: [] });
  const [confirmLeave, setConfirmLeave] = useState<LeaveRequest | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    (async () => {
      const [st, ss] = await Promise.all([
        sb.from('students').select('id,name,student_no,gender').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true).order('student_no'),
        sb.from('attendance_sessions').select('*').eq('class_id', currentClassId).eq('active', true).order('sort_order'),
      ]);
      setStudents([...((st.data ?? []) as unknown as Student[])].sort((a: Student, b: Student) => compareStudentNo(a.student_no, b.student_no)));
      const sess = (ss.data ?? []) as AttendanceSession[];
      setSessions(sess);
      setSessionId((prev) => (prev && sess.some((s) => s.id === prev) ? prev : (sess[0]?.id ?? '')));
      setLoading(false);
    })();
  }, [currentClassId, tick]);

  // 加载指定日期的记录
  useEffect(() => {
    if (!currentClassId || !date) return;
    const sb = getSupabase();
    sb.from('attendance_records')
      .select('student_id,status,late_minutes,note,session_id')
      .eq('class_id', currentClassId)
      .eq('date', date)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        const lm: Record<string, number> = {};
        const nm: Record<string, string> = {};
        for (const r of (data ?? []) as AttendanceRecord[]) {
          // 节点模式下只取该节点；总考勤模式 session_id 为 null
          if (sessionId && r.session_id === sessionId) {
            m[r.student_id] = r.status;
            if (r.late_minutes != null) lm[r.student_id] = r.late_minutes;
            if (r.note) nm[r.student_id] = r.note;
          } else if (!sessionId && r.session_id === null) {
            m[r.student_id] = r.status;
            if (r.late_minutes != null) lm[r.student_id] = r.late_minutes;
            if (r.note) nm[r.student_id] = r.note;
          }
        }
        setRecords(m);
        setLoaded(m);
        setLateMap(lm);
        setNoteMap(nm);
      });
  }, [currentClassId, date, sessionId, tick]);

  // 月汇总
  useEffect(() => {
    if (!currentClassId) return;
    const month = date.slice(0, 7);
    getSupabase()
      .from('v_attendance_monthly')
      .select('student_id,late_cnt,absent_cnt,leave_cnt')
      .eq('class_id', currentClassId)
      .eq('month', month)
      .then(({ data }) => {
        const byId = new Map(students.map((s) => [s.id, s]));
        setMonthStats(
          ((data ?? []) as any[]).map((r) => ({
            name: byId.get(r.student_id)?.name ?? '?',
            late: r.late_cnt ?? 0,
            absent: r.absent_cnt ?? 0,
            leave: r.leave_cnt ?? 0,
          }))
        );
      });
  }, [currentClassId, date, students]);

  // 请假单
  useEffect(() => {
    if (!currentClassId) return;
    getSupabase()
      .from('leave_requests')
      .select('*,students(name)')
      .eq('class_id', currentClassId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const list = (data ?? []) as any[];
        setLeaves(list as unknown as LeaveRequest[]);
        // 统计（本学期）
        const tm = (currentClass?.term ?? '').match(/^(\d{4})(秋|春)$/);
        const termStart = tm ? (tm[2] === '秋' ? `${tm[1]}-09-01` : `${tm[1]}-02-01`) : '2025-09-01';
        const perStudent = new Map<string, { 病假: number; 事假: number; 公假: number; total: number }>();
        const perType = new Map<string, { count: number; students: Set<string> }>();
        for (const lv of list) {
          if (lv.start_date < termStart) continue;
          const name = lv.students?.name ?? '?';
          const ps = perStudent.get(name) ?? { 病假: 0, 事假: 0, 公假: 0, total: 0 };
          const lt = lv.leave_type as '病假' | '事假' | '公假';
          ps[lt] = (ps[lt] ?? 0) + 1;
          ps.total++;
          perStudent.set(name, ps);
          const pt = perType.get(lv.leave_type) ?? { count: 0, students: new Set<string>() };
          pt.count++;
          pt.students.add(name);
          perType.set(lv.leave_type, pt);
        }
        setLeaveStats({
          perStudent: [...perStudent.entries()].sort((a, b) => b[1].total - a[1].total),
          perType: [...perType.entries()],
        });
      });
  }, [currentClassId, currentClass?.term, tick]);

  const setStatus = (studentId: string, status: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const saveAll = async () => {
    setSaving(true);
    const sb = getSupabase();
    // 先删当日该模式记录，再插入（保证幂等）
    const q = sb
      .from('attendance_records')
      .delete()
      .eq('class_id', currentClassId)
      .eq('date', date);
    if (sessionId) q.eq('session_id', sessionId);
    else q.is('session_id', null);
    await q;
    const inserts = students
      .filter((s) => records[s.id] && records[s.id] !== '正常')
      .map((s) => ({
        class_id: currentClassId,
        student_id: s.id,
        date,
        session_id: sessionId || null,
        status: records[s.id],
        late_minutes: lateMap[s.id] ?? null,
        note: noteMap[s.id] || null,
      }));
    if (inserts.length > 0) {
      const { error } = await sb.from('attendance_records').insert(inserts);
      if (error) {
        alert('保存失败：' + error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setTick((t) => t + 1);
  };

  const runOcr = async () => {
    const f = leaveForm.images[0];
    if (!f) {
      toast('请先选择假条照片', 'info');
      return;
    }
    setOcrBusy(true);
    try {
      const text = await ocrImage(f);
      const info = parseLeaveFromText(text);
      setLeaveForm((p) => ({
        ...p,
        leave_type: info.type ?? p.leave_type,
        reason: p.reason || info.reason || '',
      }));
      toast('已识别假条文字，请核对类型和原因', 'info');
    } catch (e) {
      toast('识别失败：' + (e as Error).message + '（首次需下载语言模型，请稍候重试）', 'error');
    } finally {
      setOcrBusy(false);
    }
  };

  const submitLeave = async () => {
    if (!leaveForm.student_id) {
      alert('请选择学生');
      return;
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from('leave_requests')
      .insert({
        class_id: currentClassId,
        student_id: leaveForm.student_id,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason || null,
        guardian_contacted: true,
        contact_method: leaveForm.contact_method || null,
      })
      .select()
      .single();
    if (error) {
      alert('提交失败：' + error.message);
      return;
    }
    // 上传请假条存根照片
    if (leaveForm.images.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < leaveForm.images.length; i++) {
        const path = `leave/${(data as any).id}/${i}-${Date.now()}.jpg`;
        const { error: ue } = await sb.storage.from('photos').upload(path, leaveForm.images[i]);
        if (!ue) paths.push(path);
      }
      if (paths.length > 0) {
        await sb.from('leave_requests').update({ images: paths }).eq('id', (data as any).id);
      }
    }
    toast('请假已登记（存根照片已存档）');
    setLeaveOpen(false);
    setLeaveForm({ ...leaveForm, student_id: '', reason: '', images: [] });
    setTick((t) => t + 1);
  };

  const approveLeave = async (lv: LeaveRequest) => {
    const sb = getSupabase();
    await sb.from('leave_requests').update({ status: '已批准', approved_at: new Date().toISOString() }).eq('id', lv.id);
    // 自动生成考勤记录（每日总考勤）
    const inserts: any[] = [];
    const d = new Date(lv.start_date + 'T00:00:00');
    const end = new Date(lv.end_date + 'T00:00:00');
    while (d <= end) {
      inserts.push({
        class_id: lv.class_id,
        student_id: lv.student_id,
        date: d.toISOString().slice(0, 10),
        session_id: null,
        status: lv.leave_type,
        note: '请假单自动生成',
      });
      d.setDate(d.getDate() + 1);
    }
    if (inserts.length > 0) {
      await sb.from('attendance_records').insert(inserts);
    }
    await audit('approve_leave', 'leave', lv.id);
    setConfirmLeave(null);
    setTick((t) => t + 1);
  };

  const studentById = new Map(students.map((s) => [s.id, s]));

  // 未保存的修改（与服务器快照对比）
  const dirtyIds = useMemo(
    () => students.filter((s) => (records[s.id] ?? '正常') !== (loaded[s.id] ?? '正常')).map((s) => s.id),
    [students, records, loaded]
  );
  const abnormalCount = useMemo(
    () => students.filter((s) => (records[s.id] ?? '正常') !== '正常').length,
    [students, records]
  );

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📋"
        title="考勤"
        subtitle="点学生设置状态，点「保存」生效"
        color={{ chip: 'bg-amber-500/15 text-amber-300', soft: 'bg-amber-500/10', text: 'text-amber-300' }}
      >
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-40">
          <option value="">每日总考勤</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={() => setLeaveOpen(true)}>
          <Plus size={14} /> 请假
        </Button>
        <Button size="sm" disabled={saving} onClick={saveAll}>
          <Save size={14} /> {saving ? '保存中…' : '保存'}
        </Button>
      </PageHeader>

      <Card>
        <CardTitle
          right={
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-300">正常 {students.length - abnormalCount}</Badge>
              <Badge className={abnormalCount > 0 ? 'bg-red-500/15 text-red-300' : 'bg-slate-700/60 text-slate-400'}>
                异常 {abnormalCount}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setRecords({})} title="清空本地标记，全部视为正常">
                全部正常
              </Button>
            </div>
          }
        >
          {formatDate(date)} · {sessionId ? sessions.find((s) => s.id === sessionId)?.name : '每日总考勤'}
          <span className="ml-2 text-xs font-normal text-slate-400">点学生设置状态</span>
        </CardTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {students.map((s) => {
            const status = records[s.id] ?? '正常';
            const dirty = (records[s.id] ?? '正常') !== (loaded[s.id] ?? '正常');
            return (
              <button
                key={s.id}
                onClick={() => setPicker(s.id)}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-2.5 text-left transition-all active:scale-[.98]',
                  status !== '正常'
                    ? 'border-slate-700 bg-slate-800/60'
                    : 'border-slate-700/70 hover:border-brand-400',
                  dirty && 'ring-2 ring-brand-300'
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">{s.name}</div>
                  <div className="text-[10px] text-slate-400">{s.student_no}</div>
                </div>
                <Badge className={ATTENDANCE_STATUS_COLOR[status] ?? ''}>{status}</Badge>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 悬浮保存条：有未保存修改时出现 */}
      {dirtyIds.length > 0 && (
        <div className="no-print fixed bottom-24 left-1/2 z-40 -translate-x-1/2 lg:bottom-8">
          <div className="modal-panel flex items-center gap-2 rounded-full bg-slate-900 py-2 pl-5 pr-2 text-sm text-slate-100 shadow-float">
            <span className="whitespace-nowrap">{dirtyIds.length} 处修改未保存</span>
            <button
              onClick={() => setRecords(loaded)}
              className="rounded-full px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
            >
              还原
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-400 disabled:opacity-50"
            >
              <Save size={13} /> {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 状态选择弹窗：点状态后自动关闭（迟到需补分钟数，保持打开） */}
      {picker && (
        <Modal
          open
          title={`${studentById.get(picker)?.name ?? ''} · ${formatDate(date)}`}
          onClose={() => setPicker(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setPicker(null)}>
                完成
              </Button>
            </>
          }
        >
          <p className="mb-3 text-xs text-slate-400">点击状态即记录并关闭；标记「迟到」后可补填分钟数与备注。</p>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ATTENDANCE_STATUSES.map((st) => {
              const selected = (records[picker] ?? '正常') === st;
              return (
                <button
                  key={st}
                  onClick={() => {
                    setStatus(picker, st);
                    if (st !== '迟到') setTimeout(() => setPicker(null), 220);
                  }}
                  className={cn(
                    'rounded-xl border px-2 py-2.5 text-sm transition-all active:scale-95',
                    selected
                      ? 'border-brand-400 bg-brand-500/15 font-semibold text-brand-300 ring-2 ring-brand-500/30'
                      : st === '正常'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {st}
                </button>
              );
            })}
          </div>
          {(records[picker] ?? '正常') === '迟到' && (
            <Field label="迟到分钟数">
              <Input
                type="number"
                value={lateMap[picker] ?? ''}
                onChange={(e) => setLateMap((p) => ({ ...p, [picker]: Number(e.target.value) }))}
                placeholder="如 10"
              />
            </Field>
          )}
          <Field label="备注（选填）">
            <Input
              value={noteMap[picker] ?? ''}
              onChange={(e) => setNoteMap((p) => ({ ...p, [picker]: e.target.value }))}
            />
          </Field>
        </Modal>
      )}

      {/* 月汇总 */}
      <Card>
        <CardTitle right={<CalendarDays size={16} className="text-slate-500" />}>
          {date.slice(0, 7)} 月汇总（有异常的）
        </CardTitle>
        {monthStats.filter((m) => m.late + m.absent + m.leave > 0).length === 0 ? (
          <Empty text="本月暂无异常" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2">姓名</th>
                  <th className="pb-2">迟到</th>
                  <th className="pb-2">旷课</th>
                  <th className="pb-2">请假</th>
                </tr>
              </thead>
              <tbody>
                {monthStats
                  .filter((m) => m.late + m.absent + m.leave > 0)
                  .sort((a, b) => b.late + b.absent - (a.late + a.absent))
                  .map((m, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="py-1.5 font-medium">{m.name}</td>
                      <td className="py-1.5">{m.late}</td>
                      <td className={`py-1.5 ${m.absent > 0 ? 'font-medium text-red-300' : ''}`}>{m.absent}</td>
                      <td className="py-1.5">{m.leave}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 请假统计 */}
      <Card accent="bg-brand-400">
        <CardTitle dot="bg-brand-400">请假统计（本学期 · 以登记存根为准）</CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-400">按学生 · 各类型次数</div>
            {leaveStats.perStudent.length === 0 ? (
              <Empty text="本学期暂无请假" emoji="✅" />
            ) : (
              <ul className="space-y-1">
                {leaveStats.perStudent.slice(0, 12).map(([name, c]) => (
                  <li key={name} className="flex items-center justify-between gap-2 text-sm">
                    <span>{name}</span>
                    <Badge className="bg-brand-500/15 text-brand-300">
                      病假{c.病假} · 事假{c.事假} · 公假{c.公假}｜共 {c.total} 次
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-400">按类型 · 请假人数与名单</div>
            {leaveStats.perType.length === 0 ? (
              <Empty text="本学期暂无请假" emoji="✅" />
            ) : (
              <div className="space-y-2">
                {leaveStats.perType.map(([type, v]) => (
                  <div key={type} className="rounded-xl bg-slate-800/60 p-2.5 text-sm">
                    <span className="font-semibold">{type}</span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      {v.count} 次 · {v.students.size} 人
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[...v.students].map((n) => (
                        <Badge key={n} className="bg-slate-700/60 text-slate-500">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 请假单 */}
      <Card>
        <CardTitle>
          请假记录
          <span className="text-xs font-normal text-slate-400">
            （家长请假后由你登记，可上传微信截图/假条照片作存根）
          </span>
        </CardTitle>
        {leaves.length === 0 ? (
          <Empty text="暂无请假记录" />
        ) : (
          <ul className="space-y-2">
            {leaves.slice(0, 15).map((lv) => (
              <li key={lv.id} className="rounded-xl border border-slate-700/60 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{(lv as any).students?.name ?? '?'}</span>
                    <span className="ml-2 text-slate-400">
                      {lv.leave_type} · {lv.start_date.slice(5)} ~ {lv.end_date.slice(5)}
                    </span>
                    {lv.reason && <span className="ml-2 text-xs text-slate-400">{lv.reason}</span>}
                    {lv.contact_method && (
                      <Badge className="ml-2 bg-slate-700/60 text-slate-400">{lv.contact_method}</Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      className={
                        lv.status === '已批准'
                          ? 'bg-green-500/15 text-green-300'
                          : lv.status === '已拒绝'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-yellow-500/15 text-yellow-300'
                      }
                    >
                      {lv.status}
                    </Badge>
                    {lv.status === '待审批' && (
                      <Button size="sm" variant="outline" onClick={() => setConfirmLeave(lv)}>
                        <Check size={14} /> 批准
                      </Button>
                    )}
                  </div>
                </div>
                {(lv.images ?? []).length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {(lv.images ?? []).map((p) => (
                      <LeaveImage key={p} path={p} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 请假弹窗 */}
      <Modal
        open={leaveOpen}
        title="登记请假"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              取消
            </Button>
            <Button onClick={submitLeave}>提交（待审批）</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="学生" required>
            <Select
              value={leaveForm.student_id}
              onChange={(e) => setLeaveForm({ ...leaveForm, student_id: e.target.value })}
            >
              <option value="">请选择</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_no} {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="类型">
            <Select
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
            >
              <option value="病假">病假</option>
              <option value="事假">事假</option>
              <option value="公假">公假</option>
            </Select>
          </Field>
          <Field label="登记来源">
            <Select
              value={leaveForm.contact_method}
              onChange={(e) => setLeaveForm({ ...leaveForm, contact_method: e.target.value })}
            >
              <option value="电话">家长来电</option>
              <option value="微信">家长微信</option>
              <option value="纸质假条">学生纸质假条</option>
            </Select>
          </Field>
          <Field label="请假条存根" hint="上传家长微信截图或学生假条照片，存档备查；可用 OCR 自动识别">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 p-3 text-sm text-slate-400 hover:border-brand-400">
              <ImagePlus size={16} />
              {leaveForm.images.length > 0 ? `已选 ${leaveForm.images.length} 张照片` : '点击选择照片'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setLeaveForm({ ...leaveForm, images: [...(e.target.files ?? [])] })}
              />
            </label>
            {leaveForm.images.length > 0 && (
              <Button variant="outline" size="sm" className="mt-2 w-full" disabled={ocrBusy} onClick={runOcr}>
                {ocrBusy ? '识别中（首次需下载模型）…' : '🔍 OCR 识别假条文字'}
              </Button>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始日期">
              <Input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
            </Field>
            <Field label="结束日期">
              <Input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
            </Field>
          </div>
          <Field label="原因">
            <Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          </Field>
          {leaveForm.start_date > leaveForm.end_date && (
            <ErrorBox message="开始日期不能晚于结束日期" />
          )}
        </div>
      </Modal>

      <Confirm
        open={!!confirmLeave}
        title="批准请假"
        message="批准后将自动生成该时间段的考勤记录（状态=请假类型）。"
        onCancel={() => setConfirmLeave(null)}
        onConfirm={() => confirmLeave && approveLeave(confirmLeave)}
      />
    </div>
  );
}
