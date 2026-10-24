// 成绩排名计算 —— 成绩页「排名」与打印中心「成绩总表 / 奖状」共用同一份算法，
// 避免两处口径不一致（一处按总分、一处按折合，名次对不上就麻烦了）。
import type { ExamSubject, Student } from '@/lib/types';
import { compareStudentNo } from '@/lib/utils';

export interface RankRow {
  id: string;
  name: string;
  no: string;
  /** 科目 → 分数；null 表示缺考或未录入 */
  per: Record<string, number | null>;
  absent: string[];
  blank: string[];
  /** 总分（各科原始分相加，缺考按 0 计） */
  total: number;
  /** 折合均分（各科 ÷ 满分 × 100 后取平均） */
  pct: number | null;
  rank: number;
}

/** 排序口径：总分 / 折合均分 / 某一单科 */
export type RankSort = 'total' | 'pct' | string; // 单科写成 `sub:语文`

/** 录入页的本地分数映射（`${studentId}|${subject}` → 文本）→ 本模块输入 */
export function scoresFromGradeMap(
  gradeMap: Record<string, Record<string, number | string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [sid, bag] of Object.entries(gradeMap)) {
    for (const [subject, v] of Object.entries(bag)) {
      out[`${sid}|${subject}`] = v === '缺考' ? '缺考' : String(v);
    }
  }
  return out;
}

const sortValue = (r: RankRow, by: RankSort): number => {
  if (by.startsWith('sub:')) return r.per[by.slice(4)] ?? -1;
  if (by === 'pct') return r.pct ?? -1;
  return r.total;
};

export function computeRanking(
  students: Pick<Student, 'id' | 'name' | 'student_no'>[],
  subjects: ExamSubject[],
  scores: Record<string, string>,
  sortBy: RankSort = 'total'
): RankRow[] {
  const list: RankRow[] = students.map((s) => {
    const per: Record<string, number | null> = {};
    const absent: string[] = [];
    const blank: string[] = [];
    let total = 0;
    let sumPct = 0;
    let nPct = 0;
    for (const sub of subjects) {
      const raw = scores[`${s.id}|${sub.subject}`];
      if (raw === '缺考') {
        per[sub.subject] = null;
        absent.push(sub.subject);
        continue;
      }
      const num = raw ? Number(raw) : NaN;
      if (!raw || !Number.isFinite(num)) {
        per[sub.subject] = null;
        blank.push(sub.subject);
        continue;
      }
      per[sub.subject] = num;
      total += num;
      const full = Number(sub.full_score) || 0;
      if (full > 0) {
        sumPct += (num / full) * 100;
        nPct += 1;
      }
    }
    return {
      id: s.id,
      name: s.name,
      no: s.student_no,
      per,
      absent,
      blank,
      total: Math.round(total * 10) / 10,
      pct: nPct > 0 ? Math.round((sumPct / nPct) * 10) / 10 : null,
      rank: 0,
    };
  });

  const sorted = [...list].sort(
    (a, b) => sortValue(b, sortBy) - sortValue(a, sortBy) || compareStudentNo(a.no, b.no)
  );
  // 并列同名次（1,2,2,4 式）
  let lastVal: number | null = null;
  let lastRank = 0;
  sorted.forEach((r, i) => {
    const v = sortValue(r, sortBy);
    if (lastVal !== null && v === lastVal) {
      r.rank = lastRank;
    } else {
      r.rank = i + 1;
      lastRank = r.rank;
      lastVal = v;
    }
  });
  return sorted;
}
