'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  ArrowRight,
  BookOpenCheck,
  Brush,
  CalendarRange,
  Dices,
  Search,
} from 'lucide-react';
import { NAV, NAV_GROUPS } from '@/lib/constants';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui';
import { useClass } from '@/components/AppShell';
import type { LucideIcon } from 'lucide-react';

interface Item {
  key: string;
  label: string;
  sub?: string;
  group: string; // 分组标题
  href: string;
  icon?: LucideIcon;
  emoji?: string;
  chip?: string; // 图标底色
}

const QUICK_ACTIONS: Item[] = [
  { key: 'q-attendance', label: '记今日考勤', group: '快捷操作', href: '/attendance', icon: AlarmClock, chip: 'bg-amber-500/15 text-amber-300' },
  { key: 'q-homework', label: '登记作业', group: '快捷操作', href: '/homework', icon: BookOpenCheck, chip: 'bg-orange-500/15 text-orange-300' },
  { key: 'q-tools', label: '随机点名', group: '快捷操作', href: '/tools', icon: Dices, chip: 'bg-fuchsia-500/15 text-fuchsia-300' },
  { key: 'q-duty', label: '值日检查', group: '快捷操作', href: '/duty', icon: Brush, chip: 'bg-lime-500/15 text-lime-300' },
  { key: 'q-schedule', label: '我的课表', group: '快捷操作', href: '/schedule', icon: CalendarRange, chip: 'bg-cyan-500/15 text-cyan-300' },
];

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { currentClassId, currentClass } = useClass();
  // 任教班：命令面板只出现「成绩 + 系统」相关入口
  const isRenjiao = currentClass?.role === '任教';
  const navGroups = isRenjiao ? ['成绩', '系统'] : NAV_GROUPS;
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string; student_no: string | null }[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 打开时拉取学生（用于搜学生直达档案）
  useEffect(() => {
    if (!open || !currentClassId) return;
    setQ('');
    setIdx(0);
    getSupabase()
      .from('students')
      .select('id,name,student_no')
      .eq('class_id', currentClassId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('student_no')
      .limit(300)
      .then(({ data }) => setStudents((data ?? []) as typeof students));
  }, [open, currentClassId]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = navGroups.flatMap((g) =>
      NAV.filter((n) => n.group === g).map((n) => ({
        key: n.href,
        label: n.label,
        sub: g,
        group: '页面',
        href: n.href,
        icon: n.icon,
      }))
    );
    const stu: Item[] = students.map((s) => ({
      key: `s-${s.id}`,
      label: s.name,
      sub: s.student_no ?? undefined,
      group: '学生',
      href: `/students/detail?id=${s.id}`,
      emoji: '🎓',
      chip: 'bg-blue-500/15 text-blue-300',
    }));
    const query = q.trim().toLowerCase();
    if (isRenjiao) {
      return query ? pages.filter((it) => it.label.toLowerCase().includes(query)) : pages;
    }
    if (!query) {
      return [...QUICK_ACTIONS, ...pages];
    }
    const match = (it: Item) =>
      it.label.toLowerCase().includes(query) || (it.sub ?? '').toLowerCase().includes(query);
    return [
      ...QUICK_ACTIONS.filter(match),
      ...pages.filter(match),
      ...stu.filter(match).slice(0, 8),
    ];
  }, [q, students]);

  // 过滤后收敛选中项
  useEffect(() => setIdx(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[idx];
        if (it) {
          onClose();
          router.push(it.href);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items, idx, onClose, router]);

  useEffect(() => {
    itemRefs.current[idx]?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  if (!open) return null;

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[10vh]">
      <div className="backdrop-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="modal-panel relative z-10 w-full max-w-xl overflow-hidden rounded-2xl bg-slate-800 shadow-float">
        <div className="flex items-center gap-2.5 border-b border-slate-700/60 px-4 py-3">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索学生、跳转页面或执行快捷操作…"
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {items.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">没有匹配的结果</div>
          )}
          {items.map((it, i) => {
            const showGroup = it.group !== lastGroup;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <React.Fragment key={it.key}>
                {showGroup && (
                  <div className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {it.group}
                  </div>
                )}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => {
                    onClose();
                    router.push(it.href);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                    i === idx ? 'bg-brand-500/15' : ''
                  )}
                >
                  {Icon ? (
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', it.chip ?? 'bg-slate-700/60 text-slate-400')}>
                      <Icon size={16} />
                    </span>
                  ) : (
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base', it.chip ?? 'bg-slate-700/60')}>
                      {it.emoji ?? '📄'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', i === idx ? 'font-medium text-slate-100' : 'text-slate-500')}>
                      {it.label}
                    </span>
                  </span>
                  {it.sub && <span className="shrink-0 text-[11px] text-slate-500">{it.sub}</span>}
                  <ArrowRight size={13} className={cn('shrink-0', i === idx ? 'text-brand-400' : 'text-transparent')} />
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-slate-700/60 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> 选择</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> 打开</span>
          <span className="ml-auto">共 {items.length} 项</span>
        </div>
      </div>
    </div>
  );
}
