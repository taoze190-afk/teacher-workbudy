/**
 * 图表统一视觉（参照 DeepSeek 的克制风格）
 *
 * 为什么不用 ECharts 内置的 'dark' 主题：它的默认配色是红/绿/蓝/黄的彩虹色系，
 * 一个图里塞五六种高饱和颜色，既花又难看出主次；而且它写死了深色底，
 * 浅色主题下文字和配色完全不搭。这里自己注册两套主题，深浅各自适配。
 */

/** 多系列通用色板：品牌蓝打头，其余为邻近色 / 低饱和辅助色，避免彩虹感 */
export const CHART_PALETTE = [
  '#4d6bfe', // 品牌蓝（主）
  '#34d399', // 绿松（正向）
  '#fbbf24', // 琥珀（提示）
  '#a78bfa', // 紫
  '#22d3ee', // 青
  '#fb7185', // 玫瑰（负向）
  '#94a3b8', // 中性灰
];

/** 分数段（不及格 → 优秀）：暖到冷表示由弱到强，但饱和度整体压一档，不再刺眼 */
export const SCORE_BAND_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#60a5fa', '#34d399'];

/** 语义色：一个指标固定一种颜色，全站一致 */
export const CHART_INK = {
  primary: '#4d6bfe',
  primarySoft: 'rgba(77,107,254,.12)',
  positive: '#34d399',
  positiveSoft: 'rgba(52,211,153,.16)',
  warn: '#fbbf24',
  warnSoft: 'rgba(251,191,36,.16)',
  danger: '#fb7185',
  dangerSoft: 'rgba(251,113,133,.16)',
  neutral: '#94a3b8',
};

export type ChartMode = 'dark' | 'light';

export function chartTheme(mode: ChartMode) {
  const dark = mode === 'dark';
  const axisLine = dark ? 'rgba(255,255,255,.22)' : '#e2e8f0';
  const label = dark ? '#a3a3a3' : '#6b7280';
  const split = dark ? 'rgba(255,255,255,.07)' : '#eff2f6';
  const ink = dark ? '#e5e7eb' : '#111827';

  return {
    color: CHART_PALETTE,
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      color: dark ? '#d4d4d4' : '#374151',
      fontSize: 11,
    },
    title: {
      textStyle: { color: ink, fontSize: 12, fontWeight: 600 },
    },
    legend: {
      textStyle: { color: label, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      icon: 'roundRect',
    },
    // 类目轴：只留一条极淡基线，刻度一律不要
    categoryAxis: {
      axisLine: { show: true, lineStyle: { color: axisLine } },
      axisTick: { show: false },
      axisLabel: { color: label, fontSize: 11, margin: 8 },
      splitLine: { show: false },
    },
    // 数值轴：不画轴线，只靠极淡的水平网格读数
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: label, fontSize: 11 },
      splitLine: { show: true, lineStyle: { color: split, type: 'solid' } },
      splitNumber: 4,
    },
    grid: { left: 8, right: 12, top: 24, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: dark ? '#2a2a2a' : '#ffffff',
      borderWidth: 0,
      padding: [8, 10],
      textStyle: { color: ink, fontSize: 12 },
      extraCssText: dark
        ? 'border-radius:8px; box-shadow:0 12px 32px -12px rgba(0,0,0,.75);'
        : 'border-radius:8px; box-shadow:0 12px 32px -14px rgba(15,23,42,.28); border:1px solid #eef1f5;',
      axisPointer: {
        type: 'line',
        lineStyle: { color: dark ? 'rgba(255,255,255,.18)' : '#e2e8f0' },
      },
    },
    // 折线：平滑 + 小圆点，线宽统一 2
    line: {
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2 },
    },
    // 柱状：顶部圆角，看起来更柔和
    bar: {
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 28,
    },
    radar: {
      axisName: { color: label, fontSize: 11 },
      axisLine: { lineStyle: { color: split } },
      splitLine: { lineStyle: { color: split } },
      splitArea: { show: false },
    },
    // 饼/环：不要一边粗一边细的描边
    pie: {
      itemStyle: { borderWidth: 2, borderColor: dark ? '#212121' : '#ffffff' },
    },
  };
}
