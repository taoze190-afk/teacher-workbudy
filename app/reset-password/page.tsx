'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

// 本地模式下数据不出本机、没有邮件找回流程；改密码请登录后到「安全中心」。
// 保留该路由仅为了兼容旧收藏链接，进入即跳回登录页。
export default function ResetPasswordPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
