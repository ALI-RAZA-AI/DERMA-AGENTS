import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  LuBookOpen, LuBuilding2, LuChevronRight, LuFileChartColumn, LuGitCompareArrows, LuHistory, LuHouse, LuInfo,
  LuLayoutDashboard, LuMenu, LuMoon, LuNetwork, LuPanelLeftClose, LuPanelLeftOpen, LuScanSearch, LuSun, LuUserPlus, LuWorkflow, LuX,
} from 'react-icons/lu';
import { setTheme, useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { cx, LiveDot } from './ui';

export const APP_NAME = 'Derm Agents';
export const APP_TAGLINE = 'AI-Powered Dermatology Agent-Based Modeling System';
export const DEVELOPER = 'Ali Raza';

/** Developer name with the brand sky-to-green gradient. */
export function DevName({ className }: { className?: string }) {
  return <span className={cx('font-semibold bg-gradient-to-r from-brand-700 to-green-700 bg-clip-text text-transparent', className)}>{DEVELOPER}</span>;
}

function Monogram({ size = 32 }: { size?: number }) {
  return (
    <span className="grid place-items-center shrink-0 rounded-full text-white font-semibold tracking-wide bg-gradient-to-br from-[#38BDF8] to-[#166534] ring-2 ring-surface shadow-[0_2px_8px_-2px_rgba(2,132,199,0.5)]"
      style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>AR</span>
  );
}

/** "Developed and designed by Ali Raza" signature card (sidebar / drawer). */
function Signature({ compact }: { compact?: boolean }) {
  if (compact) return <div className="flex justify-center py-1" title={`Developed and designed by ${DEVELOPER}`}><Monogram /></div>;
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-gradient-to-br from-brand-50 via-surface to-green-50 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Monogram />
        <div className="min-w-0 leading-tight">
          <div className="text-[11px] font-medium text-ink-500">Developed and designed by</div>
          <DevName className="text-[14.5px] tracking-[-0.01em]" />
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}
      className="relative grid place-items-center size-8 shrink-0 rounded-lg border border-ink-200 bg-surface text-ink-600 hover:text-ink-900 hover:border-ink-300 transition-colors overflow-hidden dark:border-[#4E5058] dark:bg-[#383A40] dark:text-[#FBD38D] dark:hover:bg-[#404249]">
      <LuSun className={cx('absolute size-4 transition-all duration-300', dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0')} />
      <LuMoon className={cx('absolute size-4 transition-all duration-300', dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
    </button>
  );
}

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

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span className="grid place-items-center shrink-0 rounded-[9px] bg-brand-500" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} aria-hidden>
        <circle cx="16" cy="8.5" r="3.4" fill="#0F172A" />
        <circle cx="8.5" cy="15.5" r="3.4" fill="#ffffff" />
        <circle cx="23.5" cy="15.5" r="3.4" fill="#ffffff" />
        <rect x="9" y="20.5" width="14" height="7" rx="3.5" fill="#166534" />
      </svg>
    </span>
  );
}

const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

function Status() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [llm, setLlm] = useState(false);
  useEffect(() => {
    const f = () => api.get('/api/health').then((h) => { setOk(h.model_loaded); setLlm(h.llm_configured); }).catch(() => setOk(false));
    f(); const id = setInterval(f, 30000); return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden md:flex items-center gap-2">
      <span className="chip bg-surface ring-1 ring-inset ring-ink-200 text-ink-700 dark:bg-[#232428]" title="Backend and classifier status">
        <LiveDot tone={ok === null ? 'slate' : ok ? 'green' : 'red'} active={!!ok} />
        {ok === null ? 'Connecting' : ok ? 'Model online' : 'Backend offline'}
      </span>
      <span className="chip bg-surface ring-1 ring-inset ring-ink-200 text-ink-600 hidden xl:inline-flex dark:bg-[#232428]">{llm ? 'LLM reasoning' : 'Rule-based reasoning'}</span>
    </div>
  );
}

function SidebarNav({ route, collapsed, onNavigate }: { route: string; collapsed: boolean; onNavigate?: () => void }) {
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <nav className="flex-1 min-h-0 scroll-area scrollbar-thin px-3 py-3" aria-label="Main navigation">
      {groups.map((g) => (
        <div key={g} className="mb-4 last:mb-0">
          <div className={cx('px-3 mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400 h-5 transition-opacity', collapsed && 'opacity-0')}>{g}</div>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === g).map((n) => {
              const active = n.path === route;
              const Icon = n.icon;
              return (
                <li key={n.path}>
                  <a href={`#${n.path}`} onClick={onNavigate} aria-current={active ? 'page' : undefined} title={collapsed ? n.label : undefined}
                    className={cx('group relative flex items-center gap-3 rounded-lg h-9 text-[13.5px] transition-colors duration-150',
                      collapsed ? 'justify-center px-0' : 'px-3',
                      active ? 'bg-brand-100 text-ink-900 font-semibold dark:bg-[#404249] dark:text-white' : 'text-ink-600 font-medium hover:bg-ink-100 hover:text-ink-900 dark:text-[#949BA4] dark:hover:bg-[#35373C] dark:hover:text-[#DBDEE1]')}>
                    {active && <span className="nav-active-bar absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-500" aria-hidden />}
                    <Icon className={cx('size-[18px] shrink-0 transition-colors', active ? 'text-brand-700 dark:text-[#38BDF8]' : 'text-ink-400 group-hover:text-ink-700')} />
                    {!collapsed && <span className="truncate">{n.label}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => store.get('derm.sidebar') === 'collapsed');
  const main = useRef<HTMLElement>(null);
  useEffect(() => { setOpen(false); main.current?.scrollTo({ top: 0 }); }, [route]);
  useEffect(() => { store.set('derm.sidebar', collapsed ? 'collapsed' : 'expanded'); }, [collapsed]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const current = NAV.find((n) => n.path === route) || NAV[0];

  const brand = (compact: boolean) => (
    <a href="#/" className="flex items-center gap-2.5 min-w-0" aria-label={`${APP_NAME} home`}>
      <LogoMark />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[15px] font-semibold text-ink-900 tracking-[-0.01em]">{APP_NAME}</span>
          <span className="block text-[11px] text-ink-500 truncate">Dermatology ABM platform</span>
        </span>
      )}
    </a>
  );

  return (
    <div className="h-dvh flex overflow-hidden bg-canvas">
      {/* ---------------- desktop sidebar: own scroll container */}
      <aside className={cx('hidden lg:flex flex-col shrink-0 h-full border-r border-ink-200 bg-sidebar dark:border-[#1E1F22] transition-[width] duration-200 ease-out', collapsed ? 'w-[68px]' : 'w-[248px]')}>
        <div className={cx('h-14 shrink-0 flex items-center border-b border-ink-200 dark:border-[#1E1F22] dark:shadow-[0_1px_0_rgba(0,0,0,0.2)]', collapsed ? 'justify-center px-2' : 'px-4')}>{brand(collapsed)}</div>
        <SidebarNav route={route} collapsed={collapsed} />
        <div className={cx('shrink-0 pt-2', collapsed ? 'px-2' : 'px-3')}><Signature compact={collapsed} /></div>
        <div className="shrink-0 border-t border-ink-200 dark:border-[#1E1F22] p-2 mt-2">
          <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}
            className={cx('w-full flex items-center gap-3 h-9 rounded-lg text-[13px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors', collapsed ? 'justify-center' : 'px-3')}>
            {collapsed ? <LuPanelLeftOpen className="size-[18px]" /> : <><LuPanelLeftClose className="size-[18px]" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* ---------------- mobile drawer */}
      <div className={cx('lg:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0 pointer-events-none')} onClick={() => setOpen(false)} aria-hidden />
      <aside className={cx('lg:hidden fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] flex flex-col bg-sidebar border-r border-ink-200 dark:border-[#1E1F22] shadow-xl transition-transform duration-250 ease-out', open ? 'translate-x-0' : '-translate-x-full')}
        aria-hidden={!open} {...(!open ? { inert: true } : {}) as any}>
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-ink-200">
          {brand(false)}
          <button className="btn-ghost !h-8 !w-8 !p-0" onClick={() => setOpen(false)} aria-label="Close menu"><LuX /></button>
        </div>
        <SidebarNav route={route} collapsed={false} onNavigate={() => setOpen(false)} />
        <div className="shrink-0 p-3 border-t border-ink-200 dark:border-[#1E1F22]"><Signature /></div>
      </aside>

      {/* ---------------- content column */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <header className="h-14 shrink-0 z-20 flex items-center justify-between gap-3 px-4 md:px-6 bg-canvas/95 backdrop-blur border-b border-ink-200 dark:border-[#1E1F22] dark:shadow-[0_1px_0_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-2 min-w-0">
            <button className="lg:hidden btn-ghost !h-8 !w-8 !p-0 shrink-0" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><LuMenu /></button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-[13.5px]">
              <a href="#/" className="hidden sm:inline text-ink-500 hover:text-ink-900 transition-colors">{APP_NAME}</a>
              <LuChevronRight className="hidden sm:block size-3.5 text-ink-300 shrink-0" aria-hidden />
              <span className="font-semibold text-ink-900 truncate" aria-current="page">{current.label}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Status />
            <ThemeToggle />
            {route !== '/diagnosis' && <a href="#/diagnosis" className="btn-primary btn-sm"><LuScanSearch className="size-4" /><span className="hidden sm:inline">New scan</span></a>}
          </div>
        </header>

        <main id="main" ref={main} className="flex-1 min-h-0 scroll-area scrollbar-thin bg-canvas" tabIndex={-1}>
          <div key={route} className="max-w-[1440px] mx-auto w-full px-4 md:px-6 xl:px-8 py-6 md:py-7 animate-page">
            {children}
          </div>
          <footer className="max-w-[1440px] mx-auto w-full px-4 md:px-6 xl:px-8 pt-5 pb-6 mt-4 border-t border-ink-100 text-[12px] text-ink-500">
            <div className="flex flex-col lg:flex-row gap-x-6 gap-y-1 lg:items-center lg:justify-between">
              <span><span className="font-semibold text-ink-700">{APP_NAME}</span> · {APP_TAGLINE}</span>
              <span>Developed and designed by <DevName className="text-[12.5px]" /> · University of Central Punjab</span>
            </div>
            <p className="mt-1.5 text-ink-400">Academic research tool — not a diagnosis. Synthetic patients only.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
