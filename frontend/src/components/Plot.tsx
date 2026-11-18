import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from './ui';
import { useTheme } from '../lib/theme';

// Plotly is loaded once from /plotly-basic.min.js (MIT) as window.Plotly.
declare global { interface Window { Plotly: any } }

/* Derm Agents chart palette: sky blue and dark green lead, then their tints and slate.
   Fixed order, never cycled. */
export const SKY = '#38BDF8';
export const GREEN = '#166534';
export const SERIES = [SKY, GREEN, '#0369A1', '#4ADE80', '#64748B', '#7DD3FC', '#15803D', '#94A3B8'];
export const SEQ = SKY;
export const MUTED = '#CBD5E1';

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';
const PALETTES = {
  light: { grid: '#F1F5F9', line: '#E2E8F0', tick: '#64748B', text: '#475569', legend: '#334155', tipBg: '#FFFFFF', tipBorder: '#E2E8F0', tipText: '#0F172A' },
  dark: { grid: '#383A40', line: '#4E5058', tick: '#949BA4', text: '#B5BAC1', legend: '#DBDEE1', tipBg: '#111214', tipBorder: '#3F4147', tipText: '#F2F3F5' },
};
/* In dark mode, colours that are too dim on graphite are swapped for brighter siblings. */
const DARK_SWAP: Record<string, string> = { '#CBD5E1': '#4E5058', '#166534': '#2DC770', '#0369A1': '#0EA5E9', '#64748B': '#949BA4', '#94A3B8': '#80848E', '#15803D': '#57D98A' };

function baseLayout(theme: 'light' | 'dark') {
  const c = PALETTES[theme];
  const axis = { gridcolor: c.grid, zerolinecolor: c.line, linecolor: c.line, tickcolor: c.line, automargin: true,
    tickfont: { size: 11.5, color: c.tick }, title: { font: { size: 12, color: c.tick } } };
  return {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: FONT, color: c.text, size: 12 },
    margin: { l: 56, r: 16, t: 12, b: 48 },
    xaxis: axis, yaxis: axis,
    legend: { orientation: 'h', y: -0.24, x: 0, font: { size: 12, color: c.legend } },
    hoverlabel: { bgcolor: c.tipBg, bordercolor: c.tipBorder, font: { color: c.tipText, family: FONT, size: 12 } },
    bargap: 0.32,
  };
}

function merge(a: any, b: any): any {
  const out = { ...a };
  for (const k of Object.keys(b || {})) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return out;
}

export function Plot({ data, layout, height = 300, className, ariaLabel }: { data: any[]; layout?: any; height?: number; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!!window.Plotly);
  const theme = useTheme();
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => { if (window.Plotly) { setReady(true); clearInterval(id); } }, 100);
    return () => clearInterval(id);
  }, [ready]);
  useEffect(() => {
    if (!ready || !ref.current) return;
    // deep-clone: Plotly writes auto-detected axis types back into the layout object
    let json = JSON.stringify(data);
    if (theme === 'dark') for (const [a, b] of Object.entries(DARK_SWAP)) json = json.split(`"${a}"`).join(`"${b}"`);
    window.Plotly.react(ref.current, JSON.parse(json), merge(baseLayout(theme), JSON.parse(JSON.stringify({ height, ...layout }))),
      { displayModeBar: false, responsive: true, scrollZoom: false });
  }, [ready, data, layout, height, theme]);
  useEffect(() => {
    const el = ref.current;
    return () => { if (el && window.Plotly) window.Plotly.purge(el); };
  }, []);
  return (
    <div className={`relative min-w-0 w-full ${className || ''}`} style={{ minHeight: height }}>
      {!ready && <Skeleton className="absolute inset-0" />}
      <div ref={ref} role="img" aria-label={ariaLabel} className={ready ? 'w-full animate-fade-up' : 'w-full opacity-0'} style={{ minHeight: height }} />
    </div>
  );
}
