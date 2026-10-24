// 请假条 OCR 识别（tesseract.js，中文模型，浏览器端运行）
// 首次使用会从 CDN 下载语言模型（约 10MB），之后有缓存

export async function ocrImage(file: File): Promise<string> {
  const Tesseract = (await import('tesseract.js')).default;
  const worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(file);
    return (data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}

// 从 OCR 文本中粗提取请假关键信息
export function parseLeaveFromText(text: string): { type?: string; name?: string; reason?: string } {
  let type: string | undefined;
  if (/病/.test(text)) type = '病假';
  else if (/事/.test(text)) type = '事假';
  else if (/公/.test(text)) type = '公假';
  const m = text.match(/[\u4e00-\u9fa5]{2,4}(?=同学|请假|因)/);
  return { type, name: m?.[0], reason: text.slice(0, 120) };
}
