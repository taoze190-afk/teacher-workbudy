// 本地数据层：数据全部保存在本机浏览器 IndexedDB，账号密码也只存本机（PBKDF2 哈希）。
// 不需要配置任何服务器 / 云服务：clone → npm install → npm run dev 即可使用。
//
// - 业务数据：IndexedDB `banzhuren-local` / store `kv`，整库 JSON 快照（变更后防抖落盘）
// - 学生照片等附件：IndexedDB 同库 store `photos`（upload 传入的文件转 dataURL 保存）
// - 本地账号：localStorage `bzh_local_account`（PBKDF2-SHA256 哈希，不存明文密码）
// - 登录会话：localStorage `bzh_session`（本机标识，非令牌）
//
// 跨设备迁移：安全中心导出 .dshbak 加密备份，在新设备上恢复（恢复向导见 README）。

import { createMiniClient, Db, Row } from './local-core';

const DB_NAME = 'banzhuren-local';
const STORE_KV = 'kv';
const STORE_PHOTOS = 'photos';
const KEY_DB = 'db';

const LS_ACCOUNT = 'bzh_local_account'; // { email, salt, hash, created_at }
const LS_SESSION = 'bzh_session'; // '1' = 已登录
const LS_EMAIL = 'bzh_local_email'; // 水印等处展示用的账号名

/* ---------- IndexedDB 基础 ---------- */
let dbPromise: Promise<IDBDatabase> | null = null;

function idbOpen(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE_KV)) d.createObjectStore(STORE_KV);
        if (!d.objectStoreNames.contains(STORE_PHOTOS)) d.createObjectStore(STORE_PHOTOS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function idbReq<T>(store: IDBObjectStore, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const d = await idbOpen();
  const s = d.transaction(STORE_KV, 'readonly').objectStore(STORE_KV);
  return idbReq<T>(s, (st) => st.get(key));
}

async function kvPut(key: string, val: unknown): Promise<void> {
  const d = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).put(val as any, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function photoPut(path: string, dataUrl: string): Promise<void> {
  const d = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE_PHOTOS, 'readwrite');
    tx.objectStore(STORE_PHOTOS).put(dataUrl, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function photoGet(path: string): Promise<string | undefined> {
  const d = await idbOpen();
  const s = d.transaction(STORE_PHOTOS, 'readonly').objectStore(STORE_PHOTOS);
  return idbReq<string>(s, (st) => st.get(path));
}

async function photoDel(paths: string[]): Promise<void> {
  const d = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE_PHOTOS, 'readwrite');
    const st = tx.objectStore(STORE_PHOTOS);
    paths.forEach((p) => st.delete(p));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- 整库快照 ---------- */
let db: Db | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function loadDb(): Promise<Db> {
  if (db) return db;
  try {
    const stored = await kvGet<Db>(KEY_DB);
    db = stored && typeof stored === 'object' ? stored : {};
  } catch {
    db = {};
  }
  return db;
}

function scheduleSave() {
  if (saveTimer != null) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      if (db) await kvPut(KEY_DB, db);
    } catch {
      // 存储配额不足等：不影响当前会话，下次操作重试
    }
  }, 250);
}

// 备份 / 恢复向导可用的高级接口（安全中心 → 导出的 .dshbak 解密后即此结构）
export async function exportLocalDb(): Promise<Db> {
  return JSON.parse(JSON.stringify(await loadDb()));
}

export async function importLocalDb(snapshot: Db): Promise<void> {
  db = snapshot ?? {};
  await kvPut(KEY_DB, db);
}

export async function wipeLocalDb(): Promise<void> {
  db = {};
  await kvPut(KEY_DB, db);
  try {
    const d = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE_PHOTOS, 'readwrite');
      tx.objectStore(STORE_PHOTOS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/* ---------- 本地账号（PBKDF2-SHA256，密码不落盘） ---------- */
const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 150000, hash: 'SHA-256' },
    baseKey,
    256
  );
  return toB64(new Uint8Array(bits));
}

export interface LocalAccount {
  email: string;
  salt: string;
  hash: string;
  created_at: string;
}

export async function getLocalAccount(): Promise<LocalAccount | null> {
  try {
    const raw = localStorage.getItem(LS_ACCOUNT);
    return raw ? (JSON.parse(raw) as LocalAccount) : null;
  } catch {
    return null;
  }
}

export async function createLocalAccount(email: string, password: string): Promise<LocalAccount> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const account: LocalAccount = { email, salt: toB64(salt), hash, created_at: new Date().toISOString() };
  localStorage.setItem(LS_ACCOUNT, JSON.stringify(account));
  localStorage.setItem(LS_EMAIL, email);
  localStorage.setItem(LS_SESSION, '1'); // 初始化即视为本机已登录
  return account;
}

const LOCAL_USER_ID = 'local-user';

function localUser(account: LocalAccount | null) {
  return {
    id: LOCAL_USER_ID,
    email: account?.email ?? '本地用户',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: account?.created_at ?? new Date().toISOString(),
  };
}

function hasSession(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(LS_SESSION) === '1';
}

/* ---------- auth 实现 ---------- */
const auth = {
  getSession: async () => {
    const account = hasSession() ? await getLocalAccount() : null;
    return {
      data: {
        session: account
          ? { user: localUser(account), expires_at: Math.floor(Date.now() / 1000) + 86400 * 30 }
          : null,
      },
      error: null,
    };
  },
  getUser: async () => {
    const account = hasSession() ? await getLocalAccount() : null;
    return { data: { user: account ? localUser(account) : null }, error: null };
  },
  onAuthStateChange: (cb: (ev: string, session: any) => void) => {
    (async () => {
      const account = hasSession() ? await getLocalAccount() : null;
      try {
        cb(account ? 'INITIAL_SESSION' : 'SIGNED_OUT', account ? { user: localUser(account) } : null);
      } catch {
        /* ignore */
      }
    })();
    return { data: { subscription: { unsubscribe() {} } } };
  },
  signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
    const account = await getLocalAccount();
    if (!account) return { data: {}, error: { message: '尚未初始化本地账号' } };
    const emailOk = account.email.toLowerCase() === String(email ?? '').toLowerCase().trim();
    const salt = fromB64(account.salt);
    const hash = await hashPassword(String(password ?? ''), salt);
    if (!emailOk || hash !== account.hash) {
      return { data: {}, error: { message: '用户名或密码不正确' } };
    }
    localStorage.setItem(LS_SESSION, '1');
    localStorage.setItem(LS_EMAIL, account.email);
    return { data: { user: localUser(account) }, error: null };
  },
  updateUser: async ({ password }: { password: string }) => {
    const account = await getLocalAccount();
    if (!account) return { error: { message: '尚未初始化本地账号' } };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(String(password), salt);
    localStorage.setItem(LS_ACCOUNT, JSON.stringify({ ...account, salt: toB64(salt), hash }));
    return { error: null };
  },
  signOut: async () => {
    localStorage.removeItem(LS_SESSION);
    return { error: null };
  },
  resetPasswordForEmail: async () => ({
    error: { message: '本地模式数据不出本机，没有邮件找回。请登录后在「安全中心」修改密码。' },
  }),
  exchangeCodeForSession: async () => ({
    error: { message: '本地模式不支持邮件重置流程' },
  }),
  mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }),
    listFactors: async () => ({ data: { totp: [] }, error: null }),
    challenge: async () => ({ data: null, error: { message: '本地模式不使用两步验证' } }),
    verify: async () => ({ data: null, error: { message: '本地模式不使用两步验证' } }),
  },
};

/* ---------- storage 实现（照片等附件 → IndexedDB dataURL） ---------- */
function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const storage = {
  from: (_bucket: string) => ({
    upload: async (path: string, file: File | Blob) => {
      try {
        const dataUrl = await fileToDataUrl(file);
        await photoPut(path, dataUrl);
        return { data: { path }, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    createSignedUrl: async (path: string) => {
      try {
        const url = (await photoGet(path)) ?? '';
        return { data: { signedUrl: url }, error: null };
      } catch {
        return { data: { signedUrl: '' }, error: null };
      }
    },
    remove: async (paths: string[]) => {
      await photoDel(paths);
      return { data: null, error: null };
    },
    getPublicUrl: (_path: string) => ({ data: { publicUrl: '' } }),
  }),
};

/* ---------- 客户端 ---------- */
let client: ReturnType<typeof createMiniClient> | null = null;

export function createLocalClient() {
  if (client) return client;
  client = createMiniClient({
    getDb: loadDb,
    onMutate: scheduleSave,
    auth,
    storage,
  });
  return client;
}
