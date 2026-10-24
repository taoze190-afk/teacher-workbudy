'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, ShieldCheck, Upload } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { parseSurveyFile, runSurveyImport, type SurveyRow } from '@/lib/importer';
import { maskIdCard } from '@/lib/survey';
import { Badge, Button, Empty, ErrorBox } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

export default function SurveyImport() {
  const { currentClass, currentClassId, refresh } = useClass();
  const toast = useToast();
  const [fileName, setFileName] = useState('');
  const [profiles, setProfiles] = useState<SurveyRow[]>([]);
  const [phase, setPhase] = useState<'idle' | 'preview'>('idle');
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number; err: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setProfiles([]);
    setPhase('idle');
    setDone(null);
    setMessage('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    try {
      const res = await parseSurveyFile(file);
      setProfiles(res.profiles);
      if (res.message) setMessage(res.message);
      setPhase('preview');
    } catch (e) {
      setMessage('文件解析失败：' + (e as Error).message);
      setPhase('preview');
    }
  };

  // 文件内同名（问卷重复提交）
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of profiles) seen.set(p.name, (seen.get(p.name) ?? 0) + 1);
    return new Map([...seen.entries()].filter(([, n]) => n > 1));
  }, [profiles]);

  const doImport = async () => {
    if (!currentClassId) {
      setMessage('请先在右上角创建并选择班级，再导入');
      return;
    }
    setImporting(true);
    setMessage('');
    try {
      const res = await runSurveyImport(currentClassId, fileName, profiles);
      setDone(res);
      setImporting(false);
      toast(
        `导入完成：新增 ${res.created} 人，更新 ${res.updated} 人${res.err ? `，失败 ${res.err} 人` : ''}`,
        res.err ? 'info' : 'success'
      );
      refresh();
    } catch (e) {
      setMessage('导入失败：' + (e as Error).message);
      setImporting(false);
    }
  };

  const warnRows = profiles.filter((p) => p.warnings.length > 0);

  return (
    <div className="space-y-4">
      {/* 隐私说明 */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-200">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <ShieldCheck size={14} /> 隐私保护说明
        </div>
        <ul className="list-inside list-disc space-y-0.5 text-emerald-200/80">
          <li>身份证号仅用于提取出生日期和校验性别，<b>解析后立即丢弃，不会保存到系统</b></li>
          <li>其余信息保存在你自己的数据库中，仅自己可见（行级权限隔离）</li>
          <li>问卷系统列（序号、提交时间、来源、IP 等）自动跳过，不入库</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} /> 选择调查表文件（xlsx / xls / csv）
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {fileName && <span className="text-xs text-slate-400">已选择：{fileName}</span>}
        {profiles.length > 0 && (
          <span className="text-xs text-slate-400">
            导入到：<b className="text-slate-200">{currentClass?.name ?? '未选择班级'}</b>
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400">
        直接上传问卷星等平台导出的<b>原始调查表</b>即可，无需模板。系统按表头「1、…2、…」编号识别题目列，
        自动跳过序号/提交时间/来源/IP 等系统列；同名学生自动更新档案（按姓名匹配）。
      </p>

      {message && <ErrorBox message={message} />}

      {phase === 'preview' && profiles.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-green-500/15 text-green-300">解析成功 {profiles.length} 人</Badge>
            {warnRows.length > 0 && (
              <Badge className="bg-amber-500/15 text-amber-300">{warnRows.length} 人有待核对项</Badge>
            )}
            {dupNames.size > 0 && (
              <Badge className="bg-amber-500/15 text-amber-300">
                文件内重复提交：{[...dupNames.keys()].join('、')}（将合并为一条）
              </Badge>
            )}
            <div className="ml-auto">
              <Button size="sm" disabled={importing} onClick={doImport}>
                <FileUp size={14} /> {importing ? '导入中…' : `导入 ${profiles.length} 人`}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 pr-2">行</th>
                  <th className="pb-2 pr-2">姓名</th>
                  <th className="pb-2 pr-2">性别</th>
                  <th className="pb-2 pr-2">出生日期</th>
                  <th className="pb-2 pr-2">身份证号（不入库）</th>
                  <th className="pb-2 pr-2">监护人1</th>
                  <th className="pb-2 pr-2">监护人2</th>
                  <th className="pb-2 pr-2">家庭</th>
                  <th className="pb-2 pr-2">毕业小学</th>
                  <th className="pb-2">校验</th>
                </tr>
              </thead>
              <tbody>
                {profiles.slice(0, 30).map((p) => (
                  <tr
                    key={p.fileRow}
                    className={cn('border-t border-slate-50', p.warnings.length > 0 && 'bg-amber-500/5')}
                  >
                    <td className="py-1.5 pr-2 text-slate-400">{p.fileRow}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-200">
                      {p.name}
                      {dupNames.has(p.name) && (
                        <span className="ml-1 text-[10px] text-amber-400">×{dupNames.get(p.name)}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-400">{p.gender || '—'}</td>
                    <td className="py-1.5 pr-2 text-slate-400">
                      {p.birthday || '—'}
                      {p.birthdayFromId && (
                        <span className="ml-1 text-[10px] text-emerald-400" title="从身份证号提取，身份证号本身不保存">
                          证
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">{p.idMasked || '—'}</td>
                    <td className="py-1.5 pr-2 text-slate-400">
                      {p.guardian1.phone
                        ? `${p.guardian1.relation || ''} ${p.guardian1.phone}`
                        : p.guardian1.relation || '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-400">
                      {p.guardian2.phone
                        ? `${p.guardian2.relation || ''} ${p.guardian2.phone}`
                        : p.guardian2.relation || '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-400">{p.familyStructure || '—'}</td>
                    <td className="max-w-[110px] truncate py-1.5 pr-2 text-slate-400">{p.primarySchool || '—'}</td>
                    <td className="py-1.5">
                      {p.warnings.length > 0 ? (
                        <span className="text-amber-400">{p.warnings.join('；')}</span>
                      ) : (
                        <span className="text-green-500">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {profiles.length > 30 && (
              <p className="pt-2 text-xs text-slate-400">…共 {profiles.length} 人，预览仅显示前 30 人</p>
            )}
          </div>

          {done && (
            <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-300">
              导入完成：新增 {done.created} 人，更新 {done.updated} 人
              {done.err ? `，失败 ${done.err} 人（详情见导入日志）` : ''}。
              全部 28 题作答已录入学生档案，可在学生详情页「新生调查表」查看和修改。
            </div>
          )}
        </>
      )}

      {phase === 'preview' && profiles.length === 0 && !message && (
        <Empty text="文件为空或没有有效作答行" />
      )}
    </div>
  );
}
