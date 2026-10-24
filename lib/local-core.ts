// 本地查询引擎：实现应用用到的全部数据访问接口（无需任何后端服务）
// 覆盖面：from/select/eq/neq/is/in/lt/match/order/limit/single/maybeSingle、
// insert/update/delete/upsert（含 insert().select()）、rpc、视图（v_* 实时聚合）。
// 演示模式（lib/demo.ts）与本地持久化模式（lib/local.ts）共用本引擎。

export type Row = Record<string, any>;
export type Db = Record<string, Row[]>;

export const uid = () =>
  'lz-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- 视图（查询时实时聚合） ---------- */
export function viewRows(db: Db, name: string): Row[] {
  const T = today();
  switch (name) {
    case 'v_due_reminders': {
      const out: Row[] = [];
      for (const t of db.talks ?? [])
        if (t.follow_up_date && t.follow_up_date < T)
          out.push({ kind: '谈话跟进', class_id: t.class_id, student_id: t.student_id, due_date: t.follow_up_date, detail: t.follow_up });
      for (const c of db.home_school_contacts ?? [])
        if (c.follow_up_date && c.follow_up_date <= T)
          out.push({ kind: '联系跟进', class_id: c.class_id, student_id: c.student_id, due_date: c.follow_up_date, detail: c.follow_up });
      for (const t of db.todos ?? [])
        if (!t.done && t.due_date && t.due_date <= T)
          out.push({ kind: '待办', class_id: t.class_id, student_id: null, due_date: t.due_date, detail: t.title });
      return out;
    }
    case 'v_attendance_monthly': {
      const agg = new Map<string, Row>();
      for (const r of db.attendance_records ?? []) {
        const month = r.date.slice(0, 7);
        const key = `${r.student_id}|${month}`;
        const row = agg.get(key) ?? {
          class_id: r.class_id, student_id: r.student_id, month,
          late_cnt: 0, early_cnt: 0, absent_cnt: 0, leave_cnt: 0,
        };
        if (r.status === '迟到') row.late_cnt++;
        else if (r.status === '早退') row.early_cnt++;
        else if (r.status === '旷课') row.absent_cnt++;
        else if (['病假', '事假', '公假'].includes(r.status)) row.leave_cnt++;
        agg.set(key, row);
      }
      return [...agg.values()];
    }
    case 'v_growth_timeline': {
      const out: Row[] = [];
      for (const r of db.attendance_records ?? [])
        if (r.status !== '正常') out.push({ class_id: r.class_id, student_id: r.student_id, ts: r.date, kind: '考勤', title: r.status, detail: r.note });
      for (const r of db.homework_records ?? [])
        if (['未交', '优秀'].includes(r.status)) out.push({ class_id: r.class_id, student_id: r.student_id, ts: r.date, kind: '作业', title: r.status, detail: r.note });
      for (const r of db.behavior_events ?? [])
        out.push({ class_id: r.class_id, student_id: r.student_id, ts: r.event_date, kind: '事件', title: r.event_type, detail: r.description });
      for (const r of db.talks ?? [])
        out.push({ class_id: r.class_id, student_id: r.student_id, ts: r.talk_date, kind: '谈话', title: r.topic, detail: r.key_points });
      for (const r of db.home_school_contacts ?? [])
        out.push({ class_id: r.class_id, student_id: r.student_id, ts: r.contact_date, kind: '家校', title: r.topic, detail: r.summary });
      return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    }
    case 'v_exam_stats': {
      const fullMap = new Map((db.exam_subjects ?? []).map((es) => [`${es.exam_id}|${es.subject}`, es.full_score]));
      const examMap = new Map((db.exams ?? []).map((e) => [e.id, e]));
      const out: Row[] = [];
      for (const [examId, exam] of examMap) {
        const subjects = new Set((db.exam_subjects ?? []).filter((es) => es.exam_id === examId).map((es) => es.subject));
        for (const subject of subjects) {
          const full = fullMap.get(`${examId}|${subject}`) ?? 100;
          const scores = (db.grade_records ?? [])
            .filter((g) => g.exam_id === examId && g.subject === subject && !g.is_absent && g.score != null)
            .map((g) => g.score as number)
            .sort((a, b) => a - b);
          if (scores.length === 0) continue;
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const median = scores[Math.floor(scores.length / 2)];
          const band = (lo: number, hi: number) => scores.filter((s) => s >= full * lo && s < full * hi).length;
          out.push({
            exam_id: examId, exam_name: exam.name, exam_date: exam.exam_date, class_id: exam.class_id,
            subject, full_score: full, student_count: scores.length,
            avg_score: Math.round(avg * 10) / 10, median_score: median,
            max_score: scores[scores.length - 1], min_score: scores[0],
            stddev_score: Math.round(Math.sqrt(scores.reduce((a, s) => a + (s - avg) ** 2, 0) / scores.length) * 10) / 10,
            excellent_rate: Math.round((scores.filter((s) => s >= full * 0.9).length / scores.length) * 1000) / 10,
            pass_rate: Math.round((scores.filter((s) => s >= full * 0.6).length / scores.length) * 1000) / 10,
            s_below60: band(0, 0.6), s_60_69: band(0.6, 0.7), s_70_79: band(0.7, 0.8), s_80_89: band(0.8, 0.9), s_90_plus: scores.filter((s) => s >= full * 0.9).length,
          });
        }
      }
      return out;
    }
    case 'v_class_trend': {
      const out: Row[] = [];
      for (const e of db.exams ?? []) {
        const rows = (db.grade_records ?? []).filter((g) => g.exam_id === e.id && !g.is_absent && g.score != null);
        if (rows.length === 0) continue;
        const fullOf = (subject: string) => (db.exam_subjects ?? []).find((es) => es.exam_id === e.id && es.subject === subject)?.full_score ?? 100;
        const pcts = rows.map((g) => ((g.score as number) / fullOf(g.subject)) * 100);
        out.push({
          class_id: e.class_id, exam_id: e.id, exam_date: e.exam_date,
          class_avg: Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10,
        });
      }
      return out.sort((a, b) => (a.exam_date > b.exam_date ? 1 : -1));
    }
    case 'v_student_progress': {
      const out: Row[] = [];
      const examList = [...(db.exams ?? [])].sort((a, b) => (a.exam_date > b.exam_date ? 1 : -1));
      const prevRankByStudent = new Map<string, { rnk: number; exam_date: string }>();
      for (const e of examList) {
        const per = new Map<string, { pctSum: number; n: number }>();
        for (const g of (db.grade_records ?? []).filter((g) => g.exam_id === e.id && !g.is_absent && g.score != null)) {
          const full = (db.exam_subjects ?? []).find((es) => es.exam_id === e.id && es.subject === g.subject)?.full_score ?? 100;
          const cur = per.get(g.student_id) ?? { pctSum: 0, n: 0 };
          cur.pctSum += ((g.score as number) / full) * 100;
          cur.n++;
          per.set(g.student_id, cur);
        }
        const list = [...per.entries()].map(([student_id, v]) => ({
          student_id, exam_id: e.id, exam_date: e.exam_date,
          pct: Math.round((v.pctSum / v.n) * 10) / 10,
        }));
        list.sort((a, b) => b.pct - a.pct);
        list.forEach((r, i) => {
          const rnk = i + 1;
          const prev = prevRankByStudent.get(r.student_id);
          out.push({
            ...r, rnk,
            prev_rnk: prev?.rnk ?? null,
            rank_delta: prev ? prev.rnk - rnk : null,
          });
          prevRankByStudent.set(r.student_id, { rnk, exam_date: e.exam_date });
        });
      }
      return out;
    }
    case 'v_student_radar': {
      if ((db.exams ?? []).length === 0) return [];
      const latest = [...db.exams].sort((a, b) => (a.exam_date > b.exam_date ? -1 : 1))[0];
      const out: Row[] = [];
      for (const es of (db.exam_subjects ?? []).filter((x) => x.exam_id === latest.id)) {
        const rows = (db.grade_records ?? []).filter((g) => g.exam_id === latest.id && g.subject === es.subject && !g.is_absent && g.score != null);
        const pcts = rows.map((g) => Math.round(((g.score as number) / es.full_score) * 1000) / 10);
        const classPct = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0;
        rows.forEach((g, i) =>
          out.push({ class_id: g.class_id, student_id: g.student_id, subject: es.subject, pct: pcts[i], class_pct: classPct })
        );
      }
      return out;
    }
    case 'v_student_subject_gaps': {
      if ((db.exams ?? []).length === 0) return [];
      const latest = [...db.exams].sort((a, b) => (a.exam_date > b.exam_date ? -1 : 1))[0];
      const out: Row[] = [];
      for (const es of (db.exam_subjects ?? []).filter((x) => x.exam_id === latest.id)) {
        const rows = (db.grade_records ?? []).filter((g) => g.exam_id === latest.id && g.subject === es.subject && !g.is_absent && g.score != null);
        const perStudent = new Map<string, { sum: number; n: number }>();
        for (const g of (db.grade_records ?? []).filter((g) => g.exam_id === latest.id && !g.is_absent && g.score != null)) {
          const full = (db.exam_subjects ?? []).find((x) => x.exam_id === latest.id && x.subject === g.subject)?.full_score ?? 100;
          const cur = perStudent.get(g.student_id) ?? { sum: 0, n: 0 };
          cur.sum += ((g.score as number) / full) * 100;
          cur.n++;
          perStudent.set(g.student_id, cur);
        }
        rows.forEach((g) => {
          const pct = Math.round(((g.score as number) / es.full_score) * 1000) / 10;
          const ps = perStudent.get(g.student_id)!;
          const avgPct = Math.round((ps.sum / ps.n) * 10) / 10;
          out.push({ class_id: g.class_id, student_id: g.student_id, subject: es.subject, pct, avg_pct: avgPct, gap: Math.round((avgPct - pct) * 10) / 10 });
        });
      }
      return out;
    }
    default:
      return undefined as unknown as Row[];
  }
}

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- 补挂学生简要信息（students 关联） ---------- */
function attachRels(db: Db, table: string, rows: Row[]) {
  for (const r of rows) {
    if (r && typeof r === 'object' && 'student_id' in r && table !== 'students') {
      const st = (db.students ?? []).find((s) => s.id === r.student_id);
      if (st) r.students = { name: st.name, student_no: st.student_no, gender: st.gender };
    }
  }
}

// 模拟真实数据库的列默认值（缺了会被 eq 过滤条件漏掉，如 school_classes.archived）
const TABLE_DEFAULTS: Record<string, Row> = {
  school_classes: { archived: false },
  students: { active: true, tags: [], is_boarding: false, special_level: '无', custom_fields: [] },
  leave_requests: { status: '待审批', guardian_contacted: false, images: [] },
  duty_records: { ok: true },
  seat_history: {},
  classroom_resources: { status: '已备', attachments: [], quiz_sessions: [] },
};

/* ---------- 查询构造器 ---------- */
class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private doSingle = false;
  private doMaybeSingle = false;
  private wantRows = false;
  private payload: Row | Row[] | null = null;
  private conflictKeys: string[] = [];

  constructor(
    private getDb: () => Promise<Db>,
    private onMutate: () => void,
    private table: string,
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  ) {}

  select(_cols?: string, _opts?: any) {
    this.wantRows = true;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push((r) => r[col] != null && r[col] < val);
    return this;
  }
  match(key: Record<string, any>) {
    for (const [col, val] of Object.entries(key)) this.filters.push((r) => r[col] === val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderKey = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.doSingle = true;
    return this;
  }
  maybeSingle() {
    this.doMaybeSingle = true;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = payload;
    this.conflictKeys = (opts?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private matches(r: Row) {
    return this.filters.every((f) => f(r));
  }

  private async exec(): Promise<{ data: any; error: any; count?: number }> {
    const db = await this.getDb();
    if (!db[this.table]) db[this.table] = [];
    const rows = db[this.table];

    if (this.op === 'select') {
      let out: Row[];
      if (this.table.startsWith('v_')) {
        out = viewRows(db, this.table).filter((r) => this.matches(r));
      } else {
        out = rows.filter((r) => this.matches(r));
      }
      if (this.orderKey) {
        out = [...out].sort((a, b) => {
          const av = a[this.orderKey!] ?? '';
          const bv = b[this.orderKey!] ?? '';
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.table !== 'students') attachRels(db, this.table, out);
      if (this.doSingle) return { data: out[0] ?? null, error: null };
      if (this.doMaybeSingle) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const defaults = TABLE_DEFAULTS[this.table] ?? {};
      const payloadArr = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];
      for (const p of payloadArr) {
        if (this.op === 'upsert' && this.conflictKeys.length > 0) {
          const exist = rows.find((r) => this.conflictKeys.every((k) => r[k] === p[k]));
          if (exist) {
            Object.assign(exist, p);
            inserted.push(exist);
            continue;
          }
        }
        const row = { id: uid(), created_at: new Date().toISOString(), ...defaults, ...p };
        rows.push(row);
        inserted.push(row);
      }
      this.onMutate();
      if (this.wantRows) {
        const out = this.doSingle || this.doMaybeSingle ? inserted[0] ?? null : inserted;
        return { data: out, error: null };
      }
      return { data: null, error: null };
    }

    if (this.op === 'update') {
      let n = 0;
      for (const r of rows)
        if (this.matches(r)) {
          Object.assign(r, this.payload);
          n++;
        }
      this.onMutate();
      return { data: null, error: null, count: n };
    }

    if (this.op === 'delete') {
      const removed = rows.length - rows.filter((r) => !this.matches(r)).length;
      db[this.table] = rows.filter((r) => !this.matches(r));
      this.onMutate();
      return { data: null, error: null, count: removed };
    }

    return { data: null, error: null };
  }

  then(onFul?: any, onRej?: any) {
    return this.exec().then(onFul, onRej);
  }
}

/* ---------- 内置 RPC（原数据库函数的本地实现） ---------- */
export function handleRpc(db: Db, name: string, args?: Record<string, any>): Promise<{ data: any; error: any }> {
  if (name === 'fn_rotate_duty') {
    const groups = (db.duty_groups ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const n = groups.length;
    groups.forEach((g, i) => (g.sort_order = ((i + 1) % n) + 1));
    return Promise.resolve({ data: null, error: null });
  }
  if (name === 'fn_generate_comment') {
    const stu = (db.students ?? []).find((s) => s.id === args?.p_student);
    const pos = (db.behavior_events ?? []).filter((e) => e.student_id === stu?.id && e.event_type === '表扬').length ?? 0;
    const text =
      `${stu?.name ?? '该生'}同学：你性格开朗、乐于助人${pos > 0 ? '，多次受到老师表扬' : ''}。` +
      `学习上能按时完成作业，若能在薄弱科目上多下功夫、勤于提问，下学期定会更进一步。` +
      `愿你保持热情与好奇心，做更好的自己。`;
    return Promise.resolve({ data: text, error: null });
  }
  if (name === 'fn_export_all') {
    const snapshot: Record<string, Row[]> = {};
    for (const [k, v] of Object.entries(db)) if (!k.startsWith('v_')) snapshot[k] = v;
    return Promise.resolve({ data: snapshot, error: null });
  }
  return Promise.resolve({ data: null, error: null });
}

/* ---------- 客户端工厂 ---------- */
export interface MiniClientHooks {
  getDb: () => Promise<Db>;
  onMutate: () => void;
  auth: any;
  storage: any;
}

export function createMiniClient({ getDb, onMutate, auth, storage }: MiniClientHooks) {
  return {
    from: (table: string) => new Query(getDb, onMutate, table, 'select'),
    rpc: async (name: string, args?: Record<string, any>) => {
      const db = await getDb();
      const res = await handleRpc(db, name, args);
      if (name === 'fn_rotate_duty') onMutate();
      return res;
    },
    storage,
    auth,
  };
}
