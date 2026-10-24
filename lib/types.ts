// 与 supabase/schema.sql 对应的实体类型（按需使用，查询结果建议二次断言）

export interface Profile {
  user_id: string;
  display_name?: string | null;
  school_name?: string | null;
}

export interface AppSettings {
  user_id: string;
  current_class_id?: string | null;
  current_term?: string | null;
  weekly_backup_reminder: boolean;
  mask_phone: boolean;
  seating_rows: number;
  seating_cols: number;
  aisle_after?: number;
}

export interface SchoolClass {
  id: string;
  owner_id: string;
  name: string;
  grade: string;
  school_year: string;
  term: string;
  role: '班主任' | '任教';
  subjects: string[];
  homeroom_teacher?: string | null;
  archived: boolean;
  created_at?: string;
}

// 老师自己加的条目（基本信息 / 新生调查表里都可以加）
export interface CustomFieldEntry {
  section: 'basic' | 'survey';
  label: string;
  value: string;
}

export interface Student {
  id: string;
  class_id: string;
  student_no: string;
  name: string;
  gender?: '男' | '女' | null;
  ethnicity?: string | null; // 民族
  birthday?: string | null;
  photo_path?: string | null;
  address?: string | null;
  guardian_name?: string | null;
  guardian_relation?: string | null;
  guardian_phone?: string | null;
  guardian2_name?: string | null;
  guardian2_relation?: string | null;
  guardian2_phone?: string | null;
  family_structure?: string | null;
  pickup_person?: string | null;
  is_boarding: boolean;
  health_notes?: string | null;
  primary_school?: string | null;
  entrance_score?: number | null;
  height_cm?: number | null;
  tags: string[];
  special_level: '无' | '黄' | '红';
  special_reason?: string | null;
  active: boolean;
  left_at?: string | null;
  notes?: string | null;
  survey?: Record<string, string> | null; // 新生调查表全量作答（身份证号不入库）
  custom_fields?: CustomFieldEntry[] | null; // 老师自写的条目（基本信息 / 调查表）
  created_at?: string;
}

export interface Seat {
  class_id: string;
  seat_row: number;
  seat_col: number;
  student_id?: string | null;
  locked: boolean;
}

export interface SeatHistory {
  id: string;
  class_id: string;
  change_date: string;
  student_id: string;
  seat_row: number;
  seat_col: number;
}

export interface AttendanceSession {
  id: string;
  class_id: string;
  name: string;
  sort_order: number;
  is_daily: boolean;
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  class_id: string;
  student_id: string;
  date: string;
  session_id?: string | null;
  status: string;
  late_minutes?: number | null;
  note?: string | null;
  created_at?: string;
}

export interface LeaveRequest {
  id: string;
  class_id: string;
  student_id: string;
  leave_type: '病假' | '事假' | '公假';
  start_date: string;
  end_date: string;
  reason?: string | null;
  guardian_contacted: boolean;
  status: '待审批' | '已批准' | '已拒绝';
  approved_at?: string | null;
  return_date?: string | null;
  note?: string | null;
  contact_method?: string | null;
  images?: string[];
  created_at?: string;
}

export interface HomeworkRecord {
  id: string;
  class_id: string;
  student_id: string;
  date: string;
  subject: string;
  hw_type?: string | null;
  status: '已交' | '未交' | '补交' | '优秀';
  note?: string | null;
  created_at?: string;
}

export interface ScheduleEntry {
  id: string;
  class_id: string;
  weekday: number;
  period: number;
  subject?: string | null;
  teacher?: string | null;
  note?: string | null;
  created_at?: string;
}

// 备课模块
export interface LessonSettings {
  owner_id: string;
  textbook: string;
  grade: string;
  lessons: string[];
  outline_text?: string | null;
  standard_text?: string | null;
}

export interface LessonGoal {
  dimension: string; // 语言建构与运用 / 思维发展与提升 / 审美鉴赏与创造 / 文化传承与理解
  content: string;
}

export interface LessonStep {
  step: string; // 导入 / 初读感知 / 精读品味 / 研读探究 / 拓展延伸 / 课堂小结
  duration: string; // 如 5分钟
  teacherActivity: string;
  studentActivity: string;
  intent: string;
}

export interface LessonPlanContent {
  meta: { grade: string; textbook: string; lesson: string; period: string; duration: string; style: string };
  goals: LessonGoal[];
  keyPoints: string[];
  difficulties: string[];
  questions: string[]; // 核心问题设计（2-3 个主问题）
  prep: { teacher: string; student: string }; // 教学准备：教师准备 / 学生预习要求
  process: LessonStep[];
  boardDesign: string;
  homework: { base: string; extended: string };
  standards: string[];
  reflection: string; // 教学反思预设：可能出现的问题及应对
  interaction: { opening: string; dialogues: string; evaluation: string }; // 课堂互动话术
}

export interface LessonPlan {
  id: string;
  owner_id: string;
  grade?: string | null;
  textbook?: string | null;
  lesson_title: string;
  content?: LessonPlanContent | null;
  created_at?: string;
  updated_at?: string;
}

export interface DutyTask {
  id: string;
  class_id: string;
  name: string;
  sort_order: number;
}

export interface DutyGroup {
  id: string;
  class_id: string;
  name: string;
  sort_order: number;
}

export interface DutyGroupMember {
  group_id: string;
  student_id: string;
  class_id: string;
}

// 值日固定分工（任务 ↔ 固定学生）
export interface DutyTaskMember {
  task_id: string;
  student_id: string;
  class_id: string;
}

// 值日分工矩阵（组 × 任务 → 责任人）
export interface DutyAssignment {
  id: string;
  class_id: string;
  group_id: string;
  task_id: string;
  student_id: string;
}

export interface DutyRecord {
  id: string;
  class_id: string;
  date: string;
  group_id?: string | null;
  task_id?: string | null;
  ok: boolean;
  issue?: string | null;
  recorded_at?: string;
}

export interface BehaviorEvent {
  id: string;
  class_id: string;
  student_id: string;
  event_date: string;
  event_type: '表扬' | '违纪' | '冲突' | '意外' | '其他';
  category?: string | null;
  description?: string | null;
  action_taken?: string | null;
  severity?: '低' | '中' | '高' | null;
  guardian_notified: boolean;
  resolved: boolean;
  follow_up?: string | null;
  created_at?: string;
}

export interface RandomPickLog {
  id: string;
  class_id: string;
  pick_date: string;
  student_id: string;
  created_at?: string;
}

export interface Exam {
  id: string;
  class_id: string;
  name: string;
  exam_type: '单元测' | '月考' | '期中' | '期末';
  exam_date: string;
  note?: string | null;
  created_at?: string;
}

export interface ExamSubject {
  id: string;
  exam_id: string;
  class_id: string;
  subject: string;
  full_score: number;
}

export interface GradeRecord {
  id: string;
  exam_id: string;
  class_id: string;
  student_id: string;
  subject: string;
  score?: number | null;
  score_detail?: Record<string, number> | null;
  is_absent: boolean;
  note?: string | null;
  created_at?: string;
}

export interface StudyGroup {
  id: string;
  class_id: string;
  name: string;
  group_type: '行政组' | '学习组' | '值日组';
}

export interface StudyGroupMember {
  group_id: string;
  student_id: string;
  class_id: string;
  role: '组长' | '组员';
}

export interface MentorPair {
  id: string;
  class_id: string;
  mentor_id: string;
  mentee_id: string;
  subject: string;
  active: boolean;
}

export interface Talk {
  id: string;
  class_id: string;
  student_id: string;
  talk_date: string;
  place?: string | null;
  duration_min?: number | null;
  trigger_type?: '主动约谈' | '事件触发' | '家长要求' | '例行' | null;
  topic?: string | null;
  key_points?: string | null;
  student_response?: string | null;
  follow_up?: string | null;
  follow_up_date?: string | null;
  created_at?: string;
}

export interface SpecialFocusLog {
  id: string;
  class_id: string;
  student_id: string;
  change_date: string;
  level_from: string;
  level_to: string;
  reason?: string | null;
  next_contact_date?: string | null;
}

export interface HomeSchoolContact {
  id: string;
  class_id: string;
  student_id: string;
  contact_date: string;
  method: '电话' | '微信' | '面谈' | '家访' | '其他';
  person?: string | null;
  topic?: string | null;
  summary?: string | null;
  result?: string | null;
  follow_up?: string | null;
  follow_up_date?: string | null;
  resolved: boolean;
  created_at?: string;
}

export interface ParentMeeting {
  id: string;
  class_id: string;
  meeting_date: string;
  title: string;
  agenda?: string | null;
  summary?: string | null;
  created_at?: string;
}

export interface ParentMeetingAttendee {
  meeting_id: string;
  student_id: string;
  class_id: string;
  guardian_name?: string | null;
  signed: boolean;
}

export interface NoticeDraft {
  id: string;
  class_id: string;
  title: string;
  content?: string | null;
  channel?: '微信群' | '钉钉' | '纸质' | '当面' | null;
  sent_date?: string | null;
  scope?: string | null;
  created_at?: string;
}

export interface ClassLeader {
  id: string;
  class_id: string;
  student_id: string;
  role: string;
  term: string;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
}

export interface LeaderElection {
  id: string;
  class_id: string;
  election_date: string;
  term: string;
  positions?: Record<string, string> | null;
  process?: string | null;
}

export interface ClassMeeting {
  id: string;
  class_id: string;
  meeting_date: string;
  theme: string;
  purpose?: string | null;
  process?: string | null;
  feedback?: string | null;
  created_at?: string;
}

export interface Activity {
  id: string;
  class_id: string;
  name: string;
  act_type?: '运动会' | '文艺汇演' | '社会实践' | '主题教育' | '其他' | null;
  act_date: string;
  description?: string | null;
  result?: string | null;
  photo_paths: string[];
  created_at?: string;
}

export interface Honor {
  id: string;
  class_id: string;
  student_id?: string | null;
  honor_date: string;
  title: string;
  level?: '校级' | '区级' | '市级' | '省级' | '国家级' | null;
  source?: string | null;
  created_at?: string;
}

export interface TermReport {
  id: string;
  class_id: string;
  student_id: string;
  term: string;
  conduct_level?: string | null;
  conduct_morality?: string | null;
  conduct_academic?: string | null;
  conduct_health?: string | null;
  conduct_labor?: string | null;
  conduct_aesthetic?: string | null;
  comment_draft?: string | null;
  comment_final?: string | null;
  generated_at?: string | null;
  updated_at?: string;
}

export interface CommentLibraryItem {
  id: string;
  user_id: string;
  category: '优点' | '期望' | '鼓励' | '事例';
  content: string;
  created_at?: string;
}

export interface Todo {
  id: string;
  class_id: string;
  title: string;
  category?: '材料' | '缴费' | '通知' | '其他' | null;
  due_date?: string | null;
  done: boolean;
  note?: string | null;
  created_at?: string;
}

export interface PaymentRecord {
  id: string;
  todo_id: string;
  class_id: string;
  student_id: string;
  paid: boolean;
  paid_at?: string | null;
  note?: string | null;
}

export interface BackupLog {
  id: string;
  user_id: string;
  backup_date: string;
  scope?: string | null;
  note?: string | null;
}

export interface ImportLog {
  id: string;
  user_id: string;
  import_type: string;
  file_name?: string | null;
  total_rows: number;
  ok_rows: number;
  err_rows: number;
  errors?: unknown | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  object_type?: string | null;
  object_id?: string | null;
  detail?: unknown | null;
  ip?: string | null;
  created_at: string;
}

// 视图类型
export interface DueReminder {
  kind: string;
  class_id: string;
  student_id?: string | null;
  due_date: string | null;
  detail: string | null;
}

export interface TimelineItem {
  class_id: string;
  student_id: string;
  ts: string;
  kind: string;
  title: string | null;
  detail: string | null;
}

export interface ExamStatsRow {
  exam_id: string;
  exam_name: string;
  exam_date: string;
  class_id: string;
  subject: string;
  full_score: number;
  student_count: number;
  avg_score: number | null;
  median_score: number | null;
  max_score: number | null;
  min_score: number | null;
  stddev_score: number | null;
  excellent_rate: number | null;
  pass_rate: number | null;
  s_below60: number;
  s_60_69: number;
  s_70_79: number;
  s_80_89: number;
  s_90_plus: number;
}

// 新生重点关注学生汇总（含家庭结构）
export interface FocusSummaryNote {
  id: string;
  class_id: string;
  student_name: string;
  gender?: string | null;
  family_structure?: string | null;
  category: string; // 健康安全 / 心理行为 / 家庭经济 / 睡眠问题 / 家长诉求
  detail?: string | null;
  advice?: string | null;
  created_at?: string;
}

// 课堂模块：课堂资源库（备课教案 → 课堂 → 课堂答题留档）
export interface ClassroomAttachment {
  name: string;
  url: string;
}

export interface ClassroomQuizResult {
  student_id: string;
  name: string;
  ok: boolean;
}

export interface ClassroomQuizSession {
  label: string;
  at: string;
  results: ClassroomQuizResult[];
}

export interface ClassroomResource {
  id: string;
  class_id: string;
  title: string;
  lesson_ref?: string | null;
  plan_id?: string | null;
  resource_date: string;
  status: '已备' | '已上' | string;
  maic_url?: string | null;
  attachments: ClassroomAttachment[];
  quiz_sessions: ClassroomQuizSession[];
  notes?: string | null;
  created_at?: string;
}
