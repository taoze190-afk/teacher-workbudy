'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { getSupabase, isSupabaseConfigured, audit } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo';
import { NAV, NAV_GROUPS, DEFAULT_SUBJECTS, DUTY_TASK_PRESET } from '@/lib/constants';
import type { AppSettings, SchoolClass } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Loading, Modal, Select } from '@/components/ui';
import CommandPalette from '@/components/CommandPalette';

interface ClassCtx {
  classes: SchoolClass[];
  currentClass: SchoolClass | null;
  currentClassId: string | null;
  settings: AppSettings | null;
  setCurrentClassId: (id: string) => void;
  refresh: () => void;
}

const Ctx = createContext<ClassCtx>({
  classes: [],
  currentClass: null,
  currentClassId: null,
  settings: null,
  setCurrentClassId: () => {},
  refresh: () => {},
});

export const useClass = () => useContext(Ctx);

const MOBILE_TABS = [
  { href: '/dashboard', label: '看板', icon: LayoutDashboard },
  { href: '/students', label: '学生', icon: Users },
  { href: '/attendance', label: '考勤', icon: CalendarCheck },
  { href: '/grades', label: '成绩', icon: LineChart },
];

/* ---------- 实时时钟（独立组件：秒级刷新只重渲染自身，避免整页 DOM 重建导致点击丢失）
   顶部只留「周X HH:MM」这类核心信息，完整日期放到 hover 提示里，降低信息噪音 ---------- */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  const short = `周${'日一二三四五六'[now.getDay()]} ${p(now.getHours())}:${p(now.getMinutes())}`;
  const full = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} 星期${
    '日一二三四五六'[now.getDay()]
  } ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  return (
    <div
      title={full}
      className="hidden items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium tabular-nums text-slate-300 lg:flex"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      {short}
    </div>
  );
}

/* ---------- 通用下拉（点击外部关闭） ---------- */
function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);
  return ref;
}

/* ---------- 班级切换器 ---------- */
function ClassSwitcher({
  classes,
  currentClassId,
  onChange,
  onEdit,
  onCreate,
}: {
  classes: SchoolClass[];
  currentClassId: string | null;
  onChange: (id: string) => void;
  onEdit: () => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(open, close);
  const cur = classes.find((c) => c.id === currentClassId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/15 py-1.5 pl-2.5 pr-2 text-sm font-bold text-brand-200 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-500/25"
        title={`当前班级：${cur?.name ?? '未选择'}（点击切换）`}
      >
        <span className="text-sm">🏫</span>
        <span className="max-w-[88px] truncate sm:max-w-[150px]">{cur?.name ?? '选择班级'}</span>
        {cur?.role === '任教' && (
          <span className="hidden rounded bg-brand-500/25 px-1.5 py-0.5 text-[10px] font-medium text-brand-200 sm:inline">
            任教
          </span>
        )}
        <ChevronDown size={14} className={cn('text-brand-200/80 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800 p-1.5 shadow-float">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            我的班级
          </div>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c.id);
                close();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                c.id === currentClassId ? 'bg-brand-500/15 text-brand-300' : 'text-slate-500 hover:bg-slate-800/60'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-[11px] text-slate-400">
                  {c.school_year} {c.term} · {c.role === '班主任' ? '班主任' : '任课教师'}
                </div>
              </div>
              {c.id === currentClassId && <Check size={15} className="shrink-0 text-brand-300" />}
            </button>
          ))}
          <div className="my-1 h-px bg-slate-700/60" />
          {cur && (
            <button
              onClick={() => {
                onEdit();
                close();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-slate-800/60"
            >
              <Pencil size={14} className="text-slate-400" /> 编辑当前班级
            </button>
          )}
          <button
            onClick={() => {
              onCreate();
              close();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-brand-300 transition-colors hover:bg-brand-500/15"
          >
            <Plus size={14} /> 新建班级
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- 用户菜单 ---------- */
function UserMenu({
  email,
  onLogout,
  demo,
}: {
  email: string;
  onLogout: () => void;
  demo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(open, close);
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
        title={email}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800 p-1.5 shadow-float">
          <div className="truncate px-2.5 py-1.5 text-xs text-slate-400">{email}</div>
          {demo && (
            <div className="mx-2.5 mb-1.5 rounded-lg bg-brand-500/15 px-2 py-1 text-[11px] font-medium text-brand-300">
              演示模式 · 示例数据
            </div>
          )}
          <Link
            href="/security"
            onClick={close}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-800/60"
          >
            <ShieldCheck size={15} className="text-slate-400" /> 安全中心
          </Link>
          <Link
            href="/settings"
            onClick={close}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-800/60"
          >
            <Settings size={15} className="text-slate-400" /> 设置
          </Link>
          <div className="my-1 h-px bg-slate-700/60" />
          <button
            onClick={() => {
              close();
              onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-rose-500 transition-colors hover:bg-rose-500/10"
          >
            <LogOut size={15} /> {demo ? '退出演示模式' : '退出登录'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const rawPathname = usePathname();
  // 静态导出配了 trailingSlash，usePathname() 会带结尾斜杠（/dashboard/），
  // 不归一化的话任何精确比较都匹配不上，左侧导航会完全没有高亮
  const pathname = rawPathname && rawPathname !== '/' ? rawPathname.replace(/\/+$/, '') : rawPathname || '';
  const [status, setStatus] = useState<'loading' | 'in' | 'out' | 'noconfig'>('loading');
  const [userEmail, setUserEmail] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentClassId, setCurrentClassIdState] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCls, setEditCls] = useState<SchoolClass | null>(null);
  const [clsForm, setClsForm] = useState({
    name: '',
    grade: '初一',
    term: '2025秋',
    role: '班主任',
    teacher: '',
    subjects: [...DEFAULT_SUBJECTS],
  });
  const [tick, setTick] = useState(0);
  const [demo, setDemo] = useState(false);

  // 任教班：只保留「成绩 + 系统」模块（任课老师不需要班级日常管理功能）
  const currentClass = classes.find((c) => c.id === currentClassId) ?? null;
  const isRenjiao = currentClass?.role === '任教';
  const navGroups = isRenjiao ? ['成绩', '系统'] : NAV_GROUPS;
  const routeAllowed =
    !isRenjiao ||
    NAV.filter((n) => navGroups.includes(n.group)).some((n) =>
      n.href === '/dashboard' ? pathname === n.href : pathname.startsWith(n.href)
    );
  // 任教班下访问受限页面 → 自动跳转成绩页
  useEffect(() => {
    if (status === 'in' && !routeAllowed) {
      router.replace('/grades');
    }
  }, [status, routeAllowed, router]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // 全站只保留浅色主题：始终挂上 light 类（深色/跟随时间已移除）
  useEffect(() => {
    document.documentElement.classList.add('light');
  }, []);

  useEffect(() => {
    setDemo(isDemoMode());
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus('noconfig');
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setStatus('out');
        return;
      }
      setUserEmail(data.session.user.email ?? '');
      setStatus('in');
    });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      if (!session) {
        setStatus('out');
      } else {
        setUserEmail(session.user.email ?? '');
        setStatus('in');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status !== 'in') return;
    const sb = getSupabase();
    (async () => {
      const [{ data: cls }, { data: st }] = await Promise.all([
        sb.from('school_classes').select('*').eq('archived', false).order('created_at'),
        sb.from('app_settings').select('*').single(),
      ]);
      setClasses(cls ?? []);
      setSettings(st ?? null);
    })();
  }, [status, tick]);

  useEffect(() => {
    if (classes.length === 0) return;
    const saved = localStorage.getItem('bzh_current_class');
    if (saved && classes.some((c) => c.id === saved)) {
      setCurrentClassIdState(saved);
    } else if (settings?.current_class_id && classes.some((c) => c.id === settings.current_class_id)) {
      setCurrentClassIdState(settings.current_class_id);
    } else {
      setCurrentClassIdState(classes[0].id);
    }
  }, [classes, settings]);

  const setCurrentClassId = useCallback((id: string) => {
    localStorage.setItem('bzh_current_class', id);
    setCurrentClassIdState(id);
  }, []);

  // 全局快捷键：Ctrl/⌘+K 打开命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 路由切换时保持滚动位置（等待内容渲染稳定后再恢复，避免回顶）
  useEffect(() => {
    const key = `bzh_scroll_${pathname}`;
    const saved = Number(sessionStorage.getItem(key) ?? '0');
    const restore = () => window.scrollTo(0, saved);
    const t1 = setTimeout(restore, 120);
    const t2 = setTimeout(restore, 500);
    const savePos = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener('scroll', savePos, { passive: true });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('scroll', savePos);
    };
  }, [pathname]);

  const schoolYearOf = (term: string) => {
    const m = term.match(/^(\d{4})(秋|春)$/);
    if (!m) return '';
    const y = Number(m[1]);
    return m[2] === '秋' ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  };

  const createClass = async () => {
    if (!clsForm.name.trim()) {
      alert('请填写班级名称，如「初一（3）班」');
      return;
    }
    if (clsForm.subjects.length === 0) {
      alert('请至少勾选一门跟踪科目（任教老师勾你自己教的科目即可）');
      return;
    }
    const sb = getSupabase();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const payload = {
      name: clsForm.name.trim(),
      grade: clsForm.grade,
      school_year: schoolYearOf(clsForm.term),
      term: clsForm.term,
      role: clsForm.role,
      subjects: clsForm.subjects,
      homeroom_teacher: clsForm.teacher.trim() || null,
    };
    let clsId: string | undefined;
    if (editCls) {
      const { error } = await sb.from('school_classes').update(payload).eq('id', editCls.id);
      if (error) {
        alert('保存失败：' + error.message);
        return;
      }
      clsId = editCls.id;
      await audit('update', 'school_class', editCls.id, { name: payload.name });
    } else {
      const { data, error } = await sb
        .from('school_classes')
        .insert({ ...payload, owner_id: u.user.id })
        .select()
        .single();
      if (error) {
        alert('创建失败：' + error.message);
        return;
      }
      clsId = data.id;
      // 附带默认考勤节点与值日任务，开箱即用
      await sb
        .from('attendance_sessions')
        .insert(['早读', '眼操', '课间操', '午休', '晚自习'].map((n, i) => ({ class_id: data.id, name: n, sort_order: i + 1 })));
      await sb.from('duty_tasks').insert(
        DUTY_TASK_PRESET.map((n, i) => ({ class_id: data.id, name: n, sort_order: i + 1 }))
      );
      await audit('insert', 'school_class', data.id, { name: payload.name });
    }
    setCreateOpen(false);
    setEditCls(null);
    setClsForm({ name: '', grade: '初一', term: '2025秋', role: '班主任', teacher: '', subjects: [...DEFAULT_SUBJECTS] });
    if (clsId) localStorage.setItem('bzh_current_class', clsId);
    refresh();
  };

  const openEdit = (c: SchoolClass) => {
    setEditCls(c);
    setClsForm({
      name: c.name,
      grade: c.grade,
      term: c.term,
      role: c.role,
      teacher: c.homeroom_teacher ?? '',
      subjects: [...(c.subjects ?? DEFAULT_SUBJECTS)],
    });
    setCreateOpen(true);
  };

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (status === 'noconfig') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="max-w-lg rounded-3xl border border-slate-700/60 bg-slate-800 p-8 text-center shadow-float">
          <div className="mb-3 text-5xl">🔧</div>
          <h1 className="mb-2 text-lg font-bold text-slate-100">数据层初始化失败</h1>
          <p className="text-sm leading-6 text-slate-400">
            本地存储（IndexedDB）不可用或被浏览器禁用。请检查浏览器是否开启了站点数据/隐私模式，
            然后刷新页面重试。
          </p>
        </div>
      </div>
    );
  }

  if (status === 'out') {
    if (pathname !== '/login') {
      router.replace('/login');
    }
    return <>{children}</>;
  }

  const active = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const logout = async () => {
    await getSupabase().auth.signOut();
    router.replace('/login');
  };

  const renderNav = (onClick?: () => void) => (
    <nav>
      {navGroups.map((group) => {
        const items = NAV.filter((n) => n.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="mb-3">
            <div className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-slate-500">
              {group}
            </div>
            {items.map((n) => {
              const Icon = n.icon;
              const isActive = active(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-500/15 font-medium text-brand-300'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  )}
                >
                  <Icon size={17} className={cn(isActive ? 'text-brand-400' : 'text-slate-400')} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <Ctx.Provider
      value={{ classes, currentClass, currentClassId, settings, setCurrentClassId, refresh }}
    >
      <div className="min-h-screen pb-16 lg:pb-0">
        {/* 顶部栏 */}
        <header className="no-print app-topbar sticky top-0 z-30 bg-slate-800/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-700/60 lg:hidden"
              onClick={() => setDrawer(true)}
            >
              <Menu size={20} />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
                <GraduationCap size={17} />
              </div>
              <div className="hidden text-[15px] font-semibold tracking-tight text-slate-100 sm:block">
                班主任工作台
              </div>
              {demo && (
                <span className="hidden rounded-full border border-brand-500/40 bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-300 sm:inline-block">
                  演示数据
                </span>
              )}
            </Link>

            {/* 全局搜索 / 命令面板 */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="mx-2 hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 py-1.5 pl-2.5 pr-2 text-xs text-slate-400 transition-colors hover:border-brand-500 hover:text-slate-300 md:flex"
            >
              <Search size={13} />
              搜索学生、跳转页面…
              <span className="ml-6 flex gap-0.5">
                <kbd className="rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                  Ctrl
                </kbd>
                <kbd className="rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                  K
                </kbd>
              </span>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-700/60 md:hidden"
              title="搜索"
            >
              <Search size={18} />
            </button>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {/* 实时时间（独立组件，秒级刷新不拖累页面） */}
              <LiveClock />
              {classes.length > 0 ? (
                <ClassSwitcher
                  classes={classes}
                  currentClassId={currentClassId}
                  onChange={setCurrentClassId}
                  onEdit={() => currentClass && openEdit(currentClass)}
                  onCreate={() => setCreateOpen(true)}
                />
              ) : (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> 创建班级
                </Button>
              )}
              <UserMenu email={userEmail} onLogout={logout} demo={demo} />
            </div>
          </div>
        </header>

        <div className="flex">
          {/* 桌面侧边栏 */}
          {/* 侧栏用背景色差（比内容区深）与内容分层，不画竖线 ——
              竖线与顶栏的横线会在左上角交汇成"T"形，把版面切成三块 */}
          <aside className="no-print sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[13.5rem] shrink-0 overflow-y-auto bg-slate-900/50 px-2.5 py-3 lg:block">
            {renderNav()}
            <div className="mt-2 rounded-xl bg-slate-800/60 p-3 text-[11px] leading-5 text-slate-400">
              💡 按 <span className="font-semibold text-slate-400">Ctrl + K</span> 可快速跳转任意页面或搜索学生
            </div>
          </aside>

          {/* 主内容 */}
          <main className="min-w-0 flex-1 p-3 sm:p-4">
            {/* 内容区放宽到 1500px：原来 max-w-6xl(1152px) 居中，屏幕一宽
                侧栏与正文之间就会空出一大块，显得版面松散 */}
            <div className="page-enter mx-auto max-w-[1500px]">
              {classes.length === 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-brand-500/15 p-3 text-sm text-brand-300">
                  <span>👋 还没有班级——先创建班级，才能导入学生和记录数据</span>
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus size={14} /> 创建班级
                  </Button>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>

        {/* 移动端底部导航 */}
        <nav className="no-print app-bottombar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-slate-800/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE_TABS.filter((t) => !isRenjiao || navGroups.some((g) => NAV.some((n) => n.group === g && n.href === t.href))).map((t) => {
            const isActive = active(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px]"
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                    isActive ? 'bg-brand-500/25 text-brand-200' : 'text-slate-400'
                  )}
                >
                  <Icon size={19} />
                </span>
                <span className={cn('font-medium', isActive ? 'text-brand-200' : 'text-slate-400')}>
                  {t.label}
                </span>
              </Link>
            );
          })}
          <button className="flex flex-col items-center gap-0.5 py-2 text-[11px]" onClick={() => setDrawer(true)}>
            <span className="flex h-7 w-12 items-center justify-center rounded-full text-slate-400">
              <Menu size={19} />
            </span>
            <span className="font-medium text-slate-400">更多</span>
          </button>
        </nav>

        {/* 移动端抽屉导航 */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="backdrop-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-slate-800 p-4 shadow-float">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
                    <GraduationCap size={15} />
                  </div>
                  <span className="font-bold text-slate-100">全部功能</span>
                </div>
                <button
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-700/60"
                  onClick={() => setDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
              {renderNav(() => setDrawer(false))}
            </div>
          </div>
        )}

        {/* 命令面板 */}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        {/* 创建/编辑班级弹窗 */}
        <Modal
          open={createOpen}
          title={editCls ? `编辑班级：${editCls.name}` : '创建班级'}
          onClose={() => {
            setCreateOpen(false);
            setEditCls(null);
          }}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditCls(null);
                }}
              >
                取消
              </Button>
              <Button onClick={createClass}>{editCls ? '保存修改' : '创建'}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="班级名称" required>
              <Input
                value={clsForm.name}
                onChange={(e) => setClsForm({ ...clsForm, name: e.target.value })}
                placeholder="如：初一（3）班"
              />
            </Field>
            <Field label="你的称呼" hint="显示在班级信息和评语页脚，如：张老师">
              <Input
                value={clsForm.teacher}
                onChange={(e) => setClsForm({ ...clsForm, teacher: e.target.value })}
                placeholder="如：张老师"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="年级">
                <Select value={clsForm.grade} onChange={(e) => setClsForm({ ...clsForm, grade: e.target.value })}>
                  <option value="初一">初一</option>
                  <option value="初二">初二</option>
                  <option value="初三">初三</option>
                </Select>
              </Field>
              <Field label="学期" hint="可直接输入自定义学期">
                <Input
                  list="term-options"
                  value={clsForm.term}
                  onChange={(e) => setClsForm({ ...clsForm, term: e.target.value })}
                  placeholder="如 2025秋"
                />
                <datalist id="term-options">
                  <option value="2025秋" />
                  <option value="2026春" />
                  <option value="2026秋" />
                  <option value="2027春" />
                </datalist>
              </Field>
              <Field label="角色">
                <Select value={clsForm.role} onChange={(e) => setClsForm({ ...clsForm, role: e.target.value })}>
                  <option value="班主任">班主任</option>
                  <option value="任教">任教</option>
                </Select>
              </Field>
            </div>
            <Field label="跟踪科目" hint="班主任班可全选；任教班只勾任教科目（如语文）。创建后会自动配好考勤节点和值日任务">
              <div className="flex flex-wrap gap-2">
                {DEFAULT_SUBJECTS.map((s) => (
                  <label
                    key={s}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm transition-colors',
                      clsForm.subjects.includes(s)
                        ? 'border-brand-400 bg-brand-500/15 font-medium text-brand-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={clsForm.subjects.includes(s)}
                      onChange={(e) =>
                        setClsForm((p) => ({
                          ...p,
                          subjects: e.target.checked ? [...p.subjects, s] : p.subjects.filter((x) => x !== s),
                        }))
                      }
                      className="accent-brand-500"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      </div>
    </Ctx.Provider>
  );
}
