// AI 评语：调用 OpenAI 兼容接口（配置仅存本机浏览器 localStorage，不外传）
export interface AiConfig {
  base: string;
  key: string;
  model: string;
}

export function getAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem('bzh_ai_config');
    if (raw) {
      const c = JSON.parse(raw);
      return { base: c.base || '', key: c.key || '', model: c.model || 'gpt-4o-mini' };
    }
  } catch {
    /* ignore */
  }
  return { base: '', key: '', model: 'gpt-4o-mini' };
}

export function saveAiConfig(c: AiConfig) {
  localStorage.setItem('bzh_ai_config', JSON.stringify(c));
}

export function hasAiConfig(): boolean {
  const c = getAiConfig();
  return Boolean(c.base && c.key);
}

export async function aiGenerate(prompt: string, system?: string): Promise<string> {
  const c = getAiConfig();
  if (!c.base || !c.key) throw new Error('尚未配置 AI 服务（设置页 → AI 评语配置）');
  const url = c.base.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
    body: JSON.stringify({
      model: c.model,
      messages: [
        { role: 'system', content: system ?? '你是一位经验丰富的初中班主任，擅长写期末评语。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI 调用失败（${res.status}）：${t.slice(0, 120)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('AI 未返回内容');
  return text.trim();
}
