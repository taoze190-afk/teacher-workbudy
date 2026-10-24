// 备课教案 → 课堂生成提示词
// 用途：把教案内容拼成一段可直接粘贴到 OpenMAIC（open.maic.chat）的提示词，
// 让 AI 按这节课的学习目标、重难点和环节编排生成"多智能体互动课堂"。
// 注意：只使用课文与教案文本，不带学生任何个人信息。
import type { LessonPlan, LessonPlanContent } from '@/lib/types';

export interface ClassroomPromptOptions {
  /** 生成侧重：互动课件 / 随堂测验 / 两者都要（默认两者都要） */
  focus?: '课件' | '测验' | '两者';
  /** 时长（分钟），默认沿用教案里的课时时长 */
  minutes?: number;
}

function list(items: string[], prefix = '- '): string {
  const kept = items.map((s) => (s ?? '').trim()).filter(Boolean);
  return kept.length > 0 ? kept.map((s) => prefix + s).join('\n') : '（未填写）';
}

export function buildClassroomPrompt(
  plan: Pick<LessonPlan, 'lesson_title' | 'grade' | 'textbook' | 'content'>,
  opts: ClassroomPromptOptions = {}
): string {
  const c: LessonPlanContent | null | undefined = plan.content;
  const focus = opts.focus ?? '两者';
  const minutes = opts.minutes ?? (Number(String(c?.meta?.duration ?? '').replace(/\D/g, '')) || 45);

  const goals = (c?.goals ?? [])
    .filter((g) => (g.content ?? '').trim())
    .map((g) => `${g.dimension}：${g.content.trim()}`);

  const steps = (c?.process ?? [])
    .filter((s) => (s.step ?? '').trim())
    .map(
      (s, i) =>
        `${i + 1}. ${s.step}（${(s.duration ?? '').trim() || '约5分钟'}）\n` +
        `   - 教师：${(s.teacherActivity ?? '').trim() || '—'}\n` +
        `   - 学生：${(s.studentActivity ?? '').trim() || '—'}\n` +
        `   - 设计意图：${(s.intent ?? '').trim() || '—'}`
    );

  const focusLines: string[] = [];
  if (focus === '课件' || focus === '两者') {
    focusLines.push(
      '① 一套能在大屏上直接播放的**交互式课件**：幻灯片为主，并在合适环节插入交互式演示（如地图定位、时间线、文本结构/思维导图、对比表格、可点击的词句卡片）——形式上挑最适合这节课内容的，不要为了炫技硬塞'
    );
  }
  if (focus === '测验' || focus === '两者') {
    focusLines.push(
      '② 结尾安排一组**随堂测验**（6~8 题，选择题为主，覆盖本课重点字词与核心理解），给出正确答案与一句话解析，便于课堂上快速核对'
    );
  }

  return [
    `请为下面这节课生成一个「多智能体互动课堂」（AI 老师讲授 + AI 同学参与讨论，面向初中生）。`,
    '',
    '【基本信息】',
    `年级：${plan.grade || c?.meta?.grade || '（未填写）'}`,
    `教材：${plan.textbook || c?.meta?.textbook || '（未填写）'}`,
    `课题：${(c?.meta?.lesson || plan.lesson_title || '').trim()}`,
    `课型/课时：${(c?.meta?.period ?? '').trim() || '新授课'}`,
    `时长：${minutes} 分钟`,
    '',
    '【学习目标】',
    list(goals, ''),
    '',
    '【教学重点】',
    list(c?.keyPoints ?? []),
    '',
    '【教学难点】',
    list(c?.difficulties ?? []),
    '',
    '【课堂主问题】（请围绕这些主问题组织 AI 同学的观点与讨论）',
    list(c?.questions ?? [], ''),
    '',
    '【课堂环节】（请按这个节奏编排课堂，不要打乱顺序）',
    steps.length > 0 ? steps.join('\n') : '（未填写）',
    '',
    '【板书设计】',
    (c?.boardDesign ?? '').trim() || '（未填写）',
    '',
    '【作业】',
    `基础：${(c?.homework?.base ?? '').trim() || '—'}`,
    `拓展：${(c?.homework?.extended ?? '').trim() || '—'}`,
    '',
    '【生成要求】',
    ...focusLines,
    '③ 安排至少一个 **AI 同学参与讨论/辩论**的环节（围绕上面的课堂主问题），并给出 2~3 个立场不同的观点，供课堂上比较、辨析',
    '④ 语言要口语化、有画面感，符合初中生的理解水平；涉及价值观的表述必须稳妥、符合中学课堂要求',
    '⑤ 生成完成后，请提供**可导出的课件（.pptx）**，如果支持，再给一个**离线课堂包**（教室里网络不好时也能放）',
  ].join('\n');
}

/** 复制到剪贴板（非安全上下文时退化为 textarea + execCommand） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 继续走兜底 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
