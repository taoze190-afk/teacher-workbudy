'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { today } from '@/lib/utils';

// 防截图水印：敏感页面叠加半透明斜纹水印（开关存 localStorage 'bzh_watermark'）
// portal 到 body：避免页面外层动画残留 transform 时水印只盖住内容区
export default function Watermark() {
  const [enabled] = useState(() => localStorage.getItem('bzh_watermark') !== '0');
  if (!enabled) return null;

  const { email } = (() => {
    try {
      const u = localStorage.getItem('bzh_local_email');
      if (u) return { email: u };
    } catch {
      /* ignore */
    }
    return { email: '班主任' };
  })();

  const label = `${email} · ${today()} · 内部资料`;
  const items: { top: string; left: string }[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      items.push({ top: `${r * 26 - 5}%`, left: `${c * 30 - 10}%` });
    }
  }

  return createPortal(
    <div
      aria-hidden
      className="no-print pointer-events-none fixed inset-0 z-40 select-none overflow-hidden"
    >
      {items.map((p, i) => (
        <div
          key={i}
          className="absolute -rotate-[28deg] whitespace-nowrap text-sm font-medium text-slate-400/[0.07]"
          style={{ top: p.top, left: p.left }}
        >
          {label}
        </div>
      ))}
    </div>,
    document.body
  );
}
