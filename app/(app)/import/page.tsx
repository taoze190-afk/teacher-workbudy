'use client';

import { useState } from 'react';
import { Card, PageHeader } from '@/components/ui';
import ImportFlow from '@/components/ImportFlow';
import SurveyImport from '@/components/SurveyImport';
import type { ImportType } from '@/lib/importer';
import { cn } from '@/lib/utils';

export default function ImportPage() {
  const [type, setType] = useState<ImportType>('students');

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="📥"
        title="导入中心"
        subtitle="一键导入 · 表头自动识别 · 解析校验 · 错误报告"
        color={{ chip: 'bg-blue-500/15 text-blue-300', soft: 'bg-blue-500/10', text: 'text-blue-300' }}
      />

      <div className="flex gap-2">
        {(
          [
            ['students', '学生名单'],
            ['grades', '成绩（宽表）'],
            ['survey', '新生调查表'],
          ] as [ImportType, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
              type === t
                ? 'border-blue-300 bg-blue-500/10 text-blue-300'
                : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-blue-500/40'
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-400">
          💡 学生档案页和成绩页也有快捷导入入口
        </span>
      </div>

      <Card>{type === 'survey' ? <SurveyImport /> : <ImportFlow key={type} type={type} />}</Card>
    </div>
  );
}
