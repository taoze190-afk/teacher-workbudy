import {
  LayoutDashboard,
  Users,
  Armchair,
  CalendarCheck,
  Brush,
  NotebookPen,
  Dices,
  ListChecks,
  MessageCircle,
  AlertTriangle,
  ClipboardList,
  LineChart,
  Users2,
  Phone,
  UsersRound,
  Medal,
  Megaphone,
  BookOpen,
  BookOpenText,
  Presentation,
  Upload,
  Printer,
  ShieldCheck,
  Settings,
  CalendarRange,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: '今日看板', icon: LayoutDashboard, group: '今日' },
  { href: '/students', label: '学生档案', icon: Users, group: '班级' },
  { href: '/seating', label: '座位', icon: Armchair, group: '班级' },
  { href: '/schedule', label: '我的课表', icon: CalendarRange, group: '班级' },
  { href: '/attendance', label: '考勤', icon: CalendarCheck, group: '日常' },
  { href: '/duty', label: '值日', icon: Brush, group: '日常' },
  { href: '/homework', label: '作业', icon: NotebookPen, group: '日常' },
  { href: '/tools', label: '课堂工具', icon: Dices, group: '日常' },
  { href: '/events', label: '事件台账', icon: ListChecks, group: '日常' },
  { href: '/talks', label: '谈心谈话', icon: MessageCircle, group: '成长' },
  { href: '/focus', label: '重点关注', icon: AlertTriangle, group: '成长' },
  { href: '/focus-summary', label: '重点学生汇总', icon: ClipboardList, group: '成长' },
  { href: '/contacts', label: '家校联系', icon: Phone, group: '成长' },
  { href: '/meetings', label: '家长会', icon: UsersRound, group: '成长' },
  { href: '/leaders', label: '班委', icon: Medal, group: '成长' },
  { href: '/activities', label: '活动', icon: Megaphone, group: '成长' },
  { href: '/exams', label: '考试管理', icon: ClipboardList, group: '成绩' },
  { href: '/grades', label: '成绩分析', icon: LineChart, group: '成绩' },
  { href: '/groups', label: '学习小组', icon: Users2, group: '成绩' },
  { href: '/reports', label: '评语', icon: BookOpen, group: '成绩' },
  { href: '/lesson-prep', label: '备课教案', icon: BookOpenText, group: '成绩' },
  { href: '/classroom', label: '课堂', icon: Presentation, group: '成绩' },
  { href: '/import', label: '导入中心', icon: Upload, group: '系统' },
  { href: '/print', label: '打印中心', icon: Printer, group: '系统' },
  { href: '/security', label: '安全中心', icon: ShieldCheck, group: '系统' },
  { href: '/settings', label: '设置', icon: Settings, group: '系统' },
];

export const NAV_GROUPS = ['今日', '班级', '日常', '成长', '成绩', '系统'];

export const ATTENDANCE_STATUSES = ['正常', '迟到', '早退', '病假', '事假', '公假', '旷课'] as const;

export const ATTENDANCE_STATUS_COLOR: Record<string, string> = {
  正常: 'bg-green-500/15 text-green-300',
  迟到: 'bg-yellow-500/15 text-yellow-300',
  早退: 'bg-orange-500/15 text-orange-300',
  病假: 'bg-blue-500/15 text-blue-300',
  事假: 'bg-indigo-500/15 text-indigo-300',
  公假: 'bg-slate-500/15 text-slate-400',
  旷课: 'bg-red-500/15 text-red-300',
};

export const DEFAULT_SUBJECTS = ['语文', '数学', '英语', '政治', '历史', '地理', '生物'];

/**
 * 新建考试时各科的默认满分。
 * 初一阶段语文 / 数学 / 英语通常为 120 分（示例成绩表里数学 105、语文 119 即为此），
 * 其余科目 100 分。定错满分会让及格率、优秀率和折合对比全部算错，所以这里给出正确默认值，
 * 老师仍可在新建考试时逐科修改。
 */
export const DEFAULT_FULL_SCORE: Record<string, string> = {
  语文: '120',
  数学: '120',
  英语: '120',
};
export const DEFAULT_FULL_SCORE_FALLBACK = '100';

export const EVENT_TYPES = ['表扬', '违纪', '冲突', '意外', '其他'] as const;

export const EVENT_TYPE_COLOR: Record<string, string> = {
  表扬: 'bg-green-500/15 text-green-300',
  违纪: 'bg-orange-500/15 text-orange-300',
  冲突: 'bg-red-500/15 text-red-300',
  意外: 'bg-yellow-500/15 text-yellow-300',
  其他: 'bg-slate-500/15 text-slate-400',
};

export const SPECIAL_LEVEL_COLOR: Record<string, string> = {
  无: 'bg-slate-500/15 text-slate-400',
  黄: 'bg-yellow-500/15 text-yellow-300',
  红: 'bg-red-500/15 text-red-300',
};

export const CONTACT_METHODS = ['电话', '微信', '面谈', '家访', '其他'] as const;

export const EXAM_TYPES = ['单元测', '月考', '期中', '期末'] as const;

export const FAMILY_STRUCTURES = ['双亲', '单亲', '留守', '离异', '其他'] as const;

export const DUTY_TASK_PRESET = [
  '扫地（教室、走廊、小阳台）',
  '拖地（教室、走廊、小阳台）',
  '擦窗户和瓷砖',
  '倒垃圾、清洗垃圾桶',
  '擦黑板、整理讲台、写课表',
];

export const DUTY_GROUP_PRESET = ['第一组', '第二组', '第三组', '第四组', '第五组', '第六组', '第七组'];

// 示例分工数据（全部为虚构名单）：任务 → 七个组的人员姓名
// 值日页「按模板预填」会用它铺底，导入真实学生后请重新调整
export const DUTY_PRESET_MATRIX: Record<string, string[][]> = {
  '扫地（教室、走廊、小阳台）': [
    ['苏婉清', '陈志远'],
    ['林浩宇', '葛雨桐'],
    ['丁诗琪', '周子墨'],
    ['吴俊杰', '叶紫涵'],
    ['程可馨', '郑博文'],
    ['严语嫣', '冯天佑'],
    ['蒋明轩', '江静怡'],
  ],
  '拖地（教室、走廊、小阳台）': [
    ['方雅芝', '韩立诚'],
    ['曹俊熙', '白若曦'],
    ['雷欣妍', '谢东升'],
    ['邹文杰', '陶慧敏'],
    ['顾晓萱', '石嘉树'],
    ['沈梦瑶', '廖俊驰'],
    ['贺宇航', '汪芷若'],
  ],
  '擦窗户和瓷砖': [['蔡佳琪'], ['董欣怡'], ['樊晓东'], ['邢雅静'], ['邱一凡'], ['姜文博'], ['全艺菲']],
  '倒垃圾、清洗垃圾桶': [['崔明浩'], ['潘雨欣'], ['余子豪'], ['杜诗涵'], ['侯晨曦'], ['白书瑶'], []],
};

// 值日时间（按班级值日表）
export const DUTY_TIME_NOTES = [
  '值日生：早读之前、每节课前、放学之前',
  '值日组：一日三扫（早上 7:20 前、中午 12:50 前、晚上 18:00 前），劳动委员定时检查',
];

// 值日要求
export const DUTY_STUDENT_RULES = ['黑板擦干净（一日三洗）', '讲台物品摆放整齐', '重写课表和值日信息'];
export const DUTY_GROUP_RULES = [
  '扫、拖教室过道、小阳台、走廊',
  '地面、走廊无垃圾',
  '水池要干净',
  '瓷砖、窗户无污渍',
  '垃圾桶清空（一日三倒）',
  '劳动工具摆放整齐',
];

// 郑重提醒
export const DUTY_REMINDERS = [
  '值日生按照学号每天轮换，值日组每周轮换，劳动委员每天都要定时提醒当天值日和值日组同学',
  '劳动委员在打扫结束后进行检查，没有打扫干净的区域找对应同学继续打扫，若当天卫生不过关全组加扫一天',
  '全体同学晚上放学后将凳子搬到桌面上，桌椅摆放整齐，带走座位垃圾',
  '非打扫时间请自己负责自己座位周边卫生，随机检查',
  '教室是我家，文明靠大家，希望大家自觉遵守，营造健康、干净、温馨的学习和生活环境',
];

export const FOCUS_SUMMARY_CATEGORIES = ['健康安全', '心理行为', '家庭经济', '睡眠问题', '家长诉求'] as const;

export const LEADER_ROLES = [
  '班长',
  '副班长',
  '学习委员',
  '纪律委员',
  '卫生委员',
  '体育委员',
  '文艺委员',
  '宣传委员',
  '语文课代表',
  '数学课代表',
  '英语课代表',
];

// 活力多彩·分区风：每个模块的色彩身份（完整类名写死，供 Tailwind JIT 收集）
export interface ModuleColor {
  chip: string; // 图标底+色
  text: string; // 文字色
  soft: string; // 浅底（激活态/标题点）
  solid: string; // 实色（激活图标底）
  ring: string; // 边框强调
}

export const MODULE_COLOR: Record<string, ModuleColor> = {
  '/dashboard': { chip: 'bg-violet-500/15 text-violet-300', text: 'text-violet-300', soft: 'bg-violet-500/10', solid: 'bg-violet-500', ring: 'ring-violet-500/30' },
  '/students': { chip: 'bg-blue-500/15 text-blue-300', text: 'text-blue-300', soft: 'bg-blue-500/10', solid: 'bg-blue-500', ring: 'ring-blue-500/30' },
  '/seating': { chip: 'bg-cyan-500/15 text-cyan-300', text: 'text-cyan-300', soft: 'bg-cyan-500/10', solid: 'bg-cyan-500', ring: 'ring-cyan-500/30' },
  '/schedule': { chip: 'bg-orange-500/15 text-orange-300', text: 'text-orange-300', soft: 'bg-orange-500/10', solid: 'bg-orange-500', ring: 'ring-orange-500/30' },
  '/attendance': { chip: 'bg-amber-500/15 text-amber-300', text: 'text-amber-300', soft: 'bg-amber-500/10', solid: 'bg-amber-500', ring: 'ring-amber-500/30' },
  '/duty': { chip: 'bg-lime-500/15 text-lime-300', text: 'text-lime-300', soft: 'bg-lime-500/10', solid: 'bg-lime-500', ring: 'ring-lime-500/30' },
  '/homework': { chip: 'bg-orange-500/15 text-orange-300', text: 'text-orange-300', soft: 'bg-orange-500/10', solid: 'bg-orange-500', ring: 'ring-orange-500/30' },
  '/tools': { chip: 'bg-fuchsia-500/15 text-fuchsia-300', text: 'text-fuchsia-300', soft: 'bg-fuchsia-500/10', solid: 'bg-fuchsia-500', ring: 'ring-fuchsia-500/30' },
  '/events': { chip: 'bg-red-500/15 text-red-300', text: 'text-red-300', soft: 'bg-red-500/10', solid: 'bg-red-500', ring: 'ring-red-500/30' },
  '/talks': { chip: 'bg-teal-500/15 text-teal-300', text: 'text-teal-300', soft: 'bg-teal-500/10', solid: 'bg-teal-500', ring: 'ring-teal-500/30' },
  '/focus-summary': { chip: 'bg-rose-500/15 text-rose-300', text: 'text-rose-300', soft: 'bg-rose-500/10', solid: 'bg-rose-500', ring: 'ring-rose-500/30' },
  '/focus': { chip: 'bg-rose-500/15 text-rose-300', text: 'text-rose-300', soft: 'bg-rose-500/10', solid: 'bg-rose-500', ring: 'ring-rose-500/30' },
  '/exams': { chip: 'bg-indigo-500/15 text-indigo-300', text: 'text-indigo-300', soft: 'bg-indigo-500/10', solid: 'bg-indigo-500', ring: 'ring-indigo-500/30' },
  '/grades': { chip: 'bg-emerald-500/15 text-emerald-300', text: 'text-emerald-300', soft: 'bg-emerald-500/10', solid: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
  '/groups': { chip: 'bg-sky-500/15 text-sky-300', text: 'text-sky-300', soft: 'bg-sky-500/10', solid: 'bg-sky-500', ring: 'ring-sky-500/30' },
  '/contacts': { chip: 'bg-cyan-500/15 text-cyan-300', text: 'text-cyan-300', soft: 'bg-cyan-500/10', solid: 'bg-cyan-500', ring: 'ring-cyan-500/30' },
  '/meetings': { chip: 'bg-violet-500/15 text-violet-300', text: 'text-violet-300', soft: 'bg-violet-500/10', solid: 'bg-violet-500', ring: 'ring-violet-500/30' },
  '/leaders': { chip: 'bg-amber-500/15 text-amber-300', text: 'text-amber-300', soft: 'bg-amber-500/10', solid: 'bg-amber-500', ring: 'ring-amber-500/30' },
  '/activities': { chip: 'bg-pink-500/15 text-pink-300', text: 'text-pink-300', soft: 'bg-pink-500/10', solid: 'bg-pink-500', ring: 'ring-pink-500/30' },
  '/reports': { chip: 'bg-green-500/15 text-green-300', text: 'text-green-300', soft: 'bg-green-500/10', solid: 'bg-green-500', ring: 'ring-green-500/30' },
  '/lesson-prep': { chip: 'bg-indigo-500/15 text-indigo-300', text: 'text-indigo-300', soft: 'bg-indigo-500/10', solid: 'bg-indigo-500', ring: 'ring-indigo-500/30' },
  '/classroom': { chip: 'bg-teal-500/15 text-teal-300', text: 'text-teal-300', soft: 'bg-teal-500/10', solid: 'bg-teal-500', ring: 'ring-teal-500/30' },
  '/import': { chip: 'bg-blue-500/15 text-blue-300', text: 'text-blue-300', soft: 'bg-blue-500/10', solid: 'bg-blue-500', ring: 'ring-blue-500/30' },
  '/print': { chip: 'bg-purple-500/15 text-purple-300', text: 'text-purple-300', soft: 'bg-purple-500/10', solid: 'bg-purple-500', ring: 'ring-purple-500/30' },
  '/security': { chip: 'bg-slate-500/15 text-slate-300', text: 'text-slate-300', soft: 'bg-slate-500/10', solid: 'bg-slate-500', ring: 'ring-slate-500/30' },
  '/settings': { chip: 'bg-gray-500/15 text-gray-300', text: 'text-gray-300', soft: 'bg-gray-500/10', solid: 'bg-gray-500', ring: 'ring-gray-500/30' },
};

export function moduleColorOf(pathname: string): ModuleColor {
  return (
    MODULE_COLOR[pathname] ??
    MODULE_COLOR[`/${pathname.split('/')[1]}`] ??
    MODULE_COLOR['/dashboard']
  );
}
