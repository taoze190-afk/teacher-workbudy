'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import type { Exam } from '@/lib/types';
import type { ImportType, ParsedRow } from '@/lib/importer';
import { HEADER_SYNONYMS, downloadTemplate, parseFile, runImport } from '@/lib/importer';
import { Badge, Button, Empty, ErrorBox, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/**
 * 给导入请求加超时。
 * 防御性兜底：万一数据层某个操作异常挂起（如浏览器存储被占用），界面不至于永远停在
 * 「导入中…」而没有报错、也无法取消。
 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export default function ImportFlow({
  type,
  initialExamId,
  onDone,
}: {
  type: ImportType;
  initialExamId?: string;
  onDone?: () => void;
}) {
  const { currentClassId, refresh } = useClass();
  const toast = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(initialExamId ?? '');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [header, setHeader] = useState<string[]>([]);
  const [subjectMap, setSubjectMap] = useState<{ raw: string; subject: string }[]>([]);
  const [phase, setPhase] = useState<'idle' | 'preview'>('idle');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{
    ok: number;
    err: number;
    skippedSubjects?: string[];
    createdStudents?: string[];
    details?: { row: number; field: string; reason: string }[];
    warnings?: number;
    notes?: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type !== 'grades' || !currentClassId) return;
    getSupabase()
      .from('exams')
      .select('*')
      .eq('class_id', currentClassId)
      .order('exam_date', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Exam[];
        setExams(list);
        setExamId((p) => (p && list.some((e) => e.id === p) ? p : list[0]?.id ?? ''));
      });
  }, [type, currentClassId]);

  const reset = () => {
    setParsed([]);
    setHeader([]);
    setSubjectMap([]);
    setPhase('idle');
    setDone(null);
    setMessage('');
    setNotice('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    try {
      const res = await parseFile(type, file);
      setHeader(res.header);
      setParsed(res.rows);
      setSubjectMap(res.subjectMap ?? []);
      if (res.message) setMessage(res.message);
      setNotice(res.notice ?? '');
      setPhase('preview');
    } catch (e) {
      setMessage('文件解析失败：' + (e as Error).message + '（请使用 xlsx / xls / csv 格式，可先下载模板对照）');
      setPhase('preview');
    }
  };

  const doImport = async () => {
    if (!currentClassId) {
      setMessage('请先在右上角创建并选择班级，再导入数据');
      return;
    }
    if (type === 'grades' && !examId) {
      setMessage('请先选择要导入的考试');
      return;
    }
    setImporting(true);
    setMessage('');
    try {
      const res = await withTimeout(
        runImport(type, currentClassId, examId, fileName, parsed, header, subjectMap),
        120000,
        '导入超时：2 分钟内没有收到服务器响应。已写入的数据不会丢失，可刷新页面确认后再重试。'
      );
      setDone(res);
      setImporting(false);
      const parts = [`成功 ${res.ok} 行`];
      if (res.err > 0) parts.push(`跳过 ${res.err} 行`);
      if (res.createdStudents?.length) parts.push(`新建学生 ${res.createdStudents.length} 人`);
      toast(`导入完成：${parts.join('，')}`, res.err > 0 ? 'info' : 'success');
      refresh();
      onDone?.();
    } catch (e) {
      setMessage('导入失败：' + (e as Error).message);
      setImporting(false);
      // 失败也可能已经写入了部分数据（例如日志写入失败），刷新让老师看到真实状态
      refresh();
      onDone?.();
    }
  };

  const okCount = parsed.filter((p) => p.errors.length === 0).length;
  const errRows = parsed.filter((p) => p.errors.length > 0);
  const warnRows = parsed.filter((p) => p.errors.length === 0 && (p.warnings?.length ?? 0) > 0);

  const cellValue = (row: ParsedRow, h: string): string => {
    if (type === 'grades') {
      const hh = h.trim();
      if (['学号', '学籍号', '编号', '学生编号'].includes(hh)) return row.values['_no'] ?? '';
      if (['姓名', '学生姓名', '名字'].includes(hh)) return row.values['_name'] ?? '';
    }
    const field = Object.keys(HEADER_SYNONYMS).find((k) => HEADER_SYNONYMS[k].includes(h));
    return field ? row.values[field] ?? '' : row.values[h] ?? '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => downloadTemplate(type)}>
          <Download size={14} /> 下载{type === 'students' ? '学生' : '成绩'}模板
        </Button>
        <Button
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} /> 选择文件（xlsx / xls / csv）
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
        {type === 'grades' && (
          <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-44">
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                导入到：{e.name}
              </option>
            ))}
          </Select>
        )}
        {fileName && <span className="text-xs text-slate-400">已选择：{fileName}</span>}
      </div>

      {type === 'grades' && (
        <p className="text-xs text-slate-400">
          宽表格式：一列「姓名」+ 每科一列分数，学生<b className="text-slate-300">只按姓名匹配</b>（学号列自动忽略，避免 01 与 1 被当成两个人）；「缺考/请假」自动标记缺考；已有成绩按「考试+学生+科目」覆盖更新。名单里没有的姓名会自动建档、学号接续本班最大号——任教班无需先导入学生名单，直接上传成绩单即可。
        </p>
      )}

      {message && <ErrorBox message={message} />}
      {notice && (
        <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-300">ℹ️ {notice}</p>
      )}

      {phase === 'preview' && parsed.length > 0 && (
        <>
          <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center gap-2 bg-slate-800/95 px-5 py-2 backdrop-blur">
            <Badge className="bg-green-500/15 text-green-300">解析成功 {okCount} 行</Badge>
            {errRows.length > 0 && <Badge className="bg-red-500/15 text-red-300">异常 {errRows.length} 行</Badge>}
            <div className="ml-auto">
              <Button size="sm" disabled={importing || okCount === 0} onClick={doImport}>
                <FileUp size={14} /> {importing ? '导入中…' : `导入 ${okCount} 行`}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 pr-2">行</th>
                  {header.map((h, i) => (
                    <th key={i} className="pb-2 pr-2">
                      {h}
                    </th>
                  ))}
                  <th className="pb-2">校验</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 30).map((row) => (
                  <tr key={row.row} className={cn('border-t border-slate-50', row.errors.length > 0 && 'bg-red-500/10')}>
                    <td className="py-1.5 pr-2 text-slate-400">{row.row}</td>
                    {header.map((h, i) => (
                      <td key={i} className="max-w-[120px] truncate py-1.5 pr-2 text-slate-500">
                        {cellValue(row, h)}
                      </td>
                    ))}
                    <td className="py-1.5">
                      {row.errors.length > 0 ? (
                        <span className="text-red-500">{row.errors.map((e) => `${e.field}:${e.reason}`).join('；')}</span>
                      ) : (
                        <span className="text-green-500">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errRows.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-red-500">
                查看全部 {errRows.length} 条异常（导入时会跳过这些行）
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {errRows.slice(0, 50).map((r) => (
                  <li key={r.row}>
                    第 {r.row} 行：{r.errors.map((e) => `${e.field} ${e.reason}`).join('；')}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {done && (
            <div
              className={cn(
                'space-y-2 rounded-lg p-3 text-sm',
                done.err > 0 ? 'bg-amber-500/10 text-amber-300' : 'bg-green-500/10 text-green-300'
              )}
            >
              <div>
                导入完成：成功 {done.ok} 行，跳过 {done.err} 行。
              </div>
              {!!done.skippedSubjects?.length && (
                <div className="text-amber-300">
                  ⚠️ 文件里的这些科目本场考试没有配置，已跳过：{done.skippedSubjects.join('、')}。
                  请到「考试管理」编辑这场考试补齐科目，再重新导入。
                </div>
              )}
              {!!done.createdStudents?.length && (
                <div className="text-sky-300">
                  ＋ 自动新建了 {done.createdStudents.length} 位学生：
                  {done.createdStudents.slice(0, 10).join('、')}
                  {done.createdStudents.length > 10 && ' …'}
                  （姓名写错会多出假学生，请到「学生档案」核对）
                </div>
              )}
              {!!done.warnings && (
                <div className="text-slate-400">
                  另有 {done.warnings} 处分数/信息写法异常，已跳过对应字段，该行其他内容照常导入。
                </div>
              )}
              {!!done.notes?.length && <div className="text-sky-300">ℹ️ {done.notes.join('；')}</div>}
              {!!done.details?.length && (
                <details>
                  <summary className="cursor-pointer text-xs text-slate-400">
                    查看明细（{done.details.length} 条）
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
                    {done.details.map((d, i) => (
                      <li key={i}>
                        {d.row > 0 ? `第 ${d.row} 行 · ` : ''}
                        {d.field}：{d.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}

      {phase === 'preview' && parsed.length === 0 && !message && (
        <Empty text="文件为空或没有有效数据行" />
      )}
    </div>
  );
}
