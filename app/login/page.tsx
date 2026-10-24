'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  GraduationCap,
  LineChart,
  PlayCircle,
  Printer,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { getSupabase, audit } from '@/lib/supabase';
import { getLocalAccount, createLocalAccount } from '@/lib/local';
import { Button, ErrorBox, Field, Input, Loading } from '@/components/ui';
import { cn } from '@/lib/utils';

const FEATURES = [
  { icon: CalendarCheck, chip: 'bg-amber-500/15 text-amber-300', title: '每日事务，一点即记', desc: '考勤 / 作业 / 值日 / 点名，为碎片时间设计' },
  { icon: LineChart, chip: 'bg-emerald-500/15 text-emerald-300', title: '成绩分析，一眼看懂', desc: '录入即出图表，临界生、偏科自动预警' },
  { icon: Printer, chip: 'bg-violet-500/15 text-violet-300', title: '打印中心，对接学校', desc: '成绩条 / 值日表 / 签到表，A4 一键打印' },
  { icon: ShieldCheck, chip: 'bg-blue-500/15 text-blue-300', title: '数据私有，仅你可见', desc: '数据全部存在本机浏览器 + 每周加密备份' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('bzh_demo') === '1') {
      router.replace('/dashboard');
      return;
    }
    (async () => {
      const account = await getLocalAccount();
      setHasAccount(Boolean(account));
      if (account) {
        // 已初始化：检查本机登录态
        const { data } = await getSupabase().auth.getSession();
        if (data.session) {
          router.replace('/dashboard');
          return;
        }
        setEmail(account.email);
      }
      setChecking(false);
    })();
  }, [router]);

  const enterDemo = () => {
    localStorage.setItem('bzh_demo', '1');
    router.replace('/dashboard');
  };

  // 首次使用：创建本机账号并进入系统
  const initAccount = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('请设置用户名和密码');
      return;
    }
    if (password.length < 8) {
      setError('密码至少 8 位（建议含大小写字母与数字）');
      return;
    }
    if (password !== password2) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await createLocalAccount(email.trim(), password);
      await audit('login', 'auth', 'local_init');
      router.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  const signIn = async () => {
    setError('');
    if (!email || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        await audit('login_failed', 'auth', email);
        throw error;
      }
      await audit('login', 'auth', email);
      router.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  if (checking || hasAccount === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f172a]">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/60 shadow-float backdrop-blur md:grid-cols-[1.1fr_1fr]">
          {/* 品牌面板 */}
          <div className="hidden flex-col justify-between border-r border-slate-700/60 bg-slate-900/40 p-10 md:flex">
            <div>
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
                  <GraduationCap size={22} />
                </div>
                <div>
                  <div className="text-lg font-semibold tracking-tight text-slate-100">班主任工作台</div>
                  <div className="text-xs text-slate-400">属于你自己的带班系统</div>
                </div>
              </div>
              <div className="space-y-5">
                {FEATURES.map(({ icon: Icon, chip, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', chip)}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-200">{title}</div>
                      <div className="mt-0.5 text-xs leading-5 text-slate-400">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs text-slate-500">
              <Smartphone size={14} />
              手机 / iPad / 电脑 三端适配，添加到主屏幕即可当 App 用
            </div>
          </div>

          {/* 表单面板 */}
          <div className="p-7 sm:p-10">
            <div className="mb-6 flex items-center gap-2.5 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
                <GraduationCap size={20} />
              </div>
              <div>
                <div className="text-lg font-extrabold text-slate-100">班主任工作台</div>
                <div className="text-xs text-slate-400">属于你自己的带班系统</div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-100">
              {hasAccount ? '欢迎回来' : '初始化本机账号'}
            </h2>
            <p className="mb-6 mt-1 text-sm text-slate-400">
              {hasAccount
                ? '数据保存在本机浏览器中，输入账号密码继续'
                : '首次使用：设置一个本机账号（仅存在这台设备的浏览器里，用于锁住你的数据）'}
            </p>

            <div className="space-y-4">
              <Field label={hasAccount ? '用户名' : '设置用户名'} required>
                <Input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="例如：laoshi"
                  autoComplete="username"
                  disabled={hasAccount}
                />
              </Field>
              <Field label={hasAccount ? '密码' : '设置密码'} required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={hasAccount ? 'current-password' : 'new-password'}
                  onKeyDown={(e) => e.key === 'Enter' && (hasAccount ? signIn() : initAccount())}
                />
              </Field>
              {!hasAccount && (
                <Field label="确认密码" required>
                  <Input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    onKeyDown={(e) => e.key === 'Enter' && initAccount()}
                  />
                </Field>
              )}
              {error && <ErrorBox message={error} />}
              <Button className="w-full" size="lg" disabled={loading} onClick={hasAccount ? signIn : initAccount}>
                {loading ? '请稍候…' : hasAccount ? '登录' : '创建并进入系统'}
              </Button>
              <div className="flex items-center justify-end text-xs">
                <button
                  onClick={enterDemo}
                  className="flex items-center gap-1 font-medium text-brand-300 transition-colors hover:text-brand-200"
                >
                  <PlayCircle size={14} /> 演示模式（示例数据）
                </button>
              </div>
            </div>

            <p className="mt-8 border-t border-slate-700/60 pt-4 text-[11px] leading-5 text-slate-500">
              数据只保存在本机浏览器（IndexedDB），不上传任何服务器；更换设备请用安全中心的加密备份迁移。
              演示模式使用内置示例数据，不会写入你的真实数据。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
