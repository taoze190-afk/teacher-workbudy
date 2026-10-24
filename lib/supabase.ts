// 数据层门面（历史命名 getSupabase 保留，避免全站改动）：
// - 演示模式（登录页点「演示模式」或 localStorage.bzh_demo='1'）→ 内存示例数据
// - 正常模式 → 本地持久化客户端（IndexedDB + 本地账号，见 lib/local.ts），无需任何后端服务
import { createDemoClient, isDemoMode } from './demo';
import { createLocalClient } from './local';

/* ---------- 客户端最小类型面（与 supabase-js 调用方式同形，仅为类型检查服务） ---------- */
export interface BzResult<T = any> {
  data: T;
  error: { message: string } | null;
  count?: number;
}

export interface BzBuilder extends PromiseLike<BzResult<any>> {
  select(cols?: string, opts?: any): BzBuilder;
  eq(col: string, val: any): BzBuilder;
  neq(col: string, val: any): BzBuilder;
  is(col: string, val: any): BzBuilder;
  in(col: string, vals: any[]): BzBuilder;
  lt(col: string, val: any): BzBuilder;
  match(key: Record<string, any>): BzBuilder;
  order(col: string, opts?: { ascending?: boolean }): BzBuilder;
  limit(n: number): BzBuilder;
  single(): BzBuilder;
  maybeSingle(): BzBuilder;
  upsert(payload: any, opts?: { onConflict?: string }): BzBuilder;
  insert(payload: any, opts?: any): BzBuilder;
  update(payload: any, opts?: { count?: 'exact' }): BzBuilder;
  delete(opts?: { count?: 'exact' }): BzBuilder;
}

export interface BzAuth {
  getSession(): PromiseLike<BzResult<{ session: { user: any; expires_at?: number } | null }>>;
  getUser(): PromiseLike<BzResult<{ user: any }>>;
  onAuthStateChange(cb: (ev: string, session: { user?: any } | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credentials: { email: string; password: string }): PromiseLike<BzResult<any>>;
  updateUser(payload: { password: string }): PromiseLike<BzResult<null>>;
  signOut(opts?: any): PromiseLike<BzResult<null>>;
  resetPasswordForEmail(email: string, opts?: any): PromiseLike<BzResult<null>>;
  exchangeCodeForSession(code: string): PromiseLike<BzResult<null>>;
  mfa: {
    getAuthenticatorAssuranceLevel(): PromiseLike<BzResult<{ currentLevel: string; nextLevel: string }>>;
    listFactors(): PromiseLike<BzResult<{ totp: any[] }>>;
    challenge(args?: any): PromiseLike<BzResult<any>>;
    verify(args?: any): PromiseLike<BzResult<any>>;
  };
}

export interface BzClient {
  from(table: string): BzBuilder;
  rpc(name: string, args?: Record<string, any>): PromiseLike<BzResult<any>>;
  storage: {
    from(bucket: string): {
      upload(path: string, file: File | Blob): PromiseLike<BzResult<{ path: string }>>;
      createSignedUrl(path: string, expires?: number): PromiseLike<BzResult<{ signedUrl: string }>>;
      remove(paths: string[]): PromiseLike<BzResult<null>>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
  auth: BzAuth;
}

export type SupabaseLikeClient = BzClient;

export function isSupabaseConfigured(): boolean {
  // 本地模式下数据层开箱即用，无需任何配置
  return true;
}

let localClient: SupabaseLikeClient | null = null;

export function getSupabase(): SupabaseLikeClient {
  // 演示模式返回内存 Mock 客户端（不落盘）
  if (isDemoMode()) return createDemoClient() as unknown as SupabaseLikeClient;
  if (!localClient) localClient = createLocalClient() as unknown as SupabaseLikeClient;
  return localClient;
}

// 记录敏感操作审计日志（audit_logs 只追加）
export async function audit(action: string, objectType?: string, objectId?: string, detail?: unknown) {
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return;
    await sb.from('audit_logs').insert({
      user_id: data.user.id,
      action,
      object_type: objectType ?? null,
      object_id: objectId ?? null,
      detail: detail ?? null,
    });
  } catch {
    // 审计失败不影响主流程
  }
}
