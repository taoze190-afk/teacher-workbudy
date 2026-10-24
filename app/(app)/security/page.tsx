'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { encryptBackup } from '@/lib/crypto';
import { useToast } from '@/components/Toast';
import type { AuditLog } from '@/lib/types';
import { Badge, Button, Card, CardTitle, Confirm, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const ACTION_LABEL: Record<string, string> = {
  login: '登录',
  login_failed: '登录失败',
  view_sensitive: '查看敏感页',
  export: '导出',
  import: '导入',
  print: '打印',
  delete: '删除',
  restore: '恢复备份',
  lock_hide: '一键隐藏',
  insert: '新增',
  update: '更新',
  generate_comment: '生成评语',
  approve_leave: '批准请假',
  rotate: '轮换',
};

export default function SecurityPage() {
  const { currentClassId } = useClass();
  const router = useRouter();
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupOpen, setBackupOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [pin, setPin] = useState('');
  const [pinSet, setPinSet] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // 修改密码
  const changePassword = async () => {
    setPwdMsg('');
    if (newPwd.length < 8) {
      setPwdMsg('密码至少 8 位（建议含大小写字母与数字）');
      return;
    }
    if (newPwd !== newPwd2) {
      setPwdMsg('两次输入的密码不一致');
      return;
    }
    setPwdBusy(true);
    const { error } = await getSupabase().auth.updateUser({ password: newPwd });
    setPwdBusy(false);
    if (error) {
      setPwdMsg('修改失败：' + error.message);
      return;
    }
    await audit('update', 'auth', 'password_change');
    setPwdOpen(false);
    setNewPwd('');
    setNewPwd2('');
    toast('密码已修改，请用新密码登录');
  };

  // 退出所有设备
  const signOutAll = async () => {
    await audit('delete', 'auth', 'signout_all');
    await getSupabase().auth.signOut({ scope: 'global' });
    router.replace('/login');
  };

  useEffect(() => {
    setPinSet(Boolean(localStorage.getItem('bzh_pin')));
  }, []);

  useEffect(() => {
    getSupabase()
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setLogs((data ?? []) as AuditLog[]);
        setLoading(false);
      });
  }, [tick]);

  const exportBackup = async () => {
    setBackupMsg('');
    if (password.length < 6 || password !== confirmPwd) {
      setBackupMsg('密码至少 6 位，且两次输入需一致');
      return;
    }
    const { data } = await getSupabase().auth.getUser();
    const user = data.user;
    if (!user) return;
    const { data: payload } = await getSupabase().rpc('fn_export_all', { p_user: user.id });
    const json = JSON.stringify(payload, null, 2);
    const encrypted = await encryptBackup(json, password);
    const blob = new Blob([encrypted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `备份-${new Date().toISOString().slice(0, 10)}.dshbak`;
    a.click();
    URL.revokeObjectURL(url);
    await getSupabase().from('backup_logs').insert({
      user_id: user.id,
      scope: '全量',
      note: '加密备份',
    });
    await audit('export', 'backup', 'encrypted');
    setBackupOpen(false);
    setPassword('');
    setConfirmPwd('');
    setBackupMsg('备份已导出（.dshbak，需密码解密恢复）');
  };

  const savePin = () => {
    if (!/^\d{4,6}$/.test(pin)) {
      setBackupMsg('PIN 需为 4-6 位数字');
      return;
    }
    localStorage.setItem('bzh_pin', pin);
    setPinSet(true);
    setPin('');
    setBackupMsg('应用锁已设置：空闲锁定与敏感页二次验证生效');
  };

  const clearPin = () => {
    localStorage.removeItem('bzh_pin');
    sessionStorage.removeItem('bzh_unlocked');
    setPinSet(false);
    setBackupMsg('已关闭应用锁');
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🛡️"
        title="安全中心"
        subtitle="账号安全 · 审计日志 · 加密备份 · 应用锁"
        color={{ chip: 'bg-slate-700/60 text-slate-500', soft: 'bg-slate-800/60', text: 'text-slate-200' }}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card accent="bg-slate-400">
          <CardTitle right={<ShieldCheck size={16} className="text-slate-500" />}>账号安全</CardTitle>
          <ul className="space-y-2 text-sm text-slate-500">
            <li>• 登录方式：本机账号 + 密码（PBKDF2 哈希存储，密码不落盘）</li>
            <li>• 数据不出本机：全部保存在这台设备的浏览器（IndexedDB）中</li>
            <li>• 建议开启下方应用锁（PIN），敏感页面进入需解锁</li>
            <li>• 登录、导入、删除等敏感操作可通过下方审计日志自查</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPwdMsg(''); setPwdOpen(true); }}>
              <KeyRound size={14} /> 修改密码
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmSignOut(true)}>
              <LogOut size={14} /> 退出登录
            </Button>
          </div>
          {pwdMsg && <div className="mt-2 text-xs text-brand-300">{pwdMsg}</div>}
        </Card>

        <Card accent="bg-amber-400">
          <CardTitle right={<Lock size={16} className="text-slate-500" />}>应用锁（PIN）</CardTitle>
          {pinSet ? (
            <div className="space-y-2 text-sm text-slate-500">
              <Badge className="bg-green-500/15 text-green-300">已开启</Badge>
              <p className="text-xs text-slate-400">
                空闲 15 分钟自动锁定；重点关注台账等敏感页进入需 PIN（本设备生效）。
              </p>
              <Button variant="outline" size="sm" onClick={clearPin}>
                关闭应用锁
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="设置 4-6 位数字 PIN（存本设备，不进数据库）">
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="如 1234"
                  inputMode="numeric"
                />
              </Field>
              <Button size="sm" onClick={savePin}>
                <KeyRound size={14} /> 开启应用锁
              </Button>
            </div>
          )}
          {backupMsg && <div className="mt-2 text-xs text-brand-300">{backupMsg}</div>}
        </Card>

        <Card accent="bg-blue-400">
          <CardTitle right={<Download size={16} className="text-slate-500" />}>加密备份</CardTitle>
          <p className="mb-3 text-xs text-slate-400">
            数据只存在本机浏览器，请每周导出一次加密备份（AES-GCM，密码不落盘），
            妥善保管备份文件 —— 换设备 / 清浏览器数据时靠它恢复。
          </p>
          <Button onClick={() => { setBackupMsg(''); setBackupOpen(true); }}>
            <Download size={14} /> 导出加密备份（.dshbak）
          </Button>
        </Card>

        <Card accent="bg-green-400">
          <CardTitle right={<ShieldCheck size={16} className="text-slate-500" />}>数据与合规</CardTitle>
          <ul className="space-y-1.5 text-xs text-slate-400">
            <li>• 身份证号不录入；手机号列表打码</li>
            <li>• 所有表 RLS 行级安全（仅你本人账号可读写）</li>
            <li>• 删除走回收站（30 天）；清空回收站为物理删除</li>
            <li>• 家长告知文案见「设置」页（复制按钮）</li>
          </ul>
          <label className="mt-3 flex items-center justify-between rounded-xl bg-slate-800/60 px-3 py-2 text-sm">
            <span className="text-xs font-medium text-slate-500">防截图水印（成绩/重点关注页）</span>
            <input
              type="checkbox"
              defaultChecked={localStorage.getItem('bzh_watermark') !== '0'}
              onChange={(e) => localStorage.setItem('bzh_watermark', e.target.checked ? '1' : '0')}
              className="h-4 w-4 accent-brand-500"
            />
          </label>
        </Card>
      </div>

      <Card accent="bg-slate-300">
        <CardTitle dot="bg-slate-400" right={<Badge className="bg-slate-700/60 text-slate-400">最近 {logs.length} 条</Badge>}>
          审计日志（不可修改）
        </CardTitle>
        {logs.length === 0 ? (
          <Empty text="暂无审计记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 pr-2">时间</th>
                  <th className="pb-2 pr-2">操作</th>
                  <th className="pb-2 pr-2">对象</th>
                  <th className="pb-2">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-50">
                    <td className="py-1.5 pr-2 text-xs text-slate-400">
                      {formatDate(l.created_at)} {l.created_at.slice(11, 16)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge className="bg-slate-700/60 text-slate-500">
                        {ACTION_LABEL[l.action] ?? l.action}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-slate-400">{l.object_type ?? '—'}</td>
                    <td className="py-1.5 text-xs text-slate-400">
                      {l.detail ? JSON.stringify(l.detail).slice(0, 60) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={backupOpen}
        title="导出加密备份"
        onClose={() => setBackupOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setBackupOpen(false)}>
              取消
            </Button>
            <Button onClick={exportBackup}>导出并加密</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="备份密码" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位，请务必记牢（丢失无法恢复）"
            />
          </Field>
          <Field label="确认密码" required>
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
          </Field>
          {backupMsg && <ErrorBox message={backupMsg} />}
          <p className="text-xs text-slate-400">
            导出内容：全部班级、学生、考勤、成绩、事件、谈话、家校记录等（JSON 加密）。
            密码仅用于本次加密，不存储在任何地方。
          </p>
        </div>
      </Modal>

      {/* 修改密码 */}
      <Modal
        open={pwdOpen}
        title="修改密码"
        onClose={() => setPwdOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>
              取消
            </Button>
            <Button disabled={pwdBusy} onClick={changePassword}>
              {pwdBusy ? '修改中…' : '保存新密码'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="新密码" required>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="至少 8 位，含大小写字母与数字"
              autoComplete="new-password"
            />
          </Field>
          <Field label="确认新密码" required>
            <Input
              type="password"
              value={newPwd2}
              onChange={(e) => setNewPwd2(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {pwdMsg && <ErrorBox message={pwdMsg} />}
          <p className="text-xs text-slate-400">修改后当前会话仍有效；如怀疑账号泄露，请同时点「退出登录」。</p>
        </div>
      </Modal>

      <Confirm
        open={confirmSignOut}
        title="退出登录"
        message="将注销本机登录状态并返回登录页。适合离开电脑前或共用设备时使用。"
        danger
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={signOutAll}
      />
    </div>
  );
}
