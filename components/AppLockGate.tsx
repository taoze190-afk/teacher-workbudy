'use client';

import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

// 敏感页 PIN 锁：PIN 存设备本地；解锁状态本会话有效
export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('bzh_unlocked') === '1'
  );

  if (unlocked) return <>{children}</>;
  const storedPin = typeof window !== 'undefined' ? localStorage.getItem('bzh_pin') : null;
  if (!storedPin) return <>{children}</>;

  const tryUnlock = () => {
    if (pin === storedPin) {
      sessionStorage.setItem('bzh_unlocked', '1');
      setUnlocked(true);
      setError('');
    } else {
      setError('PIN 不正确');
      setPin('');
    }
  };

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-xs text-center">
        <div className="mb-2 text-2xl">🔒</div>
        <div className="mb-3 text-sm text-slate-500">此页面为敏感内容，请输入 PIN</div>
        <Input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="PIN"
          onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
        />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <Button className="mt-3 w-full" onClick={tryUnlock}>
          解锁
        </Button>
      </Card>
    </div>
  );
}
