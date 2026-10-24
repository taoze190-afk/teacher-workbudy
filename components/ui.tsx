'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { moduleColorOf } from '@/lib/constants';

/* ---------- Spinner / Loading ---------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-8 w-8 animate-spin rounded-full border-[3px] border-brand-500/40 border-t-brand-500',
        className
      )}
    />
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner />
      <div className="text-sm">{text}</div>
    </div>
  );
}

/* ---------- Button ---------- */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  // 主按钮：纯色实心（DeepSeek 不用渐变），hover 只加深一档
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-slate-700/60 text-slate-100 hover:bg-slate-700 active:bg-slate-600',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  // 幽灵按钮：平时无底，hover 才浮出浅底
  ghost: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
  // 描边按钮：透明底 + 细边，hover 变品牌色
  outline:
    'border border-slate-700 bg-transparent text-slate-300 hover:border-brand-500 hover:text-brand-400',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className
      )}
      {...props}
    />
  );
}

/* ---------- Card ---------- */
export function Card({
  className,
  children,
  accent,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  accent?: string; // 左侧细指示条
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-slate-700/70 bg-slate-800 shadow-card',
        className
      )}
    >
      {accent && <div className={cn('absolute inset-y-0 left-0 w-1 rounded-l-2xl', accent)} />}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

export function CardTitle({
  children,
  right,
  dot,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  dot?: string; // 彩色圆点（如 'bg-violet-500'）
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}
        {children}
      </h3>
      {right}
    </div>
  );
}

/* ---------- Form controls ---------- */
export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, 'min-h-[80px]', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, 'cursor-pointer', props.className)} />;
}

/* ---------- Badge ---------- */
export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}
    >
      {children}
    </span>
  );
}

/* ---------- Segmented（分段选择器） ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-700/60 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
            value === o.value
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Kbd ---------- */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400">
      {children}
    </kbd>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // portal 到 body：即使页面外层带 transform（动画等），弹窗也始终相对视口定位
  if (!open) return null;
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="backdrop-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          // 标题与关闭按钮固定在顶部、底部操作区固定，仅内容滚动——长内容不会把关闭按钮顶出视野
          'modal-panel relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-slate-800 shadow-float sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/60 px-5 pb-3 pt-4">
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            title="关闭（Esc）"
            className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700/60 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Confirm ---------- */
export function Confirm({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            确认
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-500">{message}</p>
    </Modal>
  );
}

/* ---------- Empty ---------- */
export function Empty({
  text = '暂无数据',
  emoji = '📭',
  action,
  compact,
}: {
  text?: string;
  emoji?: string;
  /** 空状态的主操作：直接放在提示语下方，缩短鼠标移动距离 */
  action?: React.ReactNode;
  /** 紧凑模式：用于卡片内的局部空态，避免占掉半屏高度 */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'py-5' : 'py-9'
      )}
    >
      <div className={compact ? 'text-2xl' : 'text-3xl'}>{emoji}</div>
      <div className={cn('max-w-sm leading-6 text-slate-400', compact ? 'text-xs' : 'text-sm')}>{text}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* ---------- Error ---------- */
export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
      {message}
    </div>
  );
}

/* ---------- StatCard（可点击统计卡）
   去零化：预警类卡片在数值为 0 时收敛为「正常」的安静样式，
   只有大于 0 才用暖色高亮 + 更大字号 + 呼吸点抢占注意力 ---------- */
const TONE_TEXT: Record<string, string> = {
  red: 'text-red-300',
  amber: 'text-amber-300',
  brand: 'text-brand-300',
  green: 'text-emerald-300',
  slate: 'text-slate-100',
  violet: 'text-violet-300',
  blue: 'text-blue-300',
};

const TONE_ALARM: Record<string, { card: string; dot: string }> = {
  red: { card: 'border-red-500/40 bg-red-500/[0.07]', dot: 'bg-red-400' },
  amber: { card: 'border-amber-500/40 bg-amber-500/[0.07]', dot: 'bg-amber-400' },
  brand: { card: 'border-brand-500/40 bg-brand-500/[0.07]', dot: 'bg-brand-400' },
  blue: { card: 'border-blue-500/40 bg-blue-500/[0.07]', dot: 'bg-blue-400' },
  violet: { card: 'border-violet-500/40 bg-violet-500/[0.07]', dot: 'bg-violet-400' },
  green: { card: 'border-emerald-500/40 bg-emerald-500/[0.07]', dot: 'bg-emerald-400' },
  slate: { card: 'border-slate-500/40 bg-slate-500/[0.07]', dot: 'bg-slate-400' },
};

export function StatCard({
  label,
  value,
  hint,
  zeroHint,
  tone = 'slate',
  warn,
  href,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** 数值为 0 时展示的替代说明（如「今日全员正常」） */
  zeroHint?: string;
  tone?: keyof typeof TONE_TEXT;
  /** 预警类卡片：0 时弱化，>0 时高亮 */
  warn?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const zero = Number(value) === 0;
  const alarm = Boolean(warn) && !zero;
  const calm = Boolean(warn) && zero;
  const tip = zero ? zeroHint ?? hint : hint;

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'font-bold tracking-tight tabular-nums',
            alarm ? 'text-[1.75rem] leading-8' : 'text-2xl leading-8',
            alarm || !zero ? TONE_TEXT[tone] : 'text-slate-500'
          )}
        >
          {value}
        </div>
        {alarm && <span className={cn('h-1.5 w-1.5 animate-pulse rounded-full', TONE_ALARM[tone].dot)} />}
      </div>
      <div className={cn('mt-1 text-sm', alarm ? 'font-semibold text-slate-100' : 'font-medium text-slate-300')}>
        {label}
      </div>
      {tip && (
        <div className={cn('mt-0.5 text-xs', calm ? 'font-medium text-emerald-400/90' : 'text-slate-400')}>
          {calm ? `✅ ${tip}` : tip}
        </div>
      )}
    </>
  );
  const cls = cn(
    'group block rounded-2xl border p-4 text-left shadow-card transition-all',
    alarm
      ? TONE_ALARM[tone].card
      : calm
        ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
        : 'border-slate-700/70 bg-slate-800',
    (href || onClick) && 'hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-cardhover'
  );
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  return (
    <div className={cls} onClick={onClick} role={onClick ? 'button' : undefined}>
      {inner}
    </div>
  );
}

/* ---------- PageHeader（统一控制栏：模块色图标 + 标题 + 说明 + 主操作同一水平线） ---------- */
export function PageHeader({
  emoji,
  title,
  subtitle,
  color,
  children,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  color?: { chip: string; soft: string; text: string } | null;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  // 兼容既有调用：color 参数保留，但不再用它渲染彩色方块（DeepSeek 风格页头不做色块装饰）
  void color;
  void moduleColorOf;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 truncate text-xl font-semibold tracking-tight text-slate-100">
          <span aria-hidden className="text-base opacity-60">
            {emoji}
          </span>
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>}
      </div>
      {/* 页头右侧的操作按钮不参与打印 */}
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
