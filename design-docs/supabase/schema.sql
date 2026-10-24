-- ============================================================================
-- 初一班主任管理系统 · Supabase Schema
-- 在 Supabase SQL Editor 中一次性执行（可重复执行）
-- 依赖：Supabase Auth（auth.users），PostgreSQL 15+
-- 执行顺序：本文件 → storage-policies.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. 清理（保证可重复执行）
-- ----------------------------------------------------------------------------
drop view if exists v_attendance_monthly cascade;
drop view if exists v_homework_missed cascade;
drop view if exists v_exam_stats cascade;
drop view if exists v_student_progress cascade;
drop view if exists v_student_subject_gaps cascade;
drop view if exists v_class_trend cascade;
drop view if exists v_student_radar cascade;
drop view if exists v_due_reminders cascade;
drop view if exists v_growth_timeline cascade;

drop table if exists backup_logs cascade;
drop table if exists import_logs cascade;
drop table if exists audit_logs cascade;
drop table if exists schedule_entries cascade;
drop table if exists payment_records cascade;
drop table if exists todos cascade;
drop table if exists comment_library cascade;
drop table if exists term_reports cascade;
drop table if exists honors cascade;
drop table if exists activities cascade;
drop table if exists class_meetings cascade;
drop table if exists leader_elections cascade;
drop table if exists class_leaders cascade;
drop table if exists notice_drafts cascade;
drop table if exists parent_meeting_attendees cascade;
drop table if exists parent_meetings cascade;
drop table if exists home_school_contacts cascade;
drop table if exists special_focus_logs cascade;
drop table if exists talks cascade;
drop table if exists mentor_pairs cascade;
drop table if exists study_group_members cascade;
drop table if exists study_groups cascade;
drop table if exists grade_records cascade;
drop table if exists exam_subjects cascade;
drop table if exists exams cascade;
drop table if exists random_pick_logs cascade;
drop table if exists behavior_events cascade;
drop table if exists duty_records cascade;
drop table if exists duty_group_members cascade;
drop table if exists duty_groups cascade;
drop table if exists duty_tasks cascade;
drop table if exists homework_records cascade;
drop table if exists leave_requests cascade;
drop table if exists attendance_records cascade;
drop table if exists attendance_sessions cascade;
drop table if exists seat_history cascade;
drop table if exists seats cascade;
drop table if exists students cascade;
drop table if exists school_classes cascade;
drop table if exists app_settings cascade;
drop table if exists profiles cascade;

drop function if exists set_updated_at cascade;
drop function if exists is_class_owner cascade;
drop function if exists fn_rotate_seats cascade;
drop function if exists fn_generate_seats_by_rules cascade;
drop function if exists fn_rotate_duty cascade;
drop function if exists fn_approve_leave cascade;
drop function if exists fn_finish_leave cascade;
drop function if exists fn_generate_comment cascade;
drop function if exists fn_export_all cascade;

-- ----------------------------------------------------------------------------
-- 1. 用户与设置
-- ----------------------------------------------------------------------------
create table profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  school_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table app_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  current_class_id       uuid,
  current_term           text default '2025秋',
  weekly_backup_reminder boolean not null default true,
  mask_phone             boolean not null default true,
  seating_rows           int  not null default 8,
  seating_cols           int  not null default 7,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. 班级与学生
-- ----------------------------------------------------------------------------
create table school_classes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  name             text not null,                    -- 初一（3）班
  grade            text not null default '初一',     -- 初一/初二/初三
  school_year      text not null default '2025-2026',
  term             text not null default '2025秋',   -- 当前学期
  role             text not null default '班主任'
                   check (role in ('班主任', '任教')),
  subjects         text[] not null default '{}',     -- 跟踪科目（任教班仅语文）
  homeroom_teacher text,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_classes_owner on school_classes (owner_id);
create index idx_classes_owner_archived on school_classes (owner_id, archived);

create table students (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references school_classes (id) on delete cascade,
  student_no        text not null,                   -- 学号（班内唯一）
  name              text not null,
  gender            text check (gender in ('男', '女')),
  birthday          date,
  photo_path        text,                            -- Storage: photos 桶
  address           text,
  guardian_name     text,
  guardian_relation text,
  guardian_phone    text,
  guardian2_name    text,
  guardian2_relation text,
  guardian2_phone   text,
  family_structure  text check (family_structure in ('双亲', '单亲', '留守', '离异', '其他')),
  pickup_person     text,
  is_boarding       boolean not null default false,
  health_notes      text,
  primary_school    text,
  entrance_score    numeric(5,1),
  height_cm         int,                             -- 排座用
  tags              text[] not null default '{}',
  special_level     text not null default '无' check (special_level in ('无', '黄', '红')),
  special_reason    text,
  active            boolean not null default true,   -- 在读/转学
  left_at           date,
  notes             text,
  survey            jsonb,                           -- 新生调查表全量作答（身份证号不入库）
  deleted_at        timestamptz,                     -- 软删除
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index idx_students_no on students (class_id, student_no) where deleted_at is null;
create index idx_students_class on students (class_id);
create index idx_students_class_active on students (class_id, active);
create index idx_students_name on students (class_id, name);
create index idx_students_tags on students using gin (tags);

-- 当前座位
create table seats (
  class_id   uuid not null references school_classes (id) on delete cascade,
  seat_row   int not null,
  seat_col   int not null,
  student_id uuid references students (id) on delete set null,
  locked     boolean not null default false,         -- 锁定不参与轮换
  updated_at timestamptz not null default now(),
  primary key (class_id, seat_row, seat_col)
);
create index idx_seats_class on seats (class_id);

-- 座位历史快照
create table seat_history (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null,
  change_date date not null default current_date,
  student_id  uuid not null,
  seat_row    int not null,
  seat_col    int not null
);
create index idx_seat_history_student on seat_history (student_id, change_date);

-- ----------------------------------------------------------------------------
-- 3. 每日事务：考勤 / 请假 / 作业 / 值日 / 事件
-- ----------------------------------------------------------------------------
create table attendance_sessions (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  name       text not null,                          -- 早读/眼操/课间操/午休/晚自习
  sort_order int not null default 0,
  is_daily   boolean not null default false,         -- true = 每日总考勤模式
  active     boolean not null default true
);
create index idx_att_sessions_class on attendance_sessions (class_id);

create table attendance_records (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null,
  student_id   uuid not null references students (id) on delete cascade,
  date         date not null default current_date,
  session_id   uuid references attendance_sessions (id) on delete cascade, -- NULL=每日总考勤
  status       text not null check (status in ('正常', '迟到', '早退', '病假', '事假', '公假', '旷课')),
  late_minutes int,
  note         text,
  created_at   timestamptz not null default now()
);
-- 节点考勤唯一：同一学生同一节点同一天只有一条
create unique index idx_att_node_unique on attendance_records (class_id, student_id, date, session_id)
  where session_id is not null;
-- 每日总考勤唯一
create unique index idx_att_daily_unique on attendance_records (class_id, student_id, date)
  where session_id is null;
create index idx_att_date on attendance_records (class_id, date);
create index idx_att_student on attendance_records (student_id, date);

create table leave_requests (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null,
  student_id        uuid not null references students (id) on delete cascade,
  leave_type        text not null check (leave_type in ('病假', '事假', '公假')),
  start_date        date not null,
  end_date          date not null,
  reason            text,
  guardian_contacted boolean not null default false,
  status            text not null default '待审批' check (status in ('待审批', '已批准', '已拒绝')),
  approved_at       timestamptz,
  return_date       date,                            -- 销假日期
  note              text,
  created_at        timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_leave_student on leave_requests (student_id, start_date);

create table homework_records (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  date       date not null default current_date,
  subject    text not null,
  hw_type    text not null default '日常',           -- 日常 / 周末 / 寒暑假
  status     text not null default '已交' check (status in ('已交', '未交', '补交', '优秀')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_hw_unique on homework_records (class_id, student_id, date, subject);
create index idx_hw_date on homework_records (class_id, date, subject);

create table duty_tasks (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  name       text not null,
  sort_order int not null default 0
);

create table duty_groups (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  name       text not null,                          -- 第一组…
  sort_order int not null default 0                 -- 轮换顺序，1 = 本周值日组
);

create table duty_group_members (
  group_id   uuid not null references duty_groups (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  class_id   uuid not null,
  primary key (group_id, student_id)
);
create index idx_dgm_class on duty_group_members (class_id);

create table duty_records (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null,
  date        date not null default current_date,
  group_id    uuid references duty_groups (id) on delete set null,
  task_id     uuid references duty_tasks (id) on delete set null, -- NULL=整体
  ok          boolean not null default true,
  issue       text,
  recorded_at timestamptz not null default now()
);
create index idx_duty_date on duty_records (class_id, date);

create table behavior_events (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null,
  student_id        uuid not null references students (id) on delete cascade,
  event_date        date not null default current_date,
  event_type        text not null check (event_type in ('表扬', '违纪', '冲突', '意外', '其他')),
  category          text,                            -- 类别标签：上课说话/助人为乐…
  description       text,
  action_taken      text,                            -- 处理方式
  severity          text check (severity in ('低', '中', '高')),
  guardian_notified boolean not null default false,
  resolved          boolean not null default false,
  follow_up         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_bev_student on behavior_events (student_id, event_date);
create index idx_bev_class_date on behavior_events (class_id, event_date);
create index idx_bev_type on behavior_events (event_type);

-- 随机点名记录（当天不重复）
create table random_pick_logs (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  pick_date  date not null default current_date,
  student_id uuid not null references students (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index idx_pick_unique on random_pick_logs (class_id, pick_date, student_id);

-- ----------------------------------------------------------------------------
-- 4. 学习与成绩
-- ----------------------------------------------------------------------------
create table exams (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  name       text not null,
  exam_type  text not null check (exam_type in ('单元测', '月考', '期中', '期末')),
  exam_date  date not null,
  note       text,
  created_at timestamptz not null default now()
);
create index idx_exams_class on exams (class_id, exam_date);

create table exam_subjects (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references exams (id) on delete cascade,
  class_id   uuid not null,
  subject    text not null,
  full_score numeric(5,1) not null default 100,
  unique (exam_id, subject)
);
create index idx_exs_class on exam_subjects (class_id);

create table grade_records (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references exams (id) on delete cascade,
  class_id   uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  subject    text not null,
  score      numeric(5,1),
  score_detail jsonb,                               -- 可选：语文分项 {基础,阅读,作文}
  is_absent  boolean not null default false,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_grade_unique on grade_records (exam_id, student_id, subject);
create index idx_grade_student on grade_records (student_id, exam_id);

create table study_groups (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  name       text not null,
  group_type text not null check (group_type in ('行政组', '学习组', '值日组'))
);

create table study_group_members (
  group_id   uuid not null references study_groups (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  class_id   uuid not null,
  role       text not null default '组员' check (role in ('组长', '组员')),
  primary key (group_id, student_id)
);
create index idx_sgm_class on study_group_members (class_id);

create table mentor_pairs (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  mentor_id  uuid not null references students (id) on delete cascade,
  mentee_id  uuid not null references students (id) on delete cascade,
  subject    text not null default '语文',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. 德育与成长
-- ----------------------------------------------------------------------------
create table talks (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null,
  student_id       uuid not null references students (id) on delete cascade,
  talk_date        date not null default current_date,
  place            text,
  duration_min     int,
  trigger_type     text check (trigger_type in ('主动约谈', '事件触发', '家长要求', '例行')),
  topic            text,
  key_points       text,
  student_response text,
  follow_up        text,
  follow_up_date   date,
  created_at       timestamptz not null default now()
);
create index idx_talks_student on talks (student_id, talk_date);
create index idx_talks_due on talks (follow_up_date) where follow_up_date is not null;

create table special_focus_logs (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null,
  student_id       uuid not null references students (id) on delete cascade,
  change_date      date not null default current_date,
  level_from       text not null,
  level_to         text not null,
  reason           text,
  next_contact_date date,
  created_at       timestamptz not null default now()
);
create index idx_sfl_student on special_focus_logs (student_id, change_date);

-- ----------------------------------------------------------------------------
-- 6. 家校沟通
-- ----------------------------------------------------------------------------
create table home_school_contacts (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null,
  student_id     uuid not null references students (id) on delete cascade,
  contact_date   date not null default current_date,
  method         text not null check (method in ('电话', '微信', '面谈', '家访', '其他')),
  person         text,
  topic          text,
  summary        text,
  result         text,
  follow_up      text,
  follow_up_date date,
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_hsc_student on home_school_contacts (student_id, contact_date);
create index idx_hsc_due on home_school_contacts (follow_up_date) where follow_up_date is not null;

create table parent_meetings (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references school_classes (id) on delete cascade,
  meeting_date date not null,
  title        text not null,
  agenda       text,
  summary      text,
  created_at   timestamptz not null default now()
);

create table parent_meeting_attendees (
  meeting_id    uuid not null references parent_meetings (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  class_id      uuid not null,
  guardian_name text,
  signed        boolean not null default false,
  primary key (meeting_id, student_id)
);
create index idx_pma_class on parent_meeting_attendees (class_id);

create table notice_drafts (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  title      text not null,
  content    text,
  channel    text check (channel in ('微信群', '钉钉', '纸质', '当面')),
  sent_date  date,
  scope      text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. 组织与活动
-- ----------------------------------------------------------------------------
create table class_leaders (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  role       text not null,                          -- 班长/学习委员…
  term       text not null default '2025秋',
  start_date date,
  end_date   date,
  note       text,
  created_at timestamptz not null default now()
);
create index idx_leaders_class on class_leaders (class_id, term);

create table leader_elections (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null,
  election_date date not null,
  term          text not null,
  positions     jsonb,                               -- {职位: 当选学生id}
  process       text,
  created_at    timestamptz not null default now()
);

create table class_meetings (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references school_classes (id) on delete cascade,
  meeting_date date not null default current_date,
  theme        text not null,
  purpose      text,
  process      text,
  feedback     text,
  created_at   timestamptz not null default now()
);

create table activities (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references school_classes (id) on delete cascade,
  name        text not null,
  act_type    text check (act_type in ('运动会', '文艺汇演', '社会实践', '主题教育', '其他')),
  act_date    date not null,
  description text,
  result      text,
  photo_paths text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table honors (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null,
  student_id  uuid references students (id) on delete cascade, -- NULL=集体荣誉
  honor_date  date not null,
  title       text not null,
  level       text check (level in ('校级', '区级', '市级', '省级', '国家级')),
  source      text,
  created_at  timestamptz not null default now()
);
create index idx_honors_class on honors (class_id, honor_date);

-- ----------------------------------------------------------------------------
-- 8. 期末与系统
-- ----------------------------------------------------------------------------
create table term_reports (
  id                  uuid primary key default gen_random_uuid(),
  class_id            uuid not null,
  student_id          uuid not null references students (id) on delete cascade,
  term                text not null,
  conduct_level       text check (conduct_level in ('优秀', '合格', '不合格')),
  conduct_morality    text check (conduct_morality in ('优', '良', '中', '待合格')),
  conduct_academic    text check (conduct_academic in ('优', '良', '中', '待合格')),
  conduct_health      text check (conduct_health in ('优', '良', '中', '待合格')),
  conduct_labor       text check (conduct_labor in ('优', '良', '中', '待合格')),
  conduct_aesthetic   text check (conduct_aesthetic in ('优', '良', '中', '待合格')),
  comment_draft       text,
  comment_final       text,
  generated_at        timestamptz,
  updated_at          timestamptz not null default now(),
  unique (class_id, student_id, term)
);
create index idx_reports_class on term_reports (class_id, term);

create table comment_library (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text not null check (category in ('优点', '期望', '鼓励', '事例')),
  content    text not null,
  created_at timestamptz not null default now()
);

create table todos (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  title      text not null,
  category   text check (category in ('材料', '缴费', '通知', '其他')),
  due_date   date,
  done       boolean not null default false,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_todos_due on todos (class_id, done, due_date);

create table payment_records (                      -- 缴费登记（关联缴费待办）
  id         uuid primary key default gen_random_uuid(),
  todo_id    uuid not null references todos (id) on delete cascade,
  class_id   uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  paid       boolean not null default false,
  paid_at    date,
  note       text,
  unique (todo_id, student_id)
);
create index idx_pay_class on payment_records (class_id);

-- 课表（周一到周五 × 节次）
create table schedule_entries (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes (id) on delete cascade,
  weekday    int not null check (weekday between 1 and 5),
  period     int not null check (period between 1 and 12),
  subject    text,
  teacher    text,
  subject    text,
  note       text,
  created_at timestamptz not null default now(),
  unique (class_id, weekday, period)
);
create index idx_schedule_class on schedule_entries (class_id, weekday, period);

create table backup_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  backup_date timestamptz not null default now(),
  scope       text,
  note        text
);

-- 导入日志（导入中心）
create table import_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  import_type text not null check (import_type in ('学生名单', '成绩', '座位表', '家长信息', '考勤')),
  file_name   text,
  total_rows  int not null default 0,
  ok_rows     int not null default 0,
  err_rows    int not null default 0,
  errors      jsonb,                                 -- [{row, field, reason}]
  created_at  timestamptz not null default now()
);
create index idx_import_logs_user on import_logs (user_id, created_at desc);

-- 审计日志（敏感操作留痕，只追加：无 update/delete 策略，防篡改）
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  action      text not null,                         -- login/login_failed/view_sensitive/export/import/print/delete/restore/lock_hide
  object_type text,
  object_id   text,                                  -- 目标标识，不存敏感内容本身
  detail      jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index idx_audit_user_time on audit_logs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 9. updated_at 触发器
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create trigger trg_settings_updated before update on app_settings
  for each row execute function set_updated_at();
create trigger trg_classes_updated before update on school_classes
  for each row execute function set_updated_at();
create trigger trg_students_updated before update on students
  for each row execute function set_updated_at();
create trigger trg_seats_updated before update on seats
  for each row execute function set_updated_at();
create trigger trg_hw_updated before update on homework_records
  for each row execute function set_updated_at();
create trigger trg_bev_updated before update on behavior_events
  for each row execute function set_updated_at();
create trigger trg_grades_updated before update on grade_records
  for each row execute function set_updated_at();
create trigger trg_reports_updated before update on term_reports
  for each row execute function set_updated_at();
create trigger trg_todos_updated before update on todos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 10. RLS 行级安全
-- ----------------------------------------------------------------------------
-- 核心鉴权函数：该班级是否属于当前登录用户
create or replace function is_class_owner(cid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from school_classes c
    where c.id = cid and c.owner_id = auth.uid()
  );
$$;

-- 10.1 用户维度表（显式策略）
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (user_id = auth.uid());
create policy "profiles_insert" on profiles for insert with check (user_id = auth.uid());
create policy "profiles_update" on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table app_settings enable row level security;
create policy "settings_select" on app_settings for select using (user_id = auth.uid());
create policy "settings_insert" on app_settings for insert with check (user_id = auth.uid());
create policy "settings_update" on app_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table comment_library enable row level security;
create policy "comment_library_select" on comment_library for select using (user_id = auth.uid());
create policy "comment_library_insert" on comment_library for insert with check (user_id = auth.uid());
create policy "comment_library_update" on comment_library for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comment_library_delete" on comment_library for delete using (user_id = auth.uid());

alter table backup_logs enable row level security;
create policy "backup_logs_select" on backup_logs for select using (user_id = auth.uid());
create policy "backup_logs_insert" on backup_logs for insert with check (user_id = auth.uid());

alter table import_logs enable row level security;
create policy "import_logs_select" on import_logs for select using (user_id = auth.uid());
create policy "import_logs_insert" on import_logs for insert with check (user_id = auth.uid());

-- 审计日志：只允许追加与查看，禁止修改/删除（防篡改）
alter table audit_logs enable row level security;
create policy "audit_logs_select" on audit_logs for select using (user_id = auth.uid());
create policy "audit_logs_insert" on audit_logs for insert with check (user_id = auth.uid());

alter table school_classes enable row level security;
create policy "classes_select" on school_classes for select using (owner_id = auth.uid());
create policy "classes_insert" on school_classes for insert with check (owner_id = auth.uid());
create policy "classes_update" on school_classes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "classes_delete" on school_classes for delete using (owner_id = auth.uid());

-- 10.2 业务表（统一走 is_class_owner(class_id)）
do $$
declare
  t text;
  tables text[] := array[
    'students', 'seats', 'seat_history',
    'attendance_sessions', 'attendance_records', 'leave_requests',
    'homework_records', 'duty_tasks', 'duty_groups', 'duty_group_members', 'duty_records',
    'behavior_events', 'random_pick_logs',
    'exams', 'exam_subjects', 'grade_records',
    'study_groups', 'study_group_members', 'mentor_pairs',
    'talks', 'special_focus_logs',
    'home_school_contacts', 'parent_meetings', 'parent_meeting_attendees', 'notice_drafts',
    'class_leaders', 'leader_elections', 'class_meetings', 'activities', 'honors',
    'term_reports', 'todos', 'payment_records', 'schedule_entries'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_class_owner(class_id))', t || '_select', t);
    execute format('create policy %I on %I for insert with check (is_class_owner(class_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (is_class_owner(class_id)) with check (is_class_owner(class_id))', t || '_update', t);
    execute format('create policy %I on %I for delete using (is_class_owner(class_id))', t || '_delete', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 11. 统计视图（实时计算）
-- ----------------------------------------------------------------------------
-- 每月出勤统计
create or replace view v_attendance_monthly as
select
  class_id, student_id,
  to_char(date, 'YYYY-MM') as month,
  count(*) filter (where status = '迟到') as late_cnt,
  count(*) filter (where status = '早退') as early_cnt,
  count(*) filter (where status = '旷课') as absent_cnt,
  count(*) filter (where status in ('病假', '事假', '公假')) as leave_cnt
from attendance_records
group by class_id, student_id, to_char(date, 'YYYY-MM');

-- 每周作业未交统计
create or replace view v_homework_missed as
select
  class_id, student_id,
  date_trunc('week', date) as week_start,
  count(*) filter (where status = '未交') as missed_cnt,
  count(*) filter (where status = '优秀') as excellent_cnt
from homework_records
group by class_id, student_id, date_trunc('week', date);

-- 考试统计（均分/最高/最低/优秀率≥90%/及格率≥60%/分数段）
create or replace view v_exam_stats as
select
  e.id as exam_id, e.name as exam_name, e.exam_date, e.class_id,
  es.subject, es.full_score,
  count(g.id) as student_count,
  round(avg(g.score), 1) as avg_score,
  percentile_cont(0.5) within group (order by g.score) as median_score,
  max(g.score) as max_score,
  min(g.score) as min_score,
  round(stddev(g.score), 1) as stddev_score,
  round(100.0 * count(*) filter (where g.score >= es.full_score * 0.9) / nullif(count(g.id), 0), 1) as excellent_rate,
  round(100.0 * count(*) filter (where g.score >= es.full_score * 0.6) / nullif(count(g.id), 0), 1) as pass_rate,
  count(*) filter (where g.score < es.full_score * 0.6) as s_below60,
  count(*) filter (where g.score >= es.full_score * 0.6 and g.score < es.full_score * 0.7) as s_60_69,
  count(*) filter (where g.score >= es.full_score * 0.7 and g.score < es.full_score * 0.8) as s_70_79,
  count(*) filter (where g.score >= es.full_score * 0.8 and g.score < es.full_score * 0.9) as s_80_89,
  count(*) filter (where g.score >= es.full_score * 0.9) as s_90_plus
from exams e
join exam_subjects es on es.exam_id = e.id
left join grade_records g on g.exam_id = e.id and g.subject = es.subject and not g.is_absent
group by e.id, es.id, es.subject, es.full_score;

-- 学生各次考试折合均分与名次变化
create or replace view v_student_progress as
with per_exam as (
  select
    g.student_id, e.id as exam_id, e.exam_date,
    round(avg(g.score / es.full_score * 100), 1) as pct
  from grade_records g
  join exam_subjects es on es.exam_id = g.exam_id and es.subject = g.subject
  join exams e on e.id = g.exam_id
  where not g.is_absent
  group by g.student_id, e.id, e.exam_date
),
ranked as (
  select student_id, exam_id, exam_date, pct,
    rank() over (partition by exam_id order by pct desc) as rnk
  from per_exam
)
select student_id, exam_id, exam_date, pct, rnk,
  lag(rnk) over (partition by student_id order by exam_date) as prev_rnk,
  lag(rnk) over (partition by student_id order by exam_date) - rnk as rank_delta
from ranked;

-- 偏科预警（单科折合分低于个人均分 ≥15 分）
create or replace view v_student_subject_gaps as
with latest_date as (
  select class_id, max(exam_date) as d from exams group by class_id
),
latest as (
  select g.class_id, g.student_id, g.subject, g.score, es.full_score
  from grade_records g
  join exam_subjects es on es.exam_id = g.exam_id and es.subject = g.subject
  join exams e on e.id = g.exam_id
  join latest_date ld on ld.class_id = e.class_id and e.exam_date = ld.d
  where not g.is_absent
),
pct as (
  select class_id, student_id, subject,
    round(score / full_score * 100, 1) as pct,
    round(avg(score / full_score * 100) over (partition by student_id), 1) as avg_pct
  from latest
)
select class_id, student_id, subject, pct, avg_pct,
  round(avg_pct - pct, 1) as gap
from pct
where avg_pct - pct >= 15;

-- 历次考试班级总折合均分（走势图）
create or replace view v_class_trend as
with per_exam as (
  select g.class_id, e.id as exam_id, e.exam_date,
    round(avg(g.score / es.full_score * 100), 1) as pct
  from grade_records g
  join exam_subjects es on es.exam_id = g.exam_id and es.subject = g.subject
  join exams e on e.id = g.exam_id
  where not g.is_absent
  group by g.class_id, e.id, e.exam_date
)
select class_id, exam_id, exam_date, round(avg(pct), 1) as class_avg
from per_exam
group by class_id, exam_id, exam_date
order by exam_date;

-- 最新考试：每生各科折合百分 + 班级均分（雷达图数据）
create or replace view v_student_radar as
with latest as (
  select class_id, max(exam_date) as d from exams group by class_id
),
scores as (
  select g.class_id, g.student_id, g.subject,
    round(g.score / es.full_score * 100, 1) as pct
  from grade_records g
  join exam_subjects es on es.exam_id = g.exam_id and es.subject = g.subject
  join exams e on e.id = g.exam_id
  join latest l on l.class_id = e.class_id and e.exam_date = l.d
  where not g.is_absent
)
select class_id, student_id, subject, pct,
  round(avg(pct) over (partition by class_id, subject), 1) as class_pct
from scores;

-- 到期提醒（谈话/联系/待办）
create or replace view v_due_reminders as
select '谈话跟进' as kind, class_id, student_id, follow_up_date as due_date, follow_up as detail
from talks where follow_up_date is not null and follow_up_date < current_date
union all
select '联系跟进', class_id, student_id, follow_up_date, follow_up
from home_school_contacts where follow_up_date is not null and follow_up_date <= current_date
union all
select '待办', class_id, null::uuid, due_date, title
from todos where not done and due_date <= current_date;

-- 学生成长时间线（聚合各模块记录）
create or replace view v_growth_timeline as
select class_id, student_id, date as ts, '考勤' as kind, status as title, note as detail
from attendance_records where status <> '正常'
union all
select class_id, student_id, date, '作业', status, note
from homework_records where status in ('未交', '优秀')
union all
select class_id, student_id, event_date, '事件', event_type, description
from behavior_events
union all
select class_id, student_id, talk_date, '谈话', topic, key_points
from talks
union all
select class_id, student_id, contact_date, '家校', topic, summary
from home_school_contacts
union all
select class_id, student_id, honor_date, '荣誉', title, source
from honors
union all
select g.class_id, g.student_id, e.exam_date, '成绩', g.subject, g.score::text
from grade_records g
join exams e on e.id = g.exam_id;

-- ----------------------------------------------------------------------------
-- 12. 业务函数
-- ----------------------------------------------------------------------------
-- 12.1 座位轮换（行列位移），锁定座位除外
create or replace function fn_rotate_seats(p_class uuid, p_steps int default 1)
returns int
language plpgsql
security definer
as $$
declare
  v_rows int; v_cols int; v_placed int := 0;
  v_rec record; v_tr int; v_tc int; v_tr2 int; v_tc2 int; v_found boolean;
begin
  select max(seat_row), max(seat_col) into v_rows, v_cols
  from seats where class_id = p_class;
  if v_rows is null or v_cols is null then return 0; end if;

  -- 同一天重复调用时先清掉当日快照，避免重复
  delete from seat_history where class_id = p_class and change_date = current_date;

  -- 记录当前快照
  insert into seat_history (class_id, change_date, student_id, seat_row, seat_col)
  select class_id, current_date, student_id, seat_row, seat_col
  from seats where class_id = p_class and student_id is not null;

  -- 清空非锁定座位
  update seats set student_id = null
  where class_id = p_class and student_id is not null and not locked;

  -- 按位移回填
  for v_rec in
    select student_id, seat_row, seat_col
    from seat_history
    where class_id = p_class and change_date = current_date
    order by seat_row, seat_col
  loop
    v_tr := ((v_rec.seat_row - 1 + p_steps) % v_rows) + 1;
    v_tc := ((v_rec.seat_col - 1 + p_steps) % v_cols) + 1;
    v_found := false;

    if exists (select 1 from seats s
               where s.class_id = p_class and s.seat_row = v_tr and s.seat_col = v_tc
                 and s.student_id is null and not s.locked) then
      update seats set student_id = v_rec.student_id
      where class_id = p_class and seat_row = v_tr and seat_col = v_tc;
      v_found := true;
    else
      -- 目标被锁定座位占用：就近找空闲非锁定位
      select s.seat_row, s.seat_col into v_tr2, v_tc2
      from seats s
      where s.class_id = p_class and s.student_id is null and not s.locked
      order by abs(s.seat_row - v_tr) + abs(s.seat_col - v_tc), s.seat_row, s.seat_col
      limit 1;
      if found then
        update seats set student_id = v_rec.student_id
        where class_id = p_class and seat_row = v_tr2 and seat_col = v_tc2;
        v_found := true;
      end if;
    end if;
    if v_found then v_placed := v_placed + 1; end if;
  end loop;
  return v_placed;
end;
$$;

-- 12.2 规则排座：p_sort_by = height | score | random；p_alternate_gender 男女交替
create or replace function fn_generate_seats_by_rules(
  p_class uuid,
  p_sort_by text default 'height',
  p_alternate_gender boolean default true
)
returns int
language plpgsql
security definer
as $$
declare
  v_rows int; v_cols int; v_placed int := 0;
  v_sid uuid; v_idx int := 0; v_r int; v_c int; v_done boolean := false;
begin
  select max(seat_row), max(seat_col) into v_rows, v_cols
  from seats where class_id = p_class;
  if v_rows is null or v_cols is null then return 0; end if;

  create temp table if not exists tmp_stu (seq int, sid uuid, gender text) on commit drop;
  truncate tmp_stu;

  if p_sort_by = 'height' then
    insert into tmp_stu (seq, sid, gender)
    select row_number() over (order by height_cm desc nulls last, name), id, gender
    from students
    where class_id = p_class and active and deleted_at is null;
  elsif p_sort_by = 'score' then
    with latest_exam_date as (
      select max(exam_date) as d from exams where class_id = p_class
    )
    insert into tmp_stu (seq, sid, gender)
    select row_number() over (order by r.pct desc nulls last), st.id, st.gender
    from students st
    left join (
      select gr.student_id, round(avg(gr.score / es.full_score * 100), 1) as pct
      from grade_records gr
      join exam_subjects es on es.exam_id = gr.exam_id and es.subject = gr.subject
      join exams e on e.id = gr.exam_id
      join latest_exam_date l on e.exam_date = l.d
      group by gr.student_id
    ) r on r.student_id = st.id
    where st.class_id = p_class and st.active and st.deleted_at is null;
  else
    insert into tmp_stu (seq, sid, gender)
    select row_number() over (order by random()), id, gender
    from students
    where class_id = p_class and active and deleted_at is null;
  end if;

  -- 男女交替（男1,女1,男2,女2…）
  if p_alternate_gender then
    update tmp_stu t set seq = g.new_seq
    from (
      select sid, row_number() over (order by gseq, grp) as new_seq
      from (
        select sid,
          row_number() over (partition by gender order by seq) as gseq,
          case when gender = '男' then 1 else 2 end as grp
        from tmp_stu
      ) x
    ) g
    where t.sid = g.sid;
  end if;

  -- 清空非锁定座位
  update seats set student_id = null
  where class_id = p_class and not locked;

  -- 逐格填充（行优先）
  for v_r in 1..v_rows loop
    for v_c in 1..v_cols loop
      if exists (select 1 from seats s
                 where s.class_id = p_class and s.seat_row = v_r and s.seat_col = v_c and s.locked) then
        continue;
      end if;
      select sid into v_sid from tmp_stu where seq = v_idx + 1;
      if not found then
        v_done := true;
        exit;
      end if;
      v_idx := v_idx + 1;
      update seats set student_id = v_sid
      where class_id = p_class and seat_row = v_r and seat_col = v_c;
      v_placed := v_placed + 1;
    end loop;
    exit when v_done;
  end loop;

  drop table if exists tmp_stu;
  return v_placed;
end;
$$;

-- 12.3 值日组周轮换（sort_order=1 者为本周值日组）
create or replace function fn_rotate_duty(p_class uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_n int;
begin
  select count(*) into v_n from duty_groups where class_id = p_class;
  if v_n = 0 then return 0; end if;
  update duty_groups
  set sort_order = case when sort_order = 1 then v_n else sort_order - 1 end
  where class_id = p_class;
  return v_n;
end;
$$;

-- 12.4 批准请假 → 自动生成考勤记录
create or replace function fn_approve_leave(p_leave uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_l leave_requests%rowtype;
  v_d date; v_count int := 0;
begin
  select * into v_l from leave_requests where id = p_leave;
  if not found or v_l.status = '已批准' then return 0; end if;

  update leave_requests set status = '已批准', approved_at = now() where id = p_leave;

  v_d := v_l.start_date;
  while v_d <= v_l.end_date loop
    insert into attendance_records (class_id, student_id, date, session_id, status, note)
    values (v_l.class_id, v_l.student_id, v_d, null, v_l.leave_type, '请假单自动生成')
    on conflict do nothing;
    v_count := v_count + 1;
    v_d := v_d + interval '1 day';
  end loop;
  return v_count;
end;
$$;

-- 12.5 销假
create or replace function fn_finish_leave(p_leave uuid, p_return date default current_date)
returns void
language plpgsql
security definer
as $$
begin
  update leave_requests set return_date = p_return where id = p_leave;
end;
$$;

-- 12.6 评语草稿（聚合记录生成，v2 可接 LLM 优化）
create or replace function fn_generate_comment(p_student uuid, p_term text)
returns text
language plpgsql
security definer
as $$
declare
  v_name text; v_praise int; v_violation int; v_late int; v_absent int;
  v_missed int; v_exam uuid; v_best text; v_worst text; v_text text := '';
begin
  select name into v_name from students where id = p_student;
  if not found then return '（学生不存在）'; end if;

  select count(*) into v_praise from behavior_events
  where student_id = p_student and event_type = '表扬';
  select count(*) into v_violation from behavior_events
  where student_id = p_student and event_type in ('违纪', '冲突');
  select count(*) into v_late from attendance_records
  where student_id = p_student and status = '迟到';
  select count(*) into v_absent from attendance_records
  where student_id = p_student and status = '旷课';
  select count(*) into v_missed from homework_records
  where student_id = p_student and status = '未交';

  select e.id into v_exam from exams e
  join grade_records g on g.exam_id = e.id
  where g.student_id = p_student
  order by e.exam_date desc limit 1;

  if v_exam is not null then
    select gs.subject into v_best from grade_records gs
    join exam_subjects es on es.exam_id = gs.exam_id and es.subject = gs.subject
    where gs.exam_id = v_exam and gs.student_id = p_student and not gs.is_absent
    order by (gs.score / es.full_score * 100) desc limit 1;
    select gs.subject into v_worst from grade_records gs
    join exam_subjects es on es.exam_id = gs.exam_id and es.subject = gs.subject
    where gs.exam_id = v_exam and gs.student_id = p_student and not gs.is_absent
    order by (gs.score / es.full_score * 100) asc limit 1;
  end if;

  if v_praise > 0 then
    v_text := v_text || format('%s同学本学期表现积极，共获表扬 %s 次，是班级的正能量。', v_name, v_praise);
  end if;
  if v_best is not null then
    v_text := v_text || format('学习上，%s 学科是你的优势科目，请继续保持。', v_best);
  end if;
  if v_late = 0 and v_absent = 0 then
    v_text := v_text || '本学期出勤良好，从未迟到旷课，非常自律。';
  else
    v_text := v_text || format('本学期迟到 %s 次、旷课 %s 次，希望下学期加强时间观念。', v_late, v_absent);
  end if;
  if v_missed > 0 then
    v_text := v_text || format('作业方面有 %s 次未交记录，请养成按时完成作业的习惯。', v_missed);
  end if;
  if v_violation > 0 then
    v_text := v_text || format('本学期发生 %s 次违纪/冲突事件，望深刻反思、改进不足。', v_violation);
  end if;
  if v_worst is not null then
    v_text := v_text || format('在 %s 学科上还有提升空间，建议多向老师同学请教。', v_worst);
  end if;
  v_text := v_text || '老师相信你下学期会取得更大的进步，加油！';

  return v_text;
end;
$$;

-- 12.7 全量备份导出（JSON）
create or replace function fn_export_all(p_user uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'classes', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from school_classes where owner_id = p_user) t), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(t)) from (select s.* from students s join school_classes c on c.id = s.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(to_jsonb(t)) from (select s.* from seats s join school_classes c on c.id = s.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'seat_history', coalesce((select jsonb_agg(to_jsonb(t)) from (select s.* from seat_history s join school_classes c on c.id = s.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'attendance_records', coalesce((select jsonb_agg(to_jsonb(t)) from (select a.* from attendance_records a join school_classes c on c.id = a.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'attendance_sessions', coalesce((select jsonb_agg(to_jsonb(t)) from (select a.* from attendance_sessions a join school_classes c on c.id = a.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'leave_requests', coalesce((select jsonb_agg(to_jsonb(t)) from (select l.* from leave_requests l join school_classes c on c.id = l.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'homework_records', coalesce((select jsonb_agg(to_jsonb(t)) from (select h.* from homework_records h join school_classes c on c.id = h.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'behavior_events', coalesce((select jsonb_agg(to_jsonb(t)) from (select b.* from behavior_events b join school_classes c on c.id = b.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'talks', coalesce((select jsonb_agg(to_jsonb(t)) from (select t.* from talks t join school_classes c on c.id = t.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(t)) from (select h.* from home_school_contacts h join school_classes c on c.id = h.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(to_jsonb(t)) from (select e.* from exams e join school_classes c on c.id = e.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'grade_records', coalesce((select jsonb_agg(to_jsonb(t)) from (select g.* from grade_records g join school_classes c on c.id = g.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'term_reports', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from term_reports r join school_classes c on c.id = r.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'honors', coalesce((select jsonb_agg(to_jsonb(t)) from (select h.* from honors h join school_classes c on c.id = h.class_id where c.owner_id = p_user) t), '[]'::jsonb),
    'todos', coalesce((select jsonb_agg(to_jsonb(t)) from (select t.* from todos t join school_classes c on c.id = t.class_id where c.owner_id = p_user) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. 示例数据（可选，首次使用可执行；正式使用时删除以下内容）
-- ----------------------------------------------------------------------------
-- insert into profiles (user_id, display_name, school_name)
-- values (auth.uid(), '张老师', '某某中学');
--
-- insert into school_classes (owner_id, name, grade, school_year, term, role, subjects)
-- values (auth.uid(), '初一（3）班', '初一', '2025-2026', '2025秋', '班主任',
--         array['语文','数学','英语','政治','历史','地理','生物']);
--
-- insert into attendance_sessions (class_id, name, sort_order)
-- select id, name, ord from school_classes,
--   unnest(array['早读','眼操','课间操','午休','晚自习']) with ordinality as t(name, ord)
-- where owner_id = auth.uid();

commit;

-- 新生重点关注学生汇总（含家庭结构）：可编辑分组台账
create table if not exists focus_summary_notes (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references school_classes (id) on delete cascade,
  student_name     text not null,
  gender           text,
  family_structure text,
  category         text not null,
  detail           text,
  advice           text,
  created_at       timestamptz not null default now()
);
create index idx_fsn_class on focus_summary_notes (class_id, category);
alter table focus_summary_notes enable row level security;
create policy focus_summary_notes_select on focus_summary_notes for select using (is_class_owner(class_id));
create policy focus_summary_notes_insert on focus_summary_notes for insert with check (is_class_owner(class_id));
create policy focus_summary_notes_update on focus_summary_notes for update using (is_class_owner(class_id)) with check (is_class_owner(class_id));
create policy focus_summary_notes_delete on focus_summary_notes for delete using (is_class_owner(class_id));
