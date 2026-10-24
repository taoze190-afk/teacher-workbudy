// 演示模式：内置示例数据的本地 Mock 客户端（不访问网络、不写真实数据库）
// 激活方式：登录页点「演示模式」，或 localStorage.bzh_demo = '1'
// 覆盖应用实际用到的查询面：from/select/eq/neq/is/in/lt/order/limit/single/maybeSingle、
// insert/update/delete/upsert、rpc、storage 存根、auth 存根。

import { createMiniClient, Row } from './local-core';

export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem('bzh_demo') === '1';
}

export function enterDemo() {
  localStorage.setItem('bzh_demo', '1');
}

export function exitDemo() {
  localStorage.removeItem('bzh_demo');
}

const uid = () =>
  'dm-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const DEMO_USER = {
  id: 'demo-user-0000-0000-000000000000',
  email: 'demo@banzhuren.app',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
};

/* ---------- 确定性伪随机 ---------- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b7915) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dstr(d);
};

/* ---------- 种子数据 ---------- */
function buildDb(): Record<string, Row[]> {
  const rand = mulberry32(20260901);
  const T = dstr(new Date());
  const CLASS_ID = 'demo-class-0000-0000-000000000000';

  const namesM = ['张子轩', '李浩然', '王明轩', '刘一鸣', '陈思远', '杨博文', '赵天宇', '黄俊杰'];
  const namesF = ['李雨欣', '王梓萱', '张欣怡', '刘诗涵', '陈静怡', '杨紫萱', '赵梦琪', '黄雅婷'];

  // 16 名学生：1-8 男，9-16 女
  const students: Row[] = [];
  const now = new Date();
  for (let i = 1; i <= 16; i++) {
    const male = i <= 8;
    const by = 2012 + (i % 2);
    let birthday = `${by}-${pad(1 + (i % 12))}-${pad(2 + ((i * 3) % 27))}`;
    if (i === 1) birthday = `${by}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (i === 9) birthday = `${by}-${pad(now.getMonth() + 1)}-12`;
    students.push({
      id: `demo-stu-${pad(i)}`,
      class_id: CLASS_ID,
      student_no: pad(i),
      name: male ? namesM[i - 1] : namesF[i - 9],
      gender: male ? '男' : '女',
      birthday,
      guardian_name: male ? `${namesM[i - 1][0]}先生` : `${namesF[i - 9][0]}女士`,
      guardian_relation: '父亲',
      guardian_phone: `1380000${String(1000 + i * 7).slice(-4)}`, // 示例号段，不与真实号码重合
      family_structure: i === 5 ? '单亲' : i === 12 ? '留守' : '双亲',
      primary_school: ['实验小学', '第一小学', '阳光小学', '育才小学'][i % 4],
      is_boarding: i === 5 || i === 12,
      tags: i === 5 ? ['需家访'] : i === 12 ? ['住校'] : [],
      special_level: i === 5 ? '红' : i === 12 ? '黄' : '无',
      special_reason: i === 5 ? '近期情绪波动大，需重点关注' : i === 12 ? '学习基础薄弱' : null,
      custom_fields:
        i === 5
          ? [{ section: 'basic', label: '暑假就医', value: '7 月做过扁桃体手术，已康复' }]
          : i === 9
            ? [{ section: 'survey', label: '家里养宠物', value: '一只猫（学生对猫毛轻微过敏）' }]
            : [],
      active: true,
    });
  }
  const S = (n: number) => `demo-stu-${pad(n)}`;

  // 考勤节点
  const attendance_sessions = ['早读', '眼操', '课间操', '午休', '晚自习'].map((n, i) => ({
    id: `demo-sess-${i + 1}`,
    class_id: CLASS_ID,
    name: n,
    sort_order: i + 1,
    is_daily: false,
    active: true,
  }));

  // 过去 12 个工作日 + 今日的考勤记录（少量异常）
  const attendance_records: Row[] = [];
  let d = new Date();
  const days: string[] = [];
  while (days.length < 12) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.unshift(dstr(d));
    d.setDate(d.getDate() - 1);
  }
  days.forEach((day, di) => {
    if (rand() < 0.3) {
      const stu = 1 + Math.floor(rand() * 16);
      attendance_records.push({
        id: uid(), class_id: CLASS_ID, student_id: S(stu), date: day, session_id: null,
        status: '迟到', late_minutes: 5 + Math.floor(rand() * 15), note: null,
      });
    }
    if (di > 5 && rand() < 0.12) {
      const stu = 1 + Math.floor(rand() * 16);
      attendance_records.push({
        id: uid(), class_id: CLASS_ID, student_id: S(stu), date: day, session_id: null,
        status: rand() < 0.5 ? '病假' : '事假', late_minutes: null,
        note: rand() < 0.5 ? '家长请假' : null,
      });
    }
  });
  // 今日：2 迟到 1 病假
  attendance_records.push(
    { id: uid(), class_id: CLASS_ID, student_id: S(2), date: T, session_id: null, status: '迟到', late_minutes: 10, note: '交通拥堵' },
    { id: uid(), class_id: CLASS_ID, student_id: S(7), date: T, session_id: null, status: '迟到', late_minutes: 5, note: null },
    { id: uid(), class_id: CLASS_ID, student_id: S(9), date: T, session_id: null, status: '病假', late_minutes: null, note: '发烧在家休息' }
  );

  const leave_requests = [
    {
      id: uid(), class_id: CLASS_ID, student_id: S(9), leave_type: '病假',
      start_date: T, end_date: addDays(T, 1), reason: '发烧 38.5℃，已就医',
      guardian_contacted: true, status: '待审批', approved_at: null, contact_method: '微信', images: [],
    },
    {
      id: uid(), class_id: CLASS_ID, student_id: S(4), leave_type: '事假',
      start_date: addDays(T, -6), end_date: addDays(T, -6), reason: '随家人外出',
      guardian_contacted: true, status: '已批准', approved_at: new Date().toISOString(), contact_method: '电话', images: [],
    },
  ];

  // 今日作业：语文 3 未交 2 优秀，数学 1 未交，英语 2 未交
  const homework_records: Row[] = [];
  [
    ['语文', [4, 11, 16], [1, 6]],
    ['数学', [7], [2, 13]],
    ['英语', [4, 9], [10]],
  ].forEach(([subject, miss, exc]) => {
    (miss as number[]).forEach((n) =>
      homework_records.push({ id: uid(), class_id: CLASS_ID, student_id: S(n), date: T, subject, hw_type: '日常', status: '未交', note: null })
    );
    (exc as number[]).forEach((n) =>
      homework_records.push({ id: uid(), class_id: CLASS_ID, student_id: S(n), date: T, subject, hw_type: '日常', status: '优秀', note: null })
    );
  });

  // 课表：周一到周五，第 2-8 节
  const subjectPool = ['语文', '数学', '英语', '政治', '历史', '地理', '生物', '体育', '音乐', '美术'];
  const schedule_entries: Row[] = [];
  for (let wd = 1; wd <= 5; wd++) {
    for (let p = 2; p <= 8; p++) {
      schedule_entries.push({
        id: `demo-sched-${wd}-${p}`,
        class_id: CLASS_ID,
        weekday: wd,
        period: p,
        subject: subjectPool[(wd * 7 + p * 3) % subjectPool.length],
        teacher: subjectPool[(wd * 7 + p * 3) % subjectPool.length] === '语文' ? '刘晓燕' : '',
      });
    }
    schedule_entries.push({ id: `demo-sched-${wd}-1`, class_id: CLASS_ID, weekday: wd, period: 1, subject: '早读' });
    schedule_entries.push({ id: `demo-sched-${wd}-9`, class_id: CLASS_ID, weekday: wd, period: 9, subject: '班会' });
  }

  // 值日
  const duty_groups = [1, 2, 3, 4].map((i) => ({
    id: `demo-dg-${i}`, class_id: CLASS_ID, name: `第${i}组`, sort_order: i,
  }));
  const duty_group_members: Row[] = [];
  for (let g = 1; g <= 4; g++)
    for (let k = 0; k < 4; k++)
      duty_group_members.push({ group_id: `demo-dg-${g}`, student_id: S(((g - 1) * 4 + k) % 16 + 1), class_id: CLASS_ID });
  const DUTY_TASKS = ['扫地', '拖地', '擦黑板', '擦讲台', '倒垃圾', '走廊', '关灯关门', '检查饮水机'];
  const duty_tasks = DUTY_TASKS.map((n, i) => ({ id: `demo-dt-${i + 1}`, class_id: CLASS_ID, name: n, sort_order: i + 1 }));
  const duty_records = DUTY_TASKS.slice(0, 6).map((_, i) => ({
    id: uid(), class_id: CLASS_ID, date: T, group_id: 'demo-dg-1', task_id: `demo-dt-${i + 1}`, ok: i !== 4,
  }));

  // 待办：1 逾期、1 今天、1 未来、1 已完成
  const todos = [
    { id: 'demo-todo-1', class_id: CLASS_ID, title: '收秋游同意书（还差 5 份）', category: '材料', due_date: addDays(T, -1), done: false },
    { id: 'demo-todo-2', class_id: CLASS_ID, title: '给王梓萱家长回电话', category: '其他', due_date: T, done: false },
    { id: 'demo-todo-3', class_id: CLASS_ID, title: '提交心理健康排查表', category: '材料', due_date: addDays(T, 3), done: false },
    { id: 'demo-todo-4', class_id: CLASS_ID, title: '发月考成绩条到家长群', category: '通知', due_date: addDays(T, -3), done: true },
  ];

  // 谈话 / 家校联系（含逾期跟进）
  const talks = [
    {
      id: uid(), class_id: CLASS_ID, student_id: S(5), talk_date: addDays(T, -8), place: '办公室',
      duration_min: 20, trigger_type: '事件触发', topic: '课堂情绪波动',
      key_points: '与同学发生口角后情绪低落，倾诉了家庭情况', student_response: '愿意表达，接受调解',
      follow_up: '一周后再聊，观察情绪', follow_up_date: addDays(T, -1),
    },
    {
      id: uid(), class_id: CLASS_ID, student_id: S(12), talk_date: addDays(T, -3), place: '走廊',
      duration_min: 10, trigger_type: '例行', topic: '月考成绩分析',
      key_points: '数学薄弱，缺乏信心', student_response: '愿意参加学习小组',
      follow_up: null, follow_up_date: null,
    },
  ];
  const home_school_contacts = [
    {
      id: uid(), class_id: CLASS_ID, student_id: S(12), contact_date: addDays(T, -7), method: '电话',
      person: '母亲', topic: '学习状态', summary: '反馈作业拖拉，约定每日打卡', result: '家长配合',
      follow_up: '确认打卡执行情况', follow_up_date: T, resolved: false,
    },
    {
      id: uid(), class_id: CLASS_ID, student_id: S(3), contact_date: addDays(T, -2), method: '微信',
      person: '父亲', topic: '表扬进步', summary: '近期课堂表现明显进步', result: '家长欣慰',
      follow_up: null, follow_up_date: null, resolved: true,
    },
  ];

  // 事件台账
  const behavior_events = [
    { id: uid(), class_id: CLASS_ID, student_id: S(1), event_date: addDays(T, -2), event_type: '表扬', category: '学习', description: '主动帮助同学讲解数学题', action_taken: '口头表扬', severity: '低', guardian_notified: false, resolved: true },
    { id: uid(), class_id: CLASS_ID, student_id: S(10), event_date: addDays(T, -5), event_type: '表扬', category: '劳动', description: '组织小组完成大扫除', action_taken: '班会表扬', severity: '低', guardian_notified: false, resolved: true },
    { id: uid(), class_id: CLASS_ID, student_id: S(6), event_date: addDays(T, -1), event_type: '违纪', category: '纪律', description: '上课与同桌讲话', action_taken: '谈话提醒', severity: '中', guardian_notified: false, resolved: false, follow_up: '观察一周' },
  ];

  // 考试与成绩（月考 + 期中，7 科）
  const SUBJECTS_FULL: [string, number][] = [
    ['语文', 120], ['数学', 120], ['英语', 120], ['政治', 100], ['历史', 100], ['地理', 100], ['生物', 100],
  ];
  const exams = [
    { id: 'demo-exam-1', class_id: CLASS_ID, name: '9月月考', exam_type: '月考', exam_date: addDays(T, -30) },
    { id: 'demo-exam-2', class_id: CLASS_ID, name: '期中考试', exam_type: '期中', exam_date: addDays(T, -10) },
  ];
  const exam_subjects: Row[] = [];
  exams.forEach((e) =>
    SUBJECTS_FULL.forEach(([subject, full], i) =>
      exam_subjects.push({ id: `demo-es-${e.id.slice(-1)}-${i}`, exam_id: e.id, class_id: CLASS_ID, subject, full_score: full })
    )
  );
  const grade_records: Row[] = [];
  const ability = students.map((_, i) => 0.55 + rand() * 0.36 + (i === 0 ? 0.03 : 0));
  exams.forEach((e, ei) => {
    students.forEach((stu, si) => {
      SUBJECTS_FULL.forEach(([subject, full], fi) => {
        const weak = ability[si] < 0.62;
        const improve = (weak ? 0.05 : 0.01) * ei + (rand() - 0.5) * 0.08;
        const pct = Math.min(0.98, Math.max(0.35, ability[si] + (rand() - 0.5) * 0.1 + improve));
        const absent = ei === 1 && si === 15 && fi === 1;
        grade_records.push({
          id: uid(), exam_id: e.id, class_id: CLASS_ID, student_id: stu.id, subject,
          score: absent ? null : Math.round(pct * full), is_absent: absent, note: null,
        });
      });
    });
  });

  // 座位（4 行 5 列）
  const seats: Row[] = [];
  let n = 0;
  for (let r = 1; r <= 4; r++)
    for (let c = 1; c <= 5; c++) {
      n++;
      seats.push({
        class_id: CLASS_ID, seat_row: r, seat_col: c,
        student_id: n <= 16 ? S(n) : null, locked: r === 1 && c === 3,
      });
    }
  const seat_history = [
    { id: uid(), class_id: CLASS_ID, change_date: addDays(T, -10), student_id: S(2), seat_row: 1, seat_col: 3 },
  ];

  // 班委 / 小组
  const class_leaders = [
    { id: uid(), class_id: CLASS_ID, student_id: S(1), role: '班长', term: '2025秋' },
    { id: uid(), class_id: CLASS_ID, student_id: S(6), role: '学习委员', term: '2025秋' },
    { id: uid(), class_id: CLASS_ID, student_id: S(11), role: '语文课代表', term: '2025秋' },
    { id: uid(), class_id: CLASS_ID, student_id: S(14), role: '体育委员', term: '2025秋' },
  ];
  const study_groups = [1, 2, 3, 4].map((i) => ({
    id: `demo-sg-${i}`, class_id: CLASS_ID, name: `${i}组`, group_type: '学习组',
  }));
  const study_group_members: Row[] = [];
  for (let g = 1; g <= 4; g++)
    for (let k = 0; k < 4; k++)
      study_group_members.push({
        group_id: `demo-sg-${g}`,
        student_id: S(g + k * 4 > 16 ? g : g + k * 4),
        class_id: CLASS_ID,
        role: k === 0 ? '组长' : '组员',
      });

  // 会议 / 活动 / 荣誉 / 班会
  const parent_meetings = [
    { id: uid(), class_id: CLASS_ID, meeting_date: addDays(T, -25), title: '开学家长会', agenda: '班级介绍、作息安排、家长配合事项', summary: '到会 46 位家长，沟通顺畅' },
  ];
  const parent_meeting_attendees: Row[] = students.map((s) => ({
    meeting_id: parent_meetings[0].id, student_id: s.id, class_id: CLASS_ID,
    guardian_name: s.guardian_name, signed: rand() < 0.9,
  }));
  const activities = [
    { id: uid(), class_id: CLASS_ID, name: '秋季运动会', act_type: '运动会', act_date: addDays(T, -15), description: '全班参与 6 个项目，获年级团体第三', result: '团体第三名', photo_paths: [] },
  ];
  const honors = [
    { id: uid(), class_id: CLASS_ID, student_id: S(1), honor_date: addDays(T, -20), title: '校级三好学生', level: '校级', source: '学校' },
    { id: uid(), class_id: CLASS_ID, student_id: S(10), honor_date: addDays(T, -15), title: '运动会跳远第一名', level: '校级', source: '学校' },
  ];
  const class_meetings = [
    { id: uid(), class_id: CLASS_ID, meeting_date: addDays(T, -7), theme: '我的学习方法', purpose: '期中后学习方法交流', process: '小组讨论 + 代表分享', feedback: '气氛热烈' },
  ];
  const notice_drafts = [
    { id: uid(), class_id: CLASS_ID, title: '秋游通知', content: '下周四秋游，请穿运动鞋、带水壶……', channel: '微信群', sent_date: addDays(T, -4), scope: '全班' },
  ];
  const comment_library = [
    { id: uid(), user_id: DEMO_USER.id, category: '优点', content: '你是一个乐于助人的孩子，同学们都喜欢和你组队。' },
    { id: uid(), user_id: DEMO_USER.id, category: '优点', content: '课堂上你的发言总有独到的见解。' },
    { id: uid(), user_id: DEMO_USER.id, category: '期望', content: '希望你下次写字再工整一些，老师期待你的进步。' },
    { id: uid(), user_id: DEMO_USER.id, category: '期望', content: '如果能坚持每日预习，成绩会更上一层楼。' },
    { id: uid(), user_id: DEMO_USER.id, category: '鼓励', content: '一次考试不代表全部，继续加油，老师相信你。' },
    { id: uid(), user_id: DEMO_USER.id, category: '事例', content: '运动会上你摔倒后仍坚持跑完全程，令人敬佩。' },
  ];

  // 重点关注变更日志
  const special_focus_logs = [
    { id: uid(), class_id: CLASS_ID, student_id: S(5), change_date: addDays(T, -8), level_from: '黄', level_to: '红', reason: '情绪波动加大', next_contact_date: addDays(T, 2) },
    { id: uid(), class_id: CLASS_ID, student_id: S(12), change_date: addDays(T, -20), level_from: '无', level_to: '黄', reason: '月考多科不及格', next_contact_date: addDays(T, 5) },
  ];

  const random_pick_logs = [S(3), S(8), S(15)].map((sid) => ({
    id: uid(), class_id: CLASS_ID, pick_date: T, student_id: sid,
  }));

  const import_logs = [
    { id: uid(), user_id: DEMO_USER.id, import_type: '学生名单', file_name: '学生名单示例-52人.xlsx', total_rows: 16, ok_rows: 16, err_rows: 0, errors: null, created_at: new Date().toISOString() },
  ];
  const audit_logs = [
    { id: uid(), user_id: DEMO_USER.id, action: 'login', object_type: 'auth', object_id: null, detail: null, created_at: new Date().toISOString() },
  ];
  const backup_logs = [
    { id: uid(), user_id: DEMO_USER.id, backup_date: addDays(T, -3), scope: '全部数据', note: '演示数据' },
  ];

  const focus_summary_notes = [
    { id: 'demo-fsn-1', class_id: CLASS_ID, student_name: '李雨欣', gender: '女', family_structure: '双亲', category: '健康安全', detail: '先天性心脏室间隔缺损，术后康复', advice: '严禁剧烈运动，体育课、跑操、运动会需特殊关照；留意胸闷乏力等信号' },
    { id: 'demo-fsn-2', class_id: CLASS_ID, student_name: '王梓萱', gender: '女', family_structure: '双亲', category: '健康安全', detail: '特殊体质，全身皮肤干燥', advice: '秋冬重点关注皮肤状态；出现不适及时沟通家长' },
    { id: 'demo-fsn-3', class_id: CLASS_ID, student_name: '张欣怡', gender: '女', family_structure: '双亲', category: '健康安全', detail: '花粉过敏', advice: '花粉季做好教室通风；留意过敏反应' },
    { id: 'demo-fsn-4', class_id: CLASS_ID, student_name: '李浩然', gender: '男', family_structure: '双亲', category: '健康安全', detail: '鼻窦炎', advice: '换季注意保暖，避免冷风直吹' },
    { id: 'demo-fsn-5', class_id: CLASS_ID, student_name: '陈思远', gender: '男', family_structure: '单亲', category: '心理行为', detail: '父母离异后情绪波动大，遇批评出现过激反应', advice: '避免当众指责；每周联系家长一次；联动心理老师' },
    { id: 'demo-fsn-6', class_id: CLASS_ID, student_name: '陈静怡', gender: '女', family_structure: '双亲', category: '心理行为', detail: '存在焦虑、抑郁、厌学情绪', advice: '关注情绪与出勤；建议家长配合专业心理评估' },
    { id: 'demo-fsn-7', class_id: CLASS_ID, student_name: '杨紫萱', gender: '女', family_structure: '双亲', category: '心理行为', detail: '容易产生自卑、抵触情绪', advice: '鼓励式教育，情绪低落时一对一疏导' },
    { id: 'demo-fsn-8', class_id: CLASS_ID, student_name: '赵梦琪', gender: '女', family_structure: '双亲', category: '心理行为', detail: '遇挫折易哭闹，自我要求过高', advice: '降低任务难度台阶；多给正向反馈' },
    { id: 'demo-fsn-9', class_id: CLASS_ID, student_name: '刘一鸣', gender: '男', family_structure: '双亲', category: '家庭经济', detail: '家庭经济困难', advice: '同步助学补助与费用减免政策；保护自尊心' },
    { id: 'demo-fsn-10', class_id: CLASS_ID, student_name: '黄雅婷', gender: '女', family_structure: '双亲', category: '家庭经济', detail: '家庭经济困难', advice: '留意活动缴费等实际困难' },
    { id: 'demo-fsn-11', class_id: CLASS_ID, student_name: '赵天宇', gender: '男', family_structure: '双亲', category: '睡眠问题', detail: '入睡困难', advice: '关注课堂精神状态；建议调整睡前作息' },
    { id: 'demo-fsn-12', class_id: CLASS_ID, student_name: '杨博文', gender: '男', family_structure: '双亲', category: '家长诉求', detail: '体型偏胖，希望担任体育委员督促自己', advice: '酌情考虑体育职务；多正向激励' },
    { id: 'demo-fsn-13', class_id: CLASS_ID, student_name: '黄俊杰', gender: '男', family_structure: '双亲', category: '家长诉求', detail: '学习粗心、书写差，作业常应付', advice: '重点检查书写质量与完成度' },
  ];

  // 备课教案（让「备课教案 → 课堂提示词 → 课堂」这条链在演示模式下也能跑通）
  const lesson_settings = [
    {
      owner_id: DEMO_USER.id,
      textbook: '部编版',
      grade: '初二上',
      lessons: ['岳阳楼记', '记承天寺夜游', '答谢中书书', '三峡'],
      outline_text: '',
      standard_text: '',
    },
  ];
  const lesson_plans = [
    {
      id: 'demo-plan-1',
      owner_id: DEMO_USER.id,
      grade: '初二上',
      textbook: '部编版',
      lesson_title: '岳阳楼记',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      content: {
        meta: { grade: '初二上', textbook: '部编版', lesson: '《岳阳楼记》第2课时', period: '新授课', duration: '45分钟', style: '品读探究' },
        goals: [
          { dimension: '语言建构与运用', content: '积累"谪守、属予、浩浩汤汤、薄暮冥冥"等词语，能顺畅朗读并背诵第3、4段。' },
          { dimension: '思维发展与提升', content: '通过对比"迁客骚人"与"古仁人"的心境，理解作者由景生情、由情入理的思路。' },
          { dimension: '审美鉴赏与创造', content: '品味骈散结合的语言节奏，感受洞庭湖气象与"先忧后乐"的境界美。' },
          { dimension: '文化传承与理解', content: '理解"不以物喜，不以己悲"的士人胸襟，联系当代谈"忧乐观"。' },
        ],
        keyPoints: ['第3、4段景物描写的层次与对应心境（悲／喜）', '"先天下之忧而忧，后天下之乐而乐"的内涵'],
        difficulties: ['"迁客骚人"之悲喜与"古仁人"之境界的差异，学生易停留在"两种心情"的表层'],
        questions: [
          '同一座岳阳楼，为什么"迁客骚人"会有"悲"与"喜"两种截然不同的感受？',
          '作者为什么要先写"悲喜"，再引出"古仁人"？这样安排有什么好处？',
          '"先天下之忧而忧"放在今天还成立吗？请结合一个例子说说。',
        ],
        prep: { teacher: '洞庭湖地理与"迁客骚人"背景资料、朗读音频、问题卡片', student: '朗读全文2遍，标注不理解的词句' },
        process: [
          { step: '情境导入', duration: '5分钟', teacherActivity: '出示洞庭湖地图与岳阳楼图，问："假如你被贬到这里，会是什么心情？"', studentActivity: '自由发言，说说自己的第一感受', intent: '建立情境，为理解"悲喜"做铺垫' },
          { step: '初读感知', duration: '8分钟', teacherActivity: '范读第3、4段，正音断句', studentActivity: '跟读、齐读，圈出写景句', intent: '扫清语言障碍，读出骈句节奏' },
          { step: '精读品味', duration: '14分钟', teacherActivity: '引导比较两段景物与随之而来的"悲""喜"，板书对照', studentActivity: '分组圈画关键词，完成对比表', intent: '体会由景生情的写法' },
          { step: '研读探究', duration: '12分钟', teacherActivity: '抛出主问题："为什么要先写悲喜，再写古仁人？"', studentActivity: '小组讨论、代表发言、互相补充', intent: '由情入理，理解作者的胸襟' },
          { step: '拓展延伸', duration: '4分钟', teacherActivity: '出示当代"忧乐观"事例，请学生谈看法', studentActivity: '联系生活举例，口头表达', intent: '古今对接，落实文化传承' },
          { step: '课堂小结', duration: '2分钟', teacherActivity: '师生共同回顾：景—情—理三层推进', studentActivity: '齐背名句', intent: '梳理结构，强化记忆' },
        ],
        boardDesign: '岳阳楼记 / 一、景（洞庭气象）→ 二、情（悲／喜）→ 三、理（不以物喜，不以己悲 → 先忧后乐）',
        homework: {
          base: '背诵第3、4段；整理本课词语10个。',
          extended: '以「我的一次不以物喜」为题，写150字随笔。',
        },
        standards: ['在语言实践中积累与运用', '在问题探究中发展思维', '在审美体验中传承文化'],
        reflection: '预设问题：学生可能把"悲喜"简单理解为性格差异——需追问"是因为环境还是因为心境"；"古仁人"概念较抽象，用具体人物举例降低难度。',
        interaction: {
          opening: '"同一座楼，同一个人，为什么会有两种心情？"',
          dialogues: '"你圈的是哪个词？""如果有同学认为……你怎么看？""能不能用一句话概括作者的态度？"',
          evaluation: '「你抓住了「衔远山，吞长江」的气象，说得很有画面感。」「如果能再补上作者的心境，就更完整了。」',
        },
      },
    },
  ];

  return {
    focus_summary_notes,
    lesson_settings,
    lesson_plans,
    // 课堂资源库：备课教案 →（openmaic 生成）课堂 → 课堂答题留档
    classroom_resources: [
      {
        id: 'demo-cls-1',
        class_id: CLASS_ID,
        title: '《岳阳楼记》第1课时·文言疏通',
        lesson_ref: '岳阳楼记',
        plan_id: null,
        resource_date: addDays(T, -3),
        status: '已上',
        maic_url: 'https://open.maic.chat/classroom/demo-yyl-1',
        attachments: [
          { name: '课堂课件（可编辑 pptx）', url: 'https://open.maic.chat/demo/yyl-1.pptx' },
          { name: '离线课堂包（断网可用）', url: 'https://open.maic.chat/demo/yyl-1-offline.zip' },
        ],
        quiz_sessions: [
          {
            label: '字词注音检测（10 题）',
            at: addDays(T, -3),
            results: students.slice(0, 10).map((s, i) => ({ student_id: s.id, name: s.name, ok: i % 4 !== 0 })),
          },
        ],
        notes: '通假字部分学生反应慢，下节课开头再复习一遍；AI 同学的辩论环节学生很投入。',
        created_at: new Date().toISOString(),
      },
      {
        id: 'demo-cls-2',
        class_id: CLASS_ID,
        title: '《岳阳楼记》第2课时·写景与抒情',
        lesson_ref: '岳阳楼记',
        plan_id: null,
        resource_date: T,
        status: '已备',
        maic_url: 'https://open.maic.chat/classroom/demo-yyl-2',
        attachments: [{ name: '课堂课件（可编辑 pptx）', url: 'https://open.maic.chat/demo/yyl-2.pptx' }],
        quiz_sessions: [],
        notes: '重点：对比"迁客骚人"与"古仁人"的心境差异；准备用交互地图讲洞庭湖地理。',
        created_at: new Date().toISOString(),
      },
      {
        id: 'demo-cls-4',
        class_id: CLASS_ID,
        title: '《济南的冬天》第1课时（老舍）',
        lesson_ref: '济南的冬天',
        plan_id: null,
        resource_date: addDays(T, -1),
        status: '已备',
        maic_url: '',
        attachments: [
          { name: '课堂教学课件（可编辑 pptx · 7 页）', url: '/classroom-assets/jinan-dongtian/jinan-dongtian-kejian.pptx' },
          { name: '交互页面：圈点批注找「温晴」（离线可用）', url: '/classroom-assets/jinan-dongtian/jinan-dongtian-interactive-01.html' },
          { name: '课堂源文件（可导入 OpenMAIC 再编辑 · 备份）', url: '/classroom-assets/jinan-dongtian/jinan-dongtian.maic.zip' },
        ],
        quiz_sessions: [],
        notes: '导出物已入库：课件用于希沃白板导入，交互页面在希沃浏览器直接打开（无需联网）。',
        created_at: new Date().toISOString(),
      },
      {
        id: 'demo-cls-3',
        class_id: CLASS_ID,
        title: '《记承天寺夜游》·品读',
        lesson_ref: '记承天寺夜游',
        plan_id: null,
        resource_date: addDays(T, 2),
        status: '已备',
        maic_url: '',
        attachments: [],
        quiz_sessions: [],
        notes: '还没生成课堂，准备用"闲人"二字做切入。',
        created_at: new Date().toISOString(),
      },
    ],
    school_classes: [
      {
        id: CLASS_ID, owner_id: DEMO_USER.id, name: '初一（3）班', grade: '初一',
        school_year: '2025-2026', term: '2025秋', role: '班主任',
        subjects: ['语文', '数学', '英语', '政治', '历史', '地理', '生物'],
        homeroom_teacher: '张老师', archived: false, created_at: new Date().toISOString(),
      },
    ],
    app_settings: [
      {
        user_id: DEMO_USER.id, current_class_id: CLASS_ID, current_term: '2025秋',
        weekly_backup_reminder: true, mask_phone: false, seating_rows: 4, seating_cols: 5, aisle_after: null,
      },
    ],
    students,
    attendance_sessions,
    attendance_records,
    leave_requests,
    homework_records,
    schedule_entries,
    duty_groups,
    duty_group_members,
    duty_tasks,
    duty_records,
    todos,
    talks,
    home_school_contacts,
    behavior_events,
    random_pick_logs,
    exams,
    exam_subjects,
    grade_records,
    seats,
    seat_history,
    class_leaders,
    study_groups,
    study_group_members,
    parent_meetings,
    parent_meeting_attendees,
    activities,
    honors,
    class_meetings,
    notice_drafts,
    comment_library,
    special_focus_logs,
    term_reports: [],
    photos: [],
    payment_records: [],
    import_logs,
    audit_logs,
    backup_logs,
  };
}

/* ---------- 演示客户端：共享本地查询引擎 + 内存数据库 ---------- */

let db: Record<string, Row[]> | null = null;

function getDb() {
  if (!db) db = buildDb();
  return db;
}

const capAudit = () => {
  const d = getDb();
  if ((d.audit_logs ?? []).length > 200) d.audit_logs = d.audit_logs.slice(-200);
};

/* ---------- 演示模式 auth / storage 存根 ---------- */
const demoAuth = {
  getSession: async () => ({
    data: { session: { user: DEMO_USER, expires_at: Math.floor(Date.now() / 1000) + 86400 } },
    error: null,
  }),
  getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
  onAuthStateChange: (cb: (ev: string, session: any) => void) => {
    try {
      cb('INITIAL_SESSION', { user: DEMO_USER });
    } catch {}
    return { data: { subscription: { unsubscribe() {} } } };
  },
  signOut: async () => {
    exitDemo();
    if (typeof window !== 'undefined') window.location.href = '/login';
    return { error: null };
  },
  signInWithPassword: async () => ({
    data: {},
    error: { message: '演示模式下无需登录。点击「退出演示」即可返回真实登录。' },
  }),
  resetPasswordForEmail: async () => ({ error: { message: '演示模式下不可用' } }),
  mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }),
    listFactors: async () => ({ data: { totp: [] }, error: null }),
    challenge: async () => ({ data: null, error: { message: '演示模式下不可用' } }),
    verify: async () => ({ data: null, error: { message: '演示模式下不可用' } }),
  },
};

const demoStorage = {
  from: (_bucket: string) => ({
    upload: async () => ({ data: { path: 'demo/ignored.jpg' }, error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
    remove: async () => ({ data: null, error: null }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  }),
};

export function createDemoClient(): any {
  return createMiniClient({
    getDb: async () => getDb(),
    onMutate: capAudit,
    auth: demoAuth,
    storage: demoStorage,
  });
}
