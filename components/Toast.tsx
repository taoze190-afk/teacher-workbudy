'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: ToastKind }[]>([]);

  const push = useCallback((msg: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, kind }]);
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed left-1/2 top-16 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-[fadein_.25s_ease] rounded-xl px-4 py-2 text-sm font-medium text-white shadow-float',
              t.kind === 'success' && 'bg-emerald-500',
              t.kind === 'error' && 'bg-red-500',
              t.kind === 'info' && 'bg-slate-700'
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
