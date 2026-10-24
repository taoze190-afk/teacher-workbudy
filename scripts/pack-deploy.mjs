// 打包静态产物为「Linux 可正确解压」的 zip（1Panel 上传用）
//   用法：npm run build && node scripts/pack-deploy.mjs
// 注意：不要用 PowerShell 的 Compress-Archive —— 它生成的条目分隔符是反斜杠，
//       在 Linux 下解压会变成一堆带反斜杠的扁平文件名，而不是目录结构。
import JSZip from 'jszip';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'out');
const TARGET = join(ROOT, 'banzhuren-web.zip');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

try {
  await stat(OUT);
} catch {
  console.error('❌ 找不到 out/ 目录，请先执行：npm run build');
  process.exit(1);
}

const files = await walk(OUT);
const zip = new JSZip();

for (const file of files) {
  // 关键：路径分隔符统一为正斜杠，Linux 才能解压出正确的目录结构
  const rel = relative(OUT, file).split(sep).join('/');
  zip.file(rel, await readFile(file));
}

const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
  platform: 'UNIX',
});
await writeFile(TARGET, buf);

// 自检：读回 zip，确认结构与分隔符正确
const check = await JSZip.loadAsync(buf);
const names = Object.keys(check.files);
const has = (p) => names.includes(p);
const required = [
  'index.html',
  'dashboard/index.html',
  'duty/index.html',
  'students/detail/index.html',
  'login/index.html',
  'robots.txt',
  // PWA：少任何一项 Chrome 都不会出现「安装应用」入口
  'manifest.webmanifest',
  'sw.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'favicon.ico',
];
const missing = required.filter((r) => !has(r));
const badSep = names.filter((n) => n.includes('\\'));

console.log(`✅ 打包完成：banzhuren-web.zip`);
console.log(`   条目数：${names.length}   大小：${(buf.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`   根目录：${[...new Set(names.map((n) => n.split('/')[0]))].slice(0, 8).join(', ')} …`);

if (missing.length > 0) {
  console.error(`❌ 缺少关键文件：${missing.join(', ')}`);
  process.exit(1);
}
if (badSep.length > 0) {
  console.error(`❌ 发现 ${badSep.length} 个反斜杠分隔条目，Linux 解压会出错`);
  process.exit(1);
}
console.log('   ✅ 结构自检通过（可直接上传到 1Panel 网站目录解压）');
