import { useEffect, useState } from 'react';

export interface ChartTheme {
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  border: string;
  muted:  string;
  fg:     string;
}

function readTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim() || '#888';
  return {
    chart1: v('--color-chart-1'),
    chart2: v('--color-chart-2'),
    chart3: v('--color-chart-3'),
    chart4: v('--color-chart-4'),
    chart5: v('--color-chart-5'),
    border: v('--color-border'),
    muted:  v('--color-muted-fg'),
    fg:     v('--color-foreground'),
  };
}

/**
 * Returns Recharts-friendly color strings derived from CSS custom properties.
 * Re-reads when the `.dark` class is toggled on <html>.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() =>
    typeof window !== 'undefined' ? readTheme() : {
      chart1: '#3b82f6', chart2: '#10b981', chart3: '#8b5cf6',
      chart4: '#f59e0b', chart5: '#ef4444',
      border: '#e2e8f0', muted: '#64748b', fg: '#0f172a',
    },
  );

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
