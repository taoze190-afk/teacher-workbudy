export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toDateStr(new Date());
}

export function formatDate(s?: string | null): string {
  if (!s) return '';
  return s.slice(0, 10);
}

export function maskPhone(p?: string | null): string {
  if (!p) return '';
  const s = p.replace(/[^0-9]/g, '');
  if (s.length !== 11) return p;
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

export function todayMonthDay(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isBirthdayThisMonth(birthday?: string | null): boolean {
  if (!birthday) return false;
  const b = new Date(birthday);
  const now = new Date();
  return b.getMonth() === now.getMonth();
}

export function isBirthdayToday(birthday?: string | null): boolean {
  if (!birthday) return false;
  const b = new Date(birthday);
  const now = new Date();
  return b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
}

export function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

export function addDays(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// 距今天数（正=未来）
export function daysFromToday(s?: string | null): number | null {
  if (!s) return null;
  const a = new Date(s + 'T00:00:00').getTime();
  const b = new Date(today() + 'T00:00:00').getTime();
  return Math.round((a - b) / 86400000);
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 学号按数字排序（"2" 排在 "10" 前面；非纯数字按字符串排在后面）
export function compareStudentNo(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (!Number.isNaN(na)) return -1;
  if (!Number.isNaN(nb)) return 1;
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true });
}
