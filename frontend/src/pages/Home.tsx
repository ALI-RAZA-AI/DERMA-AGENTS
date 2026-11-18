import React from 'react';
import { LuArrowRight, LuBrain, LuBuilding2, LuChevronRight, LuDatabase, LuNetwork, LuPill, LuScanSearch, LuStethoscope, LuUser } from 'react-icons/lu';
import { BodyScan } from '../components/BodyScan';
import { APP_NAME, APP_TAGLINE } from '../components/Layout';
import { AnimatedValue, Badge, Bar, LiveDot, Skeleton, Stat, cx, useReveal } from '../components/ui';
import { fmt } from '../lib/api';
import { useApi } from '../lib/hooks';

const AGENTS = [
  { name: 'Patient Agent', icon: LuUser, text: 'Synthetic patients with age, symptoms, severity and waiting tolerance join queues, submit images and return for follow-up.' },
  { name: 'AI Diagnostic Agent', icon: LuBrain, text: 'Runs the trained classifier with calibrated confidence, conformal prediction sets and out-of-distribution rejection.' },
  { name: 'Dermatologist Agent', icon: LuStethoscope, text: 'A rule-based simulated reviewer that weighs the AI output against RAG evidence and the knowledge graph — with human override.' },
  { name: 'Treatment Agent', icon: LuPill, text: 'Retrieves a category-level simulated care pathway, tracks the response and triggers reassessment.' },
  { name: 'Clinic Environment', icon: LuBuilding2, text: 'A Mesa environment for arrivals, queues, dermatologist capacity, congestion and utilization.' },
];

const STEPS = ['Intake', 'AI diagnosis', 'Confidence check', 'Dermatologist review', 'Knowledge-graph check', 'Treatment simulation', 'Follow-up'];

export default function Home() {
  const { data, loading } = useApi<any>('/api/analytics');
  const r1 = useReveal<HTMLDivElement>();
  const r2 = useReveal<HTMLDivElement>();
  const ev = data?.model;
  const tm = ev?.test_metrics;
  const sc = (data?.scenarios?.summary || []).filter((x: any) => x.variant === 'main');
  const s2 = sc.find((x: any) => x.scenario === 'S2_ai_assisted');
  const kgN = data?.kg ? Object.values<number>(data.kg).reduce((a, b) => a + b, 0) : null;
  const enabled = tm ? Object.entries<any>(tm.enabled_class_metrics || {}) : [];

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="grid xl:grid-cols-[1fr_1fr] gap-6 items-stretch">
        <div className="card p-6 md:p-8 flex flex-col justify-center animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <Badge tone="sky">{APP_NAME}</Badge>
            <span className="text-[12px] text-ink-500">Research platform</span>
          </div>
          <h1 className="text-[24px] md:text-[26px] leading-tight max-w-xl">{APP_TAGLINE}</h1>
          <p className="mt-3 text-[14px] text-ink-600 leading-relaxed max-w-xl">
            Skin images are classified, reviewed against a sourced knowledge graph and routed through five autonomous agents —
            so you can see how AI assistance changes waiting time, workload and diagnostic agreement across a whole clinic.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <a href="#/diagnosis" className="btn-primary !h-10 !px-5">Start a skin scan <LuArrowRight className="size-4" /></a>
            <a href="#/simulation" className="btn-ghost !h-10 !px-5">Run the clinic simulation</a>
          </div>
          <p className="mt-6 text-[12.5px] text-ink-500 leading-relaxed max-w-md">
            Decision support for dermatology research. <span className="text-ink-800 font-medium">Not a diagnosis.</span> Synthetic patients, illustrative scan view.
          </p>
        </div>

        <div className="relative card overflow-hidden min-h-[420px] md:min-h-[460px] bg-ink-50 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="absolute inset-0 [background-image:radial-gradient(var(--color-ink-200)_1px,transparent_1px)] [background-size:16px_16px]" aria-hidden />
          <div className="absolute left-5 top-4 z-10">
            <div className="text-[13px] font-semibold text-ink-900">Total-body scan view</div>
            <div className="text-[12px] text-ink-500">Illustrative · stacked contour rendering</div>
          </div>
          <span className="absolute right-5 top-4 z-10 chip bg-surface ring-1 ring-inset ring-ink-200 text-ink-700"><LiveDot tone="sky" /> Scanning</span>
          <BodyScan className="absolute inset-0" />
          <div className="absolute left-5 bottom-4 z-10 flex flex-wrap gap-3 text-[12px] text-ink-600">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-green-800" /> Mapped lesion</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-600 ring-2 ring-brand-200" /> Above review threshold</span>
          </div>

          {/* live model card */}
          <div className="absolute right-4 bottom-4 w-[260px] card !shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] p-4 hidden md:block animate-fade-up" style={{ animationDelay: '220ms' }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-900">AI Diagnostic Agent</span>
              <Badge tone="green"><LiveDot tone="green" /> live model</Badge>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-[26px] leading-none font-semibold text-ink-900 tabular-nums">{tm ? <AnimatedValue value={(tm.accuracy * 100).toFixed(1)} /> : '—'}</span>
              <span className="text-[12px] text-ink-500 leading-tight pb-0.5">% test accuracy · 14 dataset classes</span>
            </div>
            <div className="mt-3 space-y-2">
              {loading && !tm ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-3" />) : enabled.slice(0, 4).map(([c, v]: any) => (
                <div key={c}>
                  <div className="flex justify-between text-[12px]"><span className="text-ink-600">{c}</span><span className="text-ink-900 tabular-nums font-medium">F1 {v.f1.toFixed(2)}</span></div>
                  <Bar value={v.f1} className="mt-1" />
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-ink-100 text-[11.5px] text-ink-500 leading-snug">
              Conformal coverage {fmt.pct(ev?.conformal?.test_empirical_coverage)} · confident calls {fmt.pct(ev?.selective?.test_accuracy_accepted, 0)} accurate
            </div>
          </div>
        </div>
      </section>

      {/* stat strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Key figures">
        <Stat delay={0} icon={<LuDatabase />} tone="green" label="Labelled images" value={fmt.int(data?.dataset?.labelled_images)}
          hint={`${data?.dataset?.class_counts_total ? Object.keys(data.dataset.class_counts_total).length : '—'} dataset classes · audited`} />
        <Stat delay={60} icon={<LuScanSearch />} label="Macro-F1 (held-out)" value={fmt.num(tm?.macro_f1, 2)} hint={`ROC-AUC ${fmt.num(tm?.roc_auc_ovr_macro_eligible, 2)} · grouped split`} />
        <Stat delay={120} icon={<LuNetwork />} tone="green" label="Knowledge graph nodes" value={fmt.int(kgN)} hint={`${data?.rag_chunks ?? '—'} sourced RAG passages`} />
        <Stat delay={180} icon={<LuBuilding2 />} label="AI-assisted wait" value={s2 ? `${fmt.num(s2.avg_waiting_time_min_mean)} min` : '—'}
          hint={s2 ? `Dx accuracy ${fmt.pct(s2.diagnostic_accuracy_final_mean)} · Mesa` : 'Run the scenarios to populate'} />
      </section>

      {/* agents */}
      <section ref={r1} className="grid lg:grid-cols-[0.75fr_1.25fr] gap-6">
        <div className="pt-1">
          <div className="eyebrow mb-1">The agents</div>
          <h2 className="text-[19px] leading-snug">Five agents, one clinic</h2>
          <p className="mt-2 text-[13.5px] text-ink-600 leading-relaxed max-w-sm">Each agent has its own state, inputs, outputs and decision rules. LangGraph routes every patient through them; Mesa runs hundreds of patients at once.</p>
          <a href="#/agents" className="btn-ghost mt-4">See an agent trace <LuArrowRight className="size-4" /></a>
        </div>
        <ol className="card divide-y divide-ink-100 overflow-hidden">
          {AGENTS.map((a, i) => (
            <li key={a.name} className="flex gap-4 px-5 py-4 transition-colors hover:bg-ink-50">
              <span className="grid place-items-center size-9 shrink-0 rounded-lg bg-brand-100 text-brand-700"><a.icon className="size-[18px]" /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="text-ink-400 tabular-nums font-medium">{String(i + 1).padStart(2, '0')}</span>{a.name}</div>
                <p className="mt-0.5 text-[13px] text-ink-600 leading-relaxed">{a.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* journey */}
      <section ref={r2} className="card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
          <div>
            <div className="eyebrow mb-1">LangGraph workflow</div>
            <h2 className="text-[19px]">A patient's journey</h2>
          </div>
          <p className="text-[13px] text-ink-500 max-w-md leading-relaxed">Low confidence routes to further assessment; a rejected suggestion or conflicting knowledge-graph evidence routes to reassessment.</p>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          {STEPS.map((s, i) => (
            <li key={s} className="relative subtle-panel p-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50">
              <div className="flex items-center justify-between text-[12px] text-ink-500 tabular-nums">Step {i + 1}{i < STEPS.length - 1 && <LuChevronRight className="hidden xl:block size-3.5 text-ink-300" aria-hidden />}</div>
              <div className="mt-1.5 text-[13.5px] font-semibold text-ink-900 leading-snug">{s}</div>
              <div className={cx('mt-3 h-1 rounded-full', i === STEPS.length - 1 ? 'bg-green-700' : 'bg-brand-500')} style={{ opacity: 0.35 + i * 0.1 }} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
