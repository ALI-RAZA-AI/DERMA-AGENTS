import React, { useEffect, useRef, useState } from 'react';

// Plotly is loaded once from /plotly-basic.min.js (MIT) as window.Plotly.
declare global { interface Window { Plotly: any } }

// validated categorical palette (dark-surface steps) - fixed order, never cycled
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SEQ = '#2a78d6';
export const MUTED = '#c3cbd8';

const baseLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, system-ui, sans-serif', color: '#586378', size: 12 },
  margin: { l: 56, r: 16, t: 16, b: 48 },
  xaxis: { gridcolor: 'rgba(17,26,48,0.06)', zerolinecolor: 'rgba(17,26,48,0.14)', linecolor: 'rgba(17,26,48,0.14)', automargin: true },
  yaxis: { gridcolor: 'rgba(17,26,48,0.06)', zerolinecolor: 'rgba(17,26,48,0.14)', linecolor: 'rgba(17,26,48,0.14)', automargin: true },
  legend: { orientation: 'h', y: -0.22, font: { size: 11 } },
  hoverlabel: { bgcolor: '#111a30', bordercolor: '#111a30', font: { color: '#ffffff', family: 'Inter' } },
  bargap: 0.28,
};

function merge(a: any, b: any): any {
  const out = { ...a };
  for (const k of Object.keys(b || {})) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return out;
}

export function Plot({ data, layout, height = 300, className, ariaLabel }: { data: any[]; layout?: any; height?: number; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!!window.Plotly);
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => { if (window.Plotly) { setReady(true); clearInterval(id); } }, 100);
    return () => clearInterval(id);
  }, [ready]);
  useEffect(() => {
    if (!ready || !ref.current) return;
    // deep-clone: Plotly writes auto-detected axis types back into the layout object
    window.Plotly.react(ref.current, data, merge(JSON.parse(JSON.stringify(baseLayout)), JSON.parse(JSON.stringify({ height, ...layout }))), { displayModeBar: false, responsive: true });
  }, [ready, data, layout, height]);
  useEffect(() => () => { if (ref.current && window.Plotly) window.Plotly.purge(ref.current); }, []);
  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ minHeight: height }} />;
}
