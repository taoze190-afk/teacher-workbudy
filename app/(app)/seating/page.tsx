'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageDown, Lock, LockOpen, RefreshCw, Save, Shuffle, Wand2 } from 'lucide-react';
import { useClass } from '@/components/AppShell';
import { getSupabase, audit } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Seat, Student } from '@/lib/types';
import { Badge, Button, Card, Confirm, Loading, PageHeader, Select } from '@/components/ui';
import { cn, today, compareStudentNo } from '@/lib/utils';

type Grid = Record<string, { studentId: string | null; locked: boolean }>;

const key = (r: number, c: number) => `${r}-${c}`;

export default function SeatingPage() {
  const { currentClassId, settings, refresh } = useClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [grid, setGrid] = useState<Grid>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = settings?.seating_rows ?? 8;
  const cols = settings?.seating_cols ?? 7;
  const aisle = settings?.aisle_after ?? 0; // 0 = 无过道

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const saveAisle = async (n: number) => {
    const { data: u } = await getSupabase().auth.getUser();
    if (!u.user) return;
    await getSupabase().from('app_settings').upsert({
      user_id: u.user.id,
      current_class_id: currentClassId,
      seating_rows: rows,
      seating_cols: cols,
      aisle_after: n,
      mask_phone: settings?.mask_phone ?? true,
      weekly_backup_reminder: settings?.weekly_backup_reminder ?? true,
    });
    toast(n > 0 ? `过道已设在第 ${n} 列之后` : '已关闭过道');
    refresh();
  };

  useEffect(() => {
    if (!currentClassId) return;
    setLoading(true);
    const sb = getSupabase();
    (async () => {
      const [{ data: st }, { data: seats }] = await Promise.all([
        sb.from('students').select('*').eq('class_id', currentClassId).is('deleted_at', null).eq('active', true),
        sb.from('seats').select('*').eq('class_id', currentClassId),
      ]);
      const g: Grid = {};
      for (let r = 1; r <= (settings?.seating_rows ?? 8); r++) {
        for (let c = 1; c <= (settings?.seating_cols ?? 7); c++) {
          g[key(r, c)] = { studentId: null, locked: false };
        }
      }
      for (const s of (seats ?? []) as Seat[]) {
        g[key(s.seat_row, s.seat_col)] = {
          studentId: s.student_id ?? null,
          locked: s.locked,
        };
      }
      setGrid(g);
      setStudents([...(((st ?? []) as unknown as Student[]))].sort((a, b) => compareStudentNo(a.student_no, b.student_no)));
      setLoading(false);
    })();
  }, [currentClassId, tick, settings?.seating_rows, settings?.seating_cols]);

  const studentById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const moveStudent = (studentId: string, targetKey: string) => {
    if (!grid[targetKey]) return;
    if (grid[targetKey].locked) return;
    setGrid((prev) => {
      const next = { ...prev };
      // 找到学生当前位置
      let fromKey: string | null = null;
      for (const k of Object.keys(next)) {
        if (next[k].studentId === studentId) {
          fromKey = k;
          break;
        }
      }
      const targetOccupant = next[targetKey].studentId;
      if (fromKey === targetKey) return prev;
      if (fromKey) next[fromKey] = { ...next[fromKey], studentId: targetOccupant }; // 交换
      next[targetKey] = { ...next[targetKey], studentId };
      return next;
    });
    setDirty(true);
  };

  const toggleLock = (k: string) => {
    setGrid((prev) => ({ ...prev, [k]: { ...prev[k], locked: !prev[k].locked } }));
    setDirty(true);
  };

  const save = async (snapshot?: boolean) => {
    if (!currentClassId) return;
    const sb = getSupabase();
    const upserts = Object.entries(grid)
      .filter(([, v]) => v.studentId || v.locked)
      .map(([k, v]) => {
        const [r, c] = k.split('-').map(Number);
        return {
          class_id: currentClassId,
          seat_row: r,
          seat_col: c,
          student_id: v.studentId,
          locked: v.locked,
        };
      });
    const { error } = await sb.from('seats').upsert(upserts, { onConflict: 'class_id,seat_row,seat_col' });
    if (error) {
      alert('保存失败：' + error.message);
      return;
    }
    if (snapshot) {
      const rowsToInsert = upserts
        .filter((u) => u.student_id)
        .map((u) => ({
          class_id: currentClassId,
          change_date: today(),
          student_id: u.student_id!,
          seat_row: u.seat_row,
          seat_col: u.seat_col,
        }));
      await sb.from('seat_history').insert(rowsToInsert);
      await audit('export', 'seat', 'snapshot');
    }
    setDirty(false);
    toast(snapshot ? '座位已保存，并记录了历史快照（seat_history）' : '座位已保存到座位表（seats）');
    refresh();
  };

  // 轮换：行列同时位移，跳过锁定座位
  const rotate = () => {
    setConfirm({
      title: '确认轮换座位？',
      message: '所有学生按"左右+前后"规则位移一位（锁定座位除外），可随后手动微调。',
      action: () => {
        setGrid((prev) => {
          const next: Grid = {};
          for (let r = 1; r <= rows; r++)
            for (let c = 1; c <= cols; c++) {
              const k = key(r, c);
              next[k] = { ...prev[k] };
            }
          // 清除非锁定
          for (const k of Object.keys(next)) {
            if (!next[k].locked) next[k] = { ...next[k], studentId: null };
          }
          // 按位移回填
          for (const k of Object.keys(prev)) {
            const cell = prev[k];
            if (!cell.studentId || cell.locked) continue;
            const [r, c] = k.split('-').map(Number);
            const tr = ((r - 1 + 1) % rows) + 1;
            const tc = ((c - 1 + 1) % cols) + 1;
            if (!next[key(tr, tc)].locked) {
              next[key(tr, tc)] = { ...next[key(tr, tc)], studentId: cell.studentId };
            } else {
              // 就近找空位
              for (let rr = 1; rr <= rows && next[key(tr, tc)].locked; rr++)
                for (let cc = 1; cc <= cols; cc++) {
                  const kk = key(rr, cc);
                  if (!next[kk].locked && !next[kk].studentId) {
                    next[kk] = { ...next[kk], studentId: cell.studentId };
                    break;
                  }
                }
            }
          }
          return next;
        });
        setDirty(true);
        setConfirm(null);
      },
    });
  };

  // 随机排座：未锁定学生全部打乱
  const randomize = () => {
    setConfirm({
      title: '随机排座？',
      message: '所有未锁定的学生将随机打乱位置，锁定座位保持不变。排完仍可拖拽细调。',
      action: () => {
        setGrid((prev) => {
          const next: Grid = {};
          const lockedIds = new Set<string>();
          for (const k of Object.keys(prev)) {
            const cell = prev[k];
            if (cell.locked && cell.studentId) {
              next[k] = { ...cell };
              lockedIds.add(cell.studentId);
            } else {
              next[k] = { studentId: null, locked: cell.locked };
            }
          }
          const pool = students.filter((s) => !lockedIds.has(s.id));
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          let idx = 0;
          for (let r = 1; r <= rows && idx < pool.length; r++) {
            for (let c = 1; c <= cols && idx < pool.length; c++) {
              const k = key(r, c);
              if (next[k].locked || next[k].studentId) continue;
              next[k] = { ...next[k], studentId: pool[idx].id };
              idx++;
            }
          }
          return next;
        });
        setDirty(true);
        setConfirm(null);
        toast('已随机打乱，可拖拽细调', 'info');
      },
    });
  };

  // 自动排座：男女交替
  const autoArrange = () => {
    setConfirm({
      title: '按男女交替自动排座？',
      message: '按姓名顺序做男女交替排列，锁定座位的学生不动。',
      action: () => {
        const ordered = [...students].sort((a, b) => (a.gender === b.gender ? a.name.localeCompare(b.name) : a.gender === '男' ? -1 : 1));
        const boys = ordered.filter((s) => s.gender === '男');
        const girls = ordered.filter((s) => s.gender === '女');
        const others = ordered.filter((s) => s.gender !== '男' && s.gender !== '女');
        const seq: Student[] = [];
        const max = Math.max(boys.length, girls.length, others.length);
        for (let i = 0; i < max; i++) {
          if (boys[i]) seq.push(boys[i]);
          if (girls[i]) seq.push(girls[i]);
          if (others[i]) seq.push(others[i]);
        }
        setGrid((prev) => {
          const next: Grid = {};
          for (let r = 1; r <= rows; r++)
            for (let c = 1; c <= cols; c++) {
              const k = key(r, c);
              // 保留锁定座位上的学生
              if (prev[k].locked && prev[k].studentId) {
                next[k] = { ...prev[k] };
              } else {
                next[k] = { studentId: null, locked: prev[k].locked };
              }
            }
          let idx = 0;
          for (let r = 1; r <= rows && idx < seq.length; r++) {
            for (let c = 1; c <= cols && idx < seq.length; c++) {
              const k = key(r, c);
              if (next[k].locked) continue;
              if (next[k].studentId) continue; // 锁定座位上的学生占用
              next[k] = { ...next[k], studentId: seq[idx].id };
              idx++;
            }
          }
          return next;
        });
        setDirty(true);
        setConfirm(null);
      },
    });
  };

  // 导出 PNG（canvas 渲染，2x DPI，过道标注 + 性别配色）
  const exportPng = () => {
    const cellW = 112,
      cellH = 58,
      pad = 20,
      aisleW = 16;
    const colX = (c: number) => pad + (c - 1) * cellW + (aisle > 0 && c > aisle ? aisleW : 0);
    const W = pad * 2 + cols * cellW + (aisle > 0 ? aisleW : 0);
    const H = pad * 2 + 30 + rows * cellH;
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    // 讲台
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(pad, pad, cols * cellW + (aisle > 0 ? aisleW : 0), 24);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('讲 台', pad + (cols * cellW + (aisle > 0 ? aisleW : 0)) / 2, pad + 16);
    // 座位
    ctx.lineWidth = 1.5;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const cell = grid[key(r, c)];
        const x = colX(c);
        const y = pad + 30 + (r - 1) * cellH;
        ctx.fillStyle = cell?.locked ? '#fef3c7' : '#ffffff';
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
        ctx.strokeStyle = '#64748b';
        ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
        if (cell?.studentId) {
          const s = studentById.get(cell.studentId);
          if (s) {
            ctx.fillStyle = s.gender === '男' ? '#2563eb' : s.gender === '女' ? '#db2777' : '#0f172a';
            ctx.font = 'bold 15px sans-serif';
            ctx.fillText(s.name, x + cellW / 2, y + 24);
            ctx.fillStyle = '#64748b';
            ctx.font = '10px sans-serif';
            ctx.fillText(`${s.student_no} ${s.gender ?? ''}`, x + cellW / 2, y + 40);
          }
        } else if (cell?.locked) {
          ctx.fillStyle = '#b45309';
          ctx.font = '15px sans-serif';
          ctx.fillText('🔒 锁定', x + cellW / 2, y + 30);
        }
      }
    }
    // 过道（可配置）
    if (aisle > 0) {
      const ax = colX(aisle) + cellW;
      ctx.fillStyle = 'rgba(148,163,184,.14)';
      ctx.fillRect(ax, pad + 30, aisleW, rows * cellH);
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(ax + aisleW / 2, pad + 30);
      ctx.lineTo(ax + aisleW / 2, pad + 30 + rows * cellH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(ax + aisleW / 2, pad + 30 + (rows * cellH) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('过 道', 0, 0);
      ctx.restore();
    }
    // 图例
    ctx.textAlign = 'left';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#2563eb';
    ctx.fillText('■ 男', pad, H - pad + 4);
    ctx.fillStyle = '#db2777';
    ctx.fillText('   ■ 女', pad + 46, H - pad + 4);
    ctx.fillStyle = '#b45309';
    ctx.fillText('   ■ 锁定', pad + 96, H - pad + 4);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `座位表-${today()}.png`;
    a.click();
    void audit('export', 'seat', 'png');
    toast('座位图已导出为 PNG（含性别配色与过道标注）');
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        emoji="🪑"
        title="座位"
        subtitle="桌面端拖拽学生到座位；触屏先点学生再点目标座位（互换）。🔒 锁定座位不参与轮换"
        color={{ chip: 'bg-cyan-500/15 text-cyan-300', soft: 'bg-cyan-500/10', text: 'text-cyan-300' }}
      >
        <Button variant="outline" size="sm" onClick={randomize}>
          <Shuffle size={14} /> 随机排座
        </Button>
        <Button variant="outline" size="sm" onClick={autoArrange}>
          <Wand2 size={14} /> 男女交替
        </Button>
        <Button variant="outline" size="sm" onClick={rotate}>
          <RefreshCw size={14} /> 轮换
        </Button>
        <Button variant="outline" size="sm" onClick={exportPng}>
          <ImageDown size={14} /> 导出图片
        </Button>
        <Button variant="outline" size="sm" onClick={() => save(true)}>
          存快照
        </Button>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
          过道
          <Select
            className="h-7 w-16 border-0 bg-transparent p-0 text-xs outline-none"
            value={String(aisle)}
            onChange={(e) => saveAisle(Number(e.target.value))}
          >
            <option value="0">无</option>
            {Array.from({ length: Math.max(cols - 1, 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                第{n}列后
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" disabled={!dirty} onClick={() => save()}>
          <Save size={14} /> 保存
        </Button>
      </PageHeader>

      <Card>
        <div className="overflow-x-auto">
          <div
            ref={gridRef}
            className="mx-auto w-max space-y-1.5 rounded-lg border border-slate-700 bg-slate-800/60 p-3"
          >
            {/* 讲台 */}
            <div className="mx-auto mb-2 flex h-8 w-1/2 items-center justify-center rounded bg-slate-700 text-xs text-slate-400">
              讲 台
            </div>
            {Array.from({ length: rows }, (_, ri) => ri + 1).map((r) => (
              <div key={r} className="flex gap-1.5">
                {Array.from({ length: cols }, (_, ci) => ci + 1).map((c) => {
                  const k = key(r, c);
                  const cell = grid[k];
                  const stu = cell?.studentId ? studentById.get(cell.studentId) : null;
                  const isSelected = selected === k;
                  const isOver = dragOver === k;
                  return (
                    <Fragment key={c}>
                      {aisle > 0 && c === aisle && (
                        <div className="mx-0.5 flex w-5 shrink-0 items-center justify-center">
                          <span className="text-[10px] font-semibold tracking-widest text-slate-500 [writing-mode:vertical-rl]">
                            过 道
                          </span>
                        </div>
                      )}
                      <div
                        key={k}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(k);
                        }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          const id = e.dataTransfer.getData('text/plain');
                          if (id) moveStudent(id, k);
                        }}
                        onClick={() => {
                          if (selected) {
                            moveStudent(selected, k);
                            setSelected(null);
                          } else if (stu) {
                            setSelected(k);
                          }
                        }}
                        className={cn(
                          'flex h-14 w-20 flex-col items-center justify-center rounded-lg border-2 text-center transition-colors sm:h-16 sm:w-24',
                          cell?.locked
                            ? 'cursor-not-allowed border-amber-300 bg-amber-500/10'
                            : 'border-slate-700 bg-slate-800',
                          isOver && !cell?.locked && 'border-brand-400 bg-brand-500/15',
                          isSelected && 'ring-2 ring-brand-500'
                        )}
                      >
                        {stu ? (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', stu.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="cursor-grab text-center active:cursor-grabbing"
                          >
                            <div
                              className={cn(
                                'text-sm font-bold sm:text-base',
                                stu.gender === '男' ? 'text-blue-300' : stu.gender === '女' ? 'text-pink-500' : 'text-slate-200'
                              )}
                            >
                              {stu.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {stu.student_no} {stu.gender === '男' ? '♂' : stu.gender === '女' ? '♀' : ''}
                            </div>
                          </div>
                        ) : (
                          <button
                            className="text-slate-500 hover:text-amber-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLock(k);
                            }}
                            title={cell?.locked ? '解锁' : '锁定此座位'}
                          >
                            {cell?.locked ? <Lock size={14} className="text-amber-500" /> : <LockOpen size={14} />}
                          </button>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs text-slate-400">未入座学生：</span>
          {students
            .filter((s) => !Object.values(grid).some((v) => v.studentId === s.id))
            .map((s) => (
              <Badge
                key={s.id}
                className="cursor-pointer bg-slate-700/60 text-slate-500 hover:bg-brand-500/15 hover:text-brand-300"
                >
                <span
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
                  onClick={() => setSelected(s.id)}
                >
                  {s.name}
                </span>
              </Badge>
            ))}
        </div>
      </Card>

      {confirm && (
        <Confirm
          open
          title={confirm.title}
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.action}
        />
      )}
    </div>
  );
}
