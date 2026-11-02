import React, { ReactNode, useEffect, useState } from 'react';
import {
  LuBookOpen, LuBuilding2, LuFileChartColumn, LuGitCompareArrows, LuHistory, LuHouse, LuInfo,
  LuLayoutDashboard, LuMenu, LuNetwork, LuScanSearch, LuStar, LuUserPlus, LuWorkflow, LuX,
} from 'react-icons/lu';
import { api } from '../lib/api';
import { cx } from './ui';

export const NAV = [
  { path: '/', label: 'Home', icon: LuHouse, group: 'Overview' },
  { path: '/dashboard', label: 'Dashboard', icon: LuLayoutDashboard, group: 'Overview' },
  { path: '/register', label: 'Patient Registration', icon: LuUserPlus, group: 'Care' },
  { path: '/diagnosis', label: 'AI Skin Diagnosis', icon: LuScanSearch, group: 'Care' },
  { path: '/agents', label: 'Multi-Agent Workflow', icon: LuWorkflow, group: 'Care' },
  { path: '/cases', label: 'Case History', icon: LuHistory, group: 'Care' },
  { path: '/simulation', label: 'Clinic Simulation', icon: LuBuilding2, group: 'Research' },
  { path: '/scenarios', label: 'Scenario Comparison', icon: LuGitCompareArrows, group: 'Research' },
  { path: '/knowledge-graph', label: 'Knowledge Graph', icon: LuNetwork, group: 'Knowledge' },
  { path: '/rag', label: 'RAG Knowledge Base', icon: LuBookOpen, group: 'Knowledge' },
  { path: '/reports', label: 'Reports & Analytics', icon: LuFileChartColumn, group: 'Knowledge' },
  { path: '/about', label: 'Project Information', icon: LuInfo, group: 'Knowledge' },
];

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-[12px] bg-ink-900 shadow-[0_6px_16px_-6px_rgba(17,26,48,.6)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} aria-hidden>
        <circle cx="16" cy="8" r="3.6" fill="#c9f27a" />
        <circle cx="8.5" cy="15.5" r="3.6" fill="#9be7ff" />
        <circle cx="23.5" cy="15.5" r="3.6" fill="#9be7ff" />
        <rect x="9" y="20" width="14" height="7.5" rx="3.75" fill="#ffffff" />
      </svg>
    </span>
  );
}

export function Logo() {
  return (
    <a href="#/" className="flex items-center gap-3" aria-label="DermaAgents home">
      <LogoMark />
      <span className="font-display text-[28px] leading-none text-ink-900">DermaAgents</span>
    </a>
  );
}

function Status() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [llm, setLlm] = useState(false);
  useEffect(() => {
    const f = () => api.get('/api/health').then((h) => { setOk(h.model_loaded); setLlm(h.llm_configured); }).catch(() => setOk(false));
    f(); const id = setInterval(f, 30000); return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden md:flex items-center gap-2">
      <span className="chip bg-white border border-ink-200 text-ink-700">
        <span className={cx('size-2 rounded-full', ok === null ? 'bg-ink-300' : ok ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.18)]' : 'bg-rose-500')} />
        {ok === null ? 'Connecting' : ok ? 'Model online' : 'Backend offline'}
      </span>
      <span className="chip bg-white border border-ink-200 text-ink-700 hidden lg:inline-flex">{llm ? 'LLM reasoning' : 'Rule-based reasoning'}</span>
    </div>
  );
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  const current = NAV.find((n) => n.path === route) || NAV[0];
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <div className="min-h-screen lg:p-4">
      <div className="lg:min-h-[calc(100vh-2rem)] lg:rounded-[30px] lg:bg-white/45 lg:border lg:border-white/80 lg:backdrop-blur-xl lg:shadow-[0_30px_80px_-40px_rgba(30,64,130,.45)] lg:flex">
        {/* sidebar */}
        <aside className={cx('fixed lg:sticky top-0 lg:top-4 z-40 h-screen lg:h-[calc(100vh-2rem)] w-72 shrink-0 flex flex-col bg-white/90 lg:bg-transparent backdrop-blur-xl border-r border-ink-200/70 lg:border-white/70 transition-transform duration-300 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center justify-between px-6 h-20">
            <Logo />
            <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(false)} aria-label="Close menu"><LuX /></button>
          </div>
          <nav className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4" aria-label="Main">
            {groups.map((g) => (
              <div key={g} className="mb-4">
                <div className="px-3 mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-400">{g}</div>
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = n.path === route;
                  const Icon = n.icon;
                  return (
                    <a key={n.path} href={`#${n.path}`} aria-current={active ? 'page' : undefined}
                      className={cx('group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] transition-all',
                        active ? 'bg-gradient-to-r from-[#e9fbbf] to-[#c6f3ff] text-ink-900 font-medium shadow-[0_6px_18px_-10px_rgba(60,150,170,.6)]' : 'text-ink-700 hover:bg-white/80 hover:text-ink-900')}>
                      <Icon className={cx('size-[18px] shrink-0', active ? 'text-ink-900' : 'text-ink-500 group-hover:text-ink-900')} />
                      {n.label}
                    </a>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="m-4 rounded-2xl bg-ink-900 p-4 text-white relative overflow-hidden">
            <div className="absolute inset-0 dot-grid opacity-25" />
            <div className="relative">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-white/60">Designed & developed by</div>
              <div className="font-display text-2xl mt-1">Ali Raza</div>
              <div className="text-[11.5px] text-white/60 mt-0.5">University of Central Punjab · AG2</div>
            </div>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 lg:top-4 z-20 mx-0 lg:mx-4 lg:mt-4 h-16 flex items-center justify-between gap-4 px-4 md:px-6 bg-white/80 lg:rounded-2xl backdrop-blur-xl border-b lg:border border-ink-200/70 lg:border-white">
            <div className="flex items-center gap-3 min-w-0">
              <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(true)} aria-label="Open menu"><LuMenu /></button>
              <span className="hidden sm:inline text-sm text-ink-400">DermaAgents</span>
              <span className="hidden sm:inline text-ink-300">/</span>
              <span className="text-[15px] font-medium text-ink-900 truncate">{current.label}</span>
              <LuStar className="text-ink-300 shrink-0" aria-hidden />
            </div>
            <div className="flex items-center gap-2">
              <Status />
              <a href="#/diagnosis" className="btn-primary !py-2 !px-4 hidden sm:inline-flex"><LuScanSearch /> New scan</a>
            </div>
          </header>
          <main className="flex-1 px-4 md:px-8 lg:px-10 py-8 max-w-[1480px] w-full mx-auto">{children}</main>
          <footer className="px-4 md:px-8 lg:px-10 py-6 text-xs text-ink-500 flex flex-col md:flex-row gap-2 md:items-center md:justify-between max-w-[1480px] w-full mx-auto">
            <span>Designed and Developed by <span className="text-ink-900 font-medium">ALI RAZA</span> · DermaAgents © 2026 · University of Central Punjab</span>
            <span>Decision support for academic research — not a diagnosis. Synthetic patients only.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
