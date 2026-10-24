'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { getAiConfig, saveAiConfig } from '@/lib/ai';
import { Button, Card, CardTitle, Field, Input, PageHeader, Select } from '@/components/ui';

const NOTICE_TEXT = `各位家长：班级日常管理需要记录孩子的基本信息、联系方式及在校表现。该信息仅由班主任本人使用，保存在个人私有账号中，不对外提供、不用于任何商业用途，学期结束后按学校规定归档或删除。如有疑问可随时与班主任沟通。`;

export default function SettingsPage() {
  const { currentClassId, settings, refresh } = useClass();
  const [maskPhone, setMaskPhone] = useState(true);
  const [backupReminder, setBackupReminder] = useState(true);
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(7);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [ai, setAi] = useState({ base: '', key: '', model: 'gpt-4o-mini' });
  const [aiSaved, setAiSaved] = useState(false);

  useEffect(() => {
    setAi(getAiConfig());
  }, []);

  useEffect(() => {
    if (settings) {
      setMaskPhone(settings.mask_phone);
      setBackupReminder(settings.weekly_backup_reminder);
      setRows(settings.seating_rows);
      setCols(settings.seating_cols);
    }
  }, [settings]);

  const saveSettings = async () => {
    setSaving(true);
    const { data } = await getSupabase().auth.getUser();
    const user = data.user;
    if (!user) return;
    await getSupabase()
      .from('app_settings')
      .upsert({
        user_id: user.id,
        current_class_id: currentClassId,
        mask_phone: maskPhone,
        weekly_backup_reminder: backupReminder,
        seating_rows: rows,
        seating_cols: cols,
      });
    await audit('update', 'settings');
    setSaving(false);
    setSavedMsg('设置已保存');
    setTimeout(() => setSavedMsg(''), 2000);
    refresh();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="⚙️"
        title="设置"
        subtitle="显示偏好 · 座位网格 · 合规文案"
        color={{ chip: 'bg-gray-500/15 text-gray-300', soft: 'bg-gray-500/10', text: 'text-gray-300' }}
      />

      <Card>
        <CardTitle>显示与默认</CardTitle>
        <div className="space-y-4">
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              手机号打码（学生列表与档案页）
              <span className="mt-0.5 block text-xs text-slate-500">
                默认<b className="text-slate-400">关闭</b>，显示完整号码并可点击拨打；开启后显示为 138****0000
              </span>
            </span>
            <input
              type="checkbox"
              checked={maskPhone}
              onChange={(e) => setMaskPhone(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-500">每周备份提醒</span>
            <input
              type="checkbox"
              checked={backupReminder}
              onChange={(e) => setBackupReminder(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="座位行数">
              <Input type="number" value={rows} onChange={(e) => setRows(Number(e.target.value))} />
            </Field>
            <Field label="座位列数">
              <Input type="number" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={saving} onClick={saveSettings}>
              {saving ? '保存中…' : '保存设置'}
            </Button>
            {savedMsg && <span className="text-sm text-green-300">{savedMsg}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle
          right={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(NOTICE_TEXT);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制文案'}
            </Button>
          }
        >
          家长告知文案（合规）
        </CardTitle>
        <p className="rounded-lg bg-slate-800/60 p-3 text-sm leading-6 text-slate-500">{NOTICE_TEXT}</p>
        <p className="mt-2 text-xs text-slate-400">
          开学时发到家长群，说明信息仅本人使用、不外泄。数据只保存在本机浏览器，详见 README「数据与隐私设计」。
        </p>
      </Card>

      <Card>
        <CardTitle
          right={<Sparkles size={16} className="text-slate-500" />}
        >
          AI 评语配置
        </CardTitle>
        <p className="mb-3 text-xs leading-5 text-slate-400">
          评语页「AI 润色」、备课页「AI 教案」调用 OpenAI 兼容接口。配置只保存在本机浏览器，不会上传。
          常用填法：<br />
          · DeepSeek（国内直连）：<code>https://api.deepseek.com/v1</code>，模型 <code>deepseek-chat</code><br />
          · 通义千问（国内直连）：<code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>，模型 <code>qwen-flash</code><br />
          · Google Gemini（需科学上网，或用提供 gemini 模型的中转平台）：<code>https://generativelanguage.googleapis.com/v1beta/openai</code>，模型 <code>gemini-2.5-flash</code>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="接口地址">
            <Input value={ai.base} onChange={(e) => setAi({ ...ai, base: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </Field>
          <Field label="API Key">
            <Input type="password" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} placeholder="sk-…" />
          </Field>
          <Field label="模型">
            <Input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="deepseek-chat" />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              saveAiConfig(ai);
              setAiSaved(true);
              setTimeout(() => setAiSaved(false), 2000);
            }}
          >
            保存 AI 配置
          </Button>
          {aiSaved && <span className="text-sm text-green-300">已保存（仅本机）</span>}
        </div>
      </Card>

      <Card>
        <CardTitle>关于</CardTitle>
        <p className="text-xs leading-6 text-slate-400">
          班主任工作台 v0.1 · Next.js + Tailwind + ECharts（数据本地存储）
          <br />
          数据私有 · 设计文档见 design-docs/
        </p>
      </Card>
    </div>
  );
}
