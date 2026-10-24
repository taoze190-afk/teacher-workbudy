'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { chartTheme, type ChartMode } from '@/lib/chart-theme';

let themesReady = false;
function ensureThemes() {
  if (themesReady) return;
  echarts.registerTheme('bzh-dark', chartTheme('dark'));
  echarts.registerTheme('bzh-light', chartTheme('light'));
  themesReady = true;
}

const readMode = (): ChartMode =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('light')
    ? 'light'
    : 'dark';

export default function Chart({
  option,
  height = 300,
  className,
}: {
  option: any;
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // 跟随站点深浅主题（主题类挂在 <html> 上，由 AppShell 切换）
  const [mode, setMode] = useState<ChartMode>('dark');

  useEffect(() => {
    setMode(readMode());
    const ob = new MutationObserver(() => setMode(readMode()));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => ob.disconnect();
  }, []);

  // 主题变化必须重建实例：ECharts 的主题只能在 init 时指定，不能动态切换
  useEffect(() => {
    if (!ref.current) return;
    ensureThemes();
    const chart = echarts.init(ref.current, mode === 'light' ? 'bzh-light' : 'bzh-dark');
    chartRef.current = chart;
    chart.setOption({ backgroundColor: 'transparent', ...option });

    const onResize = () => chart.resize();
    // 打印时侧栏会被隐藏、容器宽度变化，不重算的话图会被裁掉一截
    const onBeforePrint = () => chart.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeprint', onBeforePrint);
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    chartRef.current?.setOption({ backgroundColor: 'transparent', ...option }, true);
  }, [option]);

  return <div ref={ref} style={{ height }} className={className} />;
}
