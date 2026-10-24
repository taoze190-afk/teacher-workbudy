// 本地预览生产静态产物（模拟 1Panel 静态网站的行为）
//   用法：node scripts/preview-static.mjs [端口]
//   前置：先执行 npm run build
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', 'out');
const PORT = Number(process.argv[2] ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    // 防止目录穿越
    let filePath = join(ROOT, pathname);

    if (await exists(filePath)) {
      const st = await stat(filePath);
      if (st.isDirectory()) filePath = join(filePath, 'index.html');
    } else if (await exists(`${filePath}.html`)) {
      filePath = `${filePath}.html`;
    } else if (await exists(join(filePath, 'index.html'))) {
      filePath = join(filePath, 'index.html');
    } else {
      // 与 nginx 的 404 行为一致
      const notFound = join(ROOT, '404.html');
      const body = (await exists(notFound)) ? await readFile(notFound) : Buffer.from('404 Not Found');
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 ' + String(e));
  }
}).listen(PORT, () => {
  console.log(`✅ 静态产物预览：http://localhost:${PORT}  (root: ${ROOT})`);
});
