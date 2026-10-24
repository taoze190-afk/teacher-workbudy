// 加密备份（Web Crypto AES-GCM，密码不落盘）

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackup(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plaintext)
  );
  const payload = new Uint8Array(16 + 12 + cipher.byteLength);
  payload.set(salt, 0);
  payload.set(iv, 16);
  payload.set(new Uint8Array(cipher), 28);
  let bin = '';
  payload.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export async function decryptBackup(dataUrl: string, password: string): Promise<string> {
  const bin = atob(dataUrl);
  const payload = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) payload[i] = bin.charCodeAt(i);
  const salt = payload.slice(0, 16);
  const iv = payload.slice(16, 28);
  const cipher = payload.slice(28);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    cipher
  );
  return dec.decode(plain);
}
