import React, { ReactNode, useEffect, useRef } from 'react';
import { LuCircleAlert, LuInfo, LuLoaderCircle, LuShieldAlert } from 'react-icons/lu';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, className, title, subtitle, action, delay = 0, flush }: {
  children?: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; delay?: number; flush?: boolean;
}) {
  return (
    <section className={cx('glass animate-fade-up', flush ? 'p-0 overflow-hidden' : 'p-6', className)} style={{ animationDelay: `${delay}ms` }}>
      {(title || action) && (
        <header className={cx('flex items-start justify-between gap-4 mb-5', flush && 'px-6 pt-6')}>
          <div className="min-w-0">
            {title && <h3 className="text-[26px] leading-tight text-ink-900">{title}</h3>}
            {subtitle && <p className="text-[13px] text-ink-500 mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-8 animate-fade-up">
      <div className="max-w-3xl">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="text-[44px] md:text-[56px] leading-[1.02]">{title}</h1>
        {description && <p className="text-[15px] text-ink-600 mt-3 leading-relaxed max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  );
}

const TONE_ICON: Record<string, string> = {
  sky: 'bg-brand-50 text-brand-600 ring-brand-100', cyan: 'bg-sky-50 text-sky-600 ring-sky-100', violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100', amber: 'bg-amber-50 text-amber-600 ring-amber-100', rose: 'bg-rose-50 text-rose-600 ring-rose-100',
};

export function Stat({ label, value, hint, icon, tone = 'sky' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'sky' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' }) {
  return (
    <div className="glass p-5 animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-600">{label}</span>
        {icon && <span className={cx('grid place-items-center size-9 rounded-xl ring-1', TONE_ICON[tone])}>{icon}</span>}
      </div>
      <div className="mt-3 font-display text-[40px] leading-none text-ink-900 tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'sky' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose'; className?: string }) {
  const t: Record<string, string> = {
    slate: 'bg-ink-100 text-ink-700 ring-ink-200', sky: 'bg-brand-50 text-brand-700 ring-brand-100',
    cyan: 'bg-sky-50 text-sky-700 ring-sky-100', violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100', amber: 'bg-amber-50 text-amber-800 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  };
  return <span className={cx('chip ring-1 ring-inset', t[tone], className)}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-ink-600"><LuLoaderCircle className="animate-spin text-brand-500" />{label}</span>;
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error'; title?: string; children: ReactNode }) {
  const s = { info: 'border-brand-100 bg-brand-50/70 text-ink-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', error: 'border-rose-200 bg-rose-50 text-rose-900' }[tone];
  const ic = { info: 'text-brand-600', warn: 'text-amber-600', error: 'text-rose-600' }[tone];
  const Icon = tone === 'info' ? LuInfo : tone === 'warn' ? LuShieldAlert : LuCircleAlert;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl border px-4 py-3 text-sm', s)}>
      <Icon className={cx('mt-0.5 shrink-0', ic)} />
      <div>{title && <div className="font-semibold mb-0.5">{title}</div>}<div className="leading-relaxed opacity-90">{children}</div></div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-ink-300 bg-white/60 p-8 text-center text-sm text-ink-500">{children}</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <Alert tone="error" title="Request failed">{error}</Alert> : null;
}

export function Bar({ value, max = 1, tone = 'cyan', label }: { value: number; max?: number; tone?: string; label?: string }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const c: Record<string, string> = { cyan: 'from-brand-500 to-sky-400', violet: 'from-violet-500 to-fuchsia-400', amber: 'from-amber-500 to-orange-400', rose: 'from-rose-500 to-pink-400', emerald: 'from-emerald-500 to-teal-400' };
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cx('h-full rounded-full bg-gradient-to-r transition-[width] duration-700', c[tone] || c.cyan)} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}</label>;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="label mb-0">{label}</span>
        <span className="text-sm font-medium text-ink-900 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-full bg-ink-100/80 p-1 border border-ink-200">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('px-4 py-1.5 text-sm rounded-full transition', value === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900')}>{t.label}</button>
      ))}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="text-[12px] leading-snug text-ink-600 bg-white/70 border border-ink-200 rounded-xl px-3 py-2">
      <span className="font-medium text-ink-800">Decision support, not a diagnosis.</span> Academic simulation with synthetic patients — do not upload real patient photos.
    </div>
  );
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
