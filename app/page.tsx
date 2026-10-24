'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { Spinner } from '@/components/ui';

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading');

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState('out');
      return;
    }
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        setState(data.session ? 'in' : 'out');
      });
  }, []);

  useEffect(() => {
    if (state === 'in') router.replace('/dashboard');
    if (state === 'out') router.replace('/login');
  }, [state, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
