import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { LuCircleAlert, LuInbox, LuInfo, LuLoaderCircle, LuShieldAlert } from 'react-icons/lu';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
/** Display form of backend status codes: 'supported_low_sample' -> 'supported low sample'. */
export const pretty = (v: unknown) => (typeof v === 'string' ? v.replace(/_/g, ' ') : v);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ Card */
export function Card({ children, className, title, subtitle, action, delay = 0, flush, bodyClassName }: {
  children?: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; delay?: number; flush?: boolean; bodyClassName?: string;
}) {
  return (
    <section className={cx('card min-w-0 animate-fade-up', flush ? 'p-0 overflow-hidden' : 'p-5', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {(title || action) && (
        <header className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4', flush && 'px-5 pt-5')}>
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[15px] leading-6 font-semibold text-ink-900">{title}</h2>}
            {subtitle && <p className="text-[12.5px] text-ink-500 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          {action && <div className="min-w-0 max-w-full">{action}</div>}
        </header>
      )}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </section>
  );
}

/* ------------------------------------------------------------------ Page header */
export function PageHeader({ eyebrow, title, description, actions, icon }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-6">
      <div className="max-w-3xl min-w-0 flex gap-3.5">
        {icon && <span className="hidden sm:grid place-items-center size-11 shrink-0 rounded-xl bg-brand-100 text-brand-700 [&>svg]:size-5">{icon}</span>}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h1 className="text-[22px] md:text-[24px] leading-tight">{title}</h1>
          {description && <p className="text-[13.5px] text-ink-500 mt-1.5 leading-relaxed max-w-2xl">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2 min-w-0">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Animated numbers
   Animates the first number inside a formatted value ("61.5%", "8.9 min", "3,550",
   "369 / 372") while keeping the original formatting. Non-numeric values pass through. */
export function AnimatedValue({ value, duration = 700 }: { value: ReactNode; duration?: number }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  const match = text ? text.match(/-?\d[\d,]*(\.\d+)?/) : null;
  const target = match ? Number(match[0].replace(/,/g, '')) : NaN;
  const decimals = match?.[1] ? match[1].length - 1 : 0;
  const grouped = !!match && match[0].includes(',');
  const [shown, setShown] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (reducedMotion()) { setShown(target); return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration), e = 1 - Math.pow(1 - t, 3);
      setShown(a + (target - a) * e);
      if (t < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, duration]);
  if (!text || !match || !Number.isFinite(target)) return <>{value}</>;
  const num = shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return <>{text.slice(0, match.index)}{num}{text.slice((match.index || 0) + match[0].length)}</>;
}

/* ------------------------------------------------------------------ Stat */
type Tone = 'sky' | 'cyan' | 'violet' | 'emerald' | 'green' | 'amber' | 'rose' | 'slate';
const TONE_ICON: Record<string, string> = {
  sky: 'bg-brand-100 text-brand-700', cyan: 'bg-brand-100 text-brand-700', violet: 'bg-brand-100 text-brand-800',
  emerald: 'bg-green-100 text-green-800', green: 'bg-green-100 text-green-800',
  amber: 'bg-ink-100 text-ink-600 dark:bg-[#383A40] dark:text-[#B5BAC1]', rose: 'bg-ink-100 text-ink-600 dark:bg-[#383A40] dark:text-[#B5BAC1]', slate: 'bg-ink-100 text-ink-600 dark:bg-[#383A40] dark:text-[#B5BAC1]',
};

export function Stat({ label, value, hint, icon, tone = 'sky', delay = 0 }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; delay?: number }) {
  return (
    <div className="card p-4 min-w-0 animate-fade-up transition-shadow hover:shadow-[var(--shadow-card-hover)]" style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-500 leading-snug">{label}</span>
        {icon && <span className={cx('grid place-items-center size-8 shrink-0 rounded-lg [&>svg]:size-4', TONE_ICON[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-[24px] leading-tight font-semibold text-ink-900 tabular-nums tracking-[-0.01em] truncate"><AnimatedValue value={value} /></div>
      {hint && <div className="mt-1 text-[12px] text-ink-500 leading-snug">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */
export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const t: Record<string, string> = {
    slate: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-[#383A40] dark:text-[#DBDEE1] dark:ring-[#4E5058]',
    sky: 'bg-brand-50 text-brand-800 ring-brand-200', cyan: 'bg-brand-50 text-brand-800 ring-brand-200',
    violet: 'bg-brand-100 text-brand-900 ring-brand-300',
    emerald: 'bg-green-100 text-green-800 ring-green-200', green: 'bg-green-100 text-green-800 ring-green-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200', rose: 'bg-red-50 text-red-700 ring-red-200',
  };
  return <span className={cx('chip ring-1 ring-inset whitespace-nowrap', t[tone] || t.slate, className)}>{typeof children === 'string' ? pretty(children) as string : children}</span>;
}

/* ------------------------------------------------------------------ Status dot */
export function LiveDot({ tone = 'green', active = true }: { tone?: 'green' | 'sky' | 'slate' | 'red'; active?: boolean }) {
  const c = { green: 'bg-green-600', sky: 'bg-brand-500', slate: 'bg-ink-300', red: 'bg-red-500' }[tone];
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden>
      {active && <span className={cx('absolute inset-0 rounded-full animate-ping-soft', c)} />}
      <span className={cx('relative inline-flex size-2 rounded-full', c)} />
    </span>
  );
}

/* ------------------------------------------------------------------ Loading */
export function Spinner({ label }: { label?: string }) {
  return <span role="status" className="inline-flex items-center gap-2 text-[13px] text-ink-500"><LuLoaderCircle className="animate-spin text-brand-600" />{label}</span>;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden />;
}

export function CardSkeleton({ lines = 3, chart, className }: { lines?: number; chart?: boolean; className?: string }) {
  return (
    <div className={cx('card p-5', className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-1/2 mt-2" />
      {chart ? <Skeleton className="h-56 w-full mt-5" /> : Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3 mt-4" />)}
    </div>
  );
}

export function StatSkeletonRow({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-4"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-6 w-1/2 mt-3" /><Skeleton className="h-3 w-3/4 mt-2" /></div>
      ))}
    </div>
  );
}

/** Indeterminate "agents working" indicator: shows the agent pipeline with a moving
 *  highlight. It does not claim which stage is running (the backend call is atomic). */
export function AiWorking({ label, steps }: { label: string; steps?: string[] }) {
  return (
    <div className="card p-5 animate-fade-up" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative grid place-items-center size-9 rounded-lg bg-brand-100 text-brand-700">
          <span className="absolute inset-0 rounded-lg ring-2 ring-brand-300 animate-pulse-soft" />
          <LuLoaderCircle className="size-4 animate-spin" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink-900 flex items-center gap-1.5">{label}
            <span className="inline-flex gap-0.5 ml-0.5">{[0, 1, 2].map((i) => <span key={i} className="size-1 rounded-full bg-brand-600 animate-dot" style={{ animationDelay: `${i * 0.16}s` }} />)}</span>
          </div>
          <div className="text-[12px] text-ink-500">Processing in the backend — this usually takes a second or two.</div>
        </div>
      </div>
      {steps && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {steps.map((s) => <span key={s} className="chip bg-ink-50 text-ink-600 ring-1 ring-inset ring-ink-200">{s}</span>)}
        </div>
      )}
      <div className="mt-4 h-1 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-brand-300 via-brand-500 to-brand-300 animate-sweep" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Feedback */
export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: string; children: ReactNode }) {
  const s = { info: 'border-brand-200 bg-brand-50 text-ink-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', error: 'border-red-200 bg-red-50 text-red-900', success: 'border-green-200 bg-green-50 text-green-900' }[tone];
  const ic = { info: 'text-brand-600', warn: 'text-amber-600', error: 'text-red-600', success: 'text-green-700' }[tone];
  const Icon = tone === 'info' || tone === 'success' ? LuInfo : tone === 'warn' ? LuShieldAlert : LuCircleAlert;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl border px-4 py-3 text-[13px] animate-fade-up', s)}>
      <Icon className={cx('mt-0.5 shrink-0 size-4', ic)} />
      <div className="min-w-0">{title && <div className="font-semibold mb-0.5">{title}</div>}<div className="leading-relaxed">{children}</div></div>
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-6 py-10 text-center text-[13px] text-ink-500">
      <span className="mx-auto mb-3 grid place-items-center size-10 rounded-full bg-surface border border-ink-200 text-ink-400 [&>svg]:size-[18px]">{icon || <LuInbox />}</span>
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <Alert tone="error" title="Something went wrong">{error}</Alert> : null;
}

/* ------------------------------------------------------------------ Progress */
export function Bar({ value, max = 1, tone = 'sky', label, className }: { value: number; max?: number; tone?: string; label?: string; className?: string }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const c: Record<string, string> = { sky: 'bg-brand-500', cyan: 'bg-brand-500', green: 'bg-green-700', emerald: 'bg-green-700', violet: 'bg-brand-700', amber: 'bg-amber-500', rose: 'bg-red-500' };
  return (
    <div className={cx('h-1.5 w-full rounded-full bg-ink-100 overflow-hidden', className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', c[tone] || c.sky)} style={{ width: `${w}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Forms */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[12px] text-ink-400">{hint}</span>}</label>;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="label mb-0">{label}</span>
        <span className="text-[13px] font-semibold text-ink-900 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, #38BDF8 ${pct}%, var(--color-ink-200) ${pct}%)` }} />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto scrollbar-thin rounded-lg bg-ink-100 p-0.5 border border-ink-200">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('px-3 h-8 text-[13px] font-medium rounded-md whitespace-nowrap transition-all duration-150',
            value === t.id ? 'bg-surface text-ink-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-ink-500 hover:text-ink-900')}>{t.label}</button>
      ))}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="flex gap-2.5 text-[12.5px] leading-snug text-ink-600 bg-ink-50 border border-ink-200 rounded-xl px-3.5 py-2.5">
      <LuShieldAlert className="size-4 shrink-0 mt-px text-ink-400" />
      <span><span className="font-medium text-ink-800">Decision support, not a diagnosis.</span> Academic simulation with synthetic patients — do not upload real patient photos.</span>
    </div>
  );
}

/** Reveal-on-scroll; observes inside the scrolling main region. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el || reducedMotion()) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }); io.disconnect(); }
    }, { threshold: 0.1, root: document.getElementById('main') });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
