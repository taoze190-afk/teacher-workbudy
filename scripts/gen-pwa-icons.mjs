// 生成 PWA 图标（纯 Node，无第三方依赖：自写 PNG 编码 + 4x 超采样抗锯齿）
//   用法：node scripts/gen-pwa-icons.mjs
// 产出（全部落在 public/，构建后即站点根目录下可直接访问）：
//   public/icons/icon-192.png          any        普通图标 192
//   public/icons/icon-512.png          any        普通图标 512
//   public/icons/icon-maskable-512.png maskable   Android 自适应图标（内容缩到安全区）
//   public/icons/apple-touch-icon.png  180        iOS 主屏图标（不透明、满幅）
//   public/favicon.ico                 48         浏览器标签页图标（ICO 内嵌 PNG）
//
// 图案＝工作台顶栏 logo 的同款「学士帽」，底色用品牌青瓷渐变（brand-400 → brand-700）
import zlib from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, '..', 'public');

/* ---------------- PNG 编码 ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 几何工具 ---------------- */
const inRoundedRect = (x, y, r) => {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if (x === cx || y === cy) return true;
  return Math.hypot(x - cx, y - cy) <= r;
};

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const segDist = (x, y, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
};

const lerp = (a, b, t) => a + (b - a) * t;

/* 学士帽：几何按 0..1 坐标定义，再整体缩放/平移 */
function makeCap(scale) {
  const cx = 0.5;
  const cy = 0.45; // 帽体视觉中心（略高于画布中心，给流苏留空间）
  const to = (x, y) => [cx + (x - cx) * scale, cy + (y - cy) * scale];

  // 帽板：菱形
  const board = [
    [0.5, 0.245],
    [0.815, 0.395],
    [0.5, 0.545],
    [0.185, 0.395],
  ].map(([x, y]) => to(x, y));

  // 帽身：上沿平、下沿外凸的弧形
  const body = [to(0.295, 0.435)];
  const SEG = 16;
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    body.push(to(0.31 + 0.38 * u, 0.6 + 0.055 * Math.sin(Math.PI * u)));
  }
  body.push(to(0.705, 0.435));

  // 流苏：帽板右下角垂下的细绳 + 末端小坠
  const cord = to(0.815, 0.395);
  const cordEnd = to(0.858, 0.583);
  const bead = to(0.858, 0.615);
  const beadR = 0.032 * scale;
  const cordR = 0.012 * scale;

  return (x, y) =>
    inPoly(x, y, board) ||
    inPoly(x, y, body) ||
    segDist(x, y, cord[0], cord[1], cordEnd[0], cordEnd[1]) <= cordR ||
    Math.hypot(x - bead[0], y - bead[1]) <= beadR;
}

/* ---------------- 渲染 ---------------- */
const C0 = [0x6e, 0xc4, 0xc1]; // 渐变起：亮青瓷
const C1 = [0x24, 0x6b, 0x68]; // 渐变止：深青瓷

function render(size, { radius = 0.225, capScale = 1 } = {}) {
  const SS = size <= 256 ? 4 : 3; // 超采样倍数
  const W = size * SS;
  const out = Buffer.alloc(size * size * 4);
  const cap = makeCap(capScale);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) / W;
          const y = (py * SS + sy + 0.5) / W;
          if (!inRoundedRect(x, y, radius)) continue; // 圆角外：透明
          let r, g, b;
          if (cap(x, y)) {
            r = 255;
            g = 255;
            b = 255;
          } else {
            const t = Math.min(1, Math.max(0, (x + y) / 2));
            r = Math.round(lerp(C0[0], C1[0], t));
            g = Math.round(lerp(C0[1], C1[1], t));
            b = Math.round(lerp(C0[2], C1[2], t));
          }
          sumR += r;
          sumG += g;
          sumB += b;
          sumA += 255;
        }
      }
      const n = SS * SS;
      const a = sumA / n;
      const i = (py * size + px) * 4;
      if (a === 0) continue;
      // 反预乘：以覆盖率为权重还原平均颜色，得到边缘抗锯齿
      const cov = sumA / 255;
      out[i] = Math.round(sumR / cov);
      out[i + 1] = Math.round(sumG / cov);
      out[i + 2] = Math.round(sumB / cov);
      out[i + 3] = Math.round(a);
    }
  }
  return encodePNG(size, size, out);
}

/* ICO（内嵌 PNG，Vista+ 通用格式） */
function wrapICO(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // 1 image
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

/* ---------------- 自检：解码回来抽查像素 ---------------- */
function decodePNG(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = (x, y) => {
    const i = y * (stride + 1) + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };
  return { width, height, px };
}

/* ---------------- 主流程 ---------------- */
await mkdir(join(PUBLIC, 'icons'), { recursive: true });

const jobs = [
  ['icons/icon-192.png', render(192, { radius: 0.225, capScale: 1 }), true],
  ['icons/icon-512.png', render(512, { radius: 0.225, capScale: 1 }), true],
  ['icons/icon-maskable-512.png', render(512, { radius: 0, capScale: 0.62 }), false],
  ['icons/apple-touch-icon.png', render(180, { radius: 0, capScale: 0.78 }), false],
  ['favicon.ico', wrapICO(render(48, { radius: 0.225, capScale: 1 }), 48), true],
];

for (const [rel, buf] of jobs) {
  await writeFile(join(PUBLIC, rel), buf);
}

// 自检：解码回来抽查像素（圆角图标四角应透明；maskable/iOS 图标必须满幅不透明）
let ok = true;
const report = [];
for (const [rel, buf, expectRounded] of jobs) {
  if (rel.endsWith('.ico')) {
    report.push(`${rel.padEnd(32)} ${(buf.length / 1024).toFixed(1)} KB  (ICO 内嵌 48x48 PNG)`);
    continue;
  }
  const { width, height, px } = decodePNG(buf);
  const corner = px(0, 0);
  const center = px(Math.floor(width / 2), Math.floor(height * 0.42));
  const bottomMid = px(Math.floor(width / 2), height - 3);
  const centerIsWhite = center[0] > 230 && center[1] > 230 && center[2] > 230;
  const cornerOk = expectRounded ? corner[3] === 0 : corner[3] === 255;
  const opaqueBottom = bottomMid[3] === 255;
  if (width !== height || !centerIsWhite || !cornerOk || !opaqueBottom) ok = false;
  report.push(
    `${rel.padEnd(32)} ${width}x${height}  ${(buf.length / 1024).toFixed(1)} KB  ` +
      `角透明度=${corner[3]}${expectRounded ? '(期望0)' : '(期望255)'} 中心=${center.slice(0, 3).join(',')} 底边透明度=${bottomMid[3]}`
  );
}

console.log('🎨 PWA 图标已生成：');
for (const line of report) console.log('   ' + line);
console.log(ok ? '   ✅ 自检通过（尺寸正确 / 图形为白色学士帽 / 圆角或满幅符合预期）' : '   ❌ 自检未通过');
if (!ok) process.exit(1);
