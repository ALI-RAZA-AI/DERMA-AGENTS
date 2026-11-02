import React from 'react';
import { LuArrowRight, LuArrowUpRight, LuBrain, LuBuilding2, LuDatabase, LuNetwork, LuPill, LuScanSearch, LuStethoscope, LuUser } from 'react-icons/lu';
import { BodyScan } from '../components/BodyScan';
import { Badge, Bar, cx, useReveal } from '../components/ui';
import { fmt } from '../lib/api';
import { useApi } from '../lib/hooks';

const AGENTS = [
  { name: 'Patient Agent', icon: LuUser, text: 'Synthetic patients with age, symptoms, severity and waiting tolerance join queues, submit images and return for follow-up.' },
  { name: 'AI Diagnostic Agent', icon: LuBrain, text: 'Runs the trained classifier with calibrated confidence, conformal prediction sets and out-of-distribution rejection.' },
  { name: 'Dermatologist Agent', icon: LuStethoscope, text: 'A rule-based simulated reviewer that weighs the AI output against RAG evidence and the knowledge graph — with human override.' },
  { name: 'Treatment Agent', icon: LuPill, text: 'Retrieves a category-level simulated care pathway, tracks the response and triggers reassessment.' },
  { name: 'Clinic Environment', icon: LuBuilding2, text: 'A Mesa environment for arrivals, queues, dermatologist capacity, congestion and utilization.' },
];

export default function Home() {
  const { data } = useApi<any>('/api/analytics');
  const r1 = useReveal<HTMLDivElement>();
  const r2 = useReveal<HTMLDivElement>();
  const ev = data?.model;
  const tm = ev?.test_metrics;
  const sc = (data?.scenarios?.summary || []).filter((x: any) => x.variant === 'main');
  const s2 = sc.find((x: any) => x.scenario === 'S2_ai_assisted');
  const kgN = data?.kg ? Object.values<number>(data.kg).reduce((a, b) => a + b, 0) : null;
  const enabled = tm ? Object.entries<any>(tm.enabled_class_metrics || {}) : [];

  return (
    <div className="space-y-14">
      {/* hero */}
      <section className="grid xl:grid-cols-[1fr_1.08fr] gap-10 items-center pt-2">
        <div className="animate-fade-up">
          <div className="eyebrow mb-5">Agent-based dermatology · Research platform</div>
          <h1 className="text-[56px] md:text-[76px] leading-[0.98]">
            Preventive skin<br />intelligence, <em className="italic text-brand-600">agent</em><br /><em className="italic text-brand-600">by agent.</em>
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed max-w-xl">
            Skin images are classified, reviewed against a sourced knowledge graph and routed through five autonomous agents —
            so you can see how AI assistance changes waiting time, workload and diagnostic agreement across a whole clinic.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#/diagnosis" className="btn-primary !px-6 !py-3">Start a skin scan <LuArrowRight /></a>
            <a href="#/simulation" className="btn-ghost !px-6 !py-3">Run the clinic simulation</a>
          </div>
          <p className="mt-8 text-[13px] text-ink-500 leading-relaxed max-w-md">
            Decision support for dermatology research. <span className="text-ink-800">Not a diagnosis.</span> Synthetic patients, illustrative scan view.
          </p>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="relative rounded-[28px] bg-scan-950 overflow-hidden h-[560px] shadow-[0_40px_80px_-40px_rgba(10,18,38,.7)] ring-1 ring-black/5">
            <div className="absolute inset-0 dot-grid opacity-[0.07]" />
            <div className="absolute left-5 top-5 z-10">
              <div className="text-[13px] font-medium text-white">Total-body scan view</div>
              <div className="text-[11px] text-white/45 mt-0.5">Illustrative · stacked contour rendering</div>
            </div>
            <div className="absolute right-5 top-5 z-10 chip bg-white/8 text-white/80 ring-1 ring-white/10">
              <span className="size-1.5 rounded-full bg-[#7fb2ff]" /> Scanning
            </div>
            <BodyScan className="absolute inset-0" />
            <div className="absolute left-5 bottom-5 z-10 flex flex-wrap gap-3 text-[11px] text-white/55">
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-white/80" /> Mapped lesion</span>
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#ff6b4a]" /> Above review threshold</span>
            </div>
          </div>

          {/* floating model card */}
          <div className="absolute left-5 bottom-12 w-[290px] glass !bg-white/95 p-5 hidden md:block animate-fade-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-900">AI Diagnostic Agent</span>
              <Badge tone="emerald">live model</Badge>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-[52px] leading-none text-ink-900 tabular-nums">{tm ? (tm.accuracy * 100).toFixed(1) : '—'}</span>
              <span className="text-[13px] text-ink-500 mb-1.5 leading-tight">% test accuracy<br />14 dataset classes</span>
            </div>
            <div className="mt-4 space-y-2.5">
              {enabled.slice(0, 4).map(([c, v]: any) => (
                <div key={c}>
                  <div className="flex justify-between text-[12px]"><span className="text-ink-600">{c}</span><span className="text-ink-900 tabular-nums">F1 {v.f1.toFixed(2)}</span></div>
                  <Bar value={v.f1} />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-ink-100 text-[11.5px] text-ink-500">
              Conformal coverage {fmt.pct(ev?.conformal?.test_empirical_coverage)} · confident calls {fmt.pct(ev?.selective?.test_accuracy_accepted, 0)} accurate
            </div>
          </div>
        </div>
      </section>

      {/* stat strip */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { icon: LuDatabase, tone: 'bg-[#e9fbbf] text-ink-900', label: 'Labelled images', value: fmt.int(data?.dataset?.labelled_images), sub: `${data?.dataset?.class_counts_total ? Object.keys(data.dataset.class_counts_total).length : '—'} dataset classes · audited` },
          { icon: LuScanSearch, tone: 'bg-brand-100 text-brand-700', label: 'Macro-F1 (held-out)', value: fmt.num(tm?.macro_f1, 2), sub: `ROC-AUC ${fmt.num(tm?.roc_auc_ovr_macro_eligible, 2)} · grouped split` },
          { icon: LuNetwork, tone: 'bg-[#c6f3ff] text-sky-800', label: 'Knowledge graph nodes', value: fmt.int(kgN), sub: `${data?.rag_chunks ?? '—'} sourced RAG passages` },
          { icon: LuBuilding2, tone: 'bg-violet-100 text-violet-700', label: 'AI-assisted wait', value: s2 ? `${fmt.num(s2.avg_waiting_time_min_mean)}m` : '—', sub: s2 ? `Dx accuracy ${fmt.pct(s2.diagnostic_accuracy_final_mean)} · Mesa` : 'run the scenarios' },
        ].map((s, i) => (
          <div key={s.label} className="glass p-5 animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start justify-between">
              <span className={cx('grid place-items-center size-11 rounded-2xl', s.tone)}><s.icon className="size-5" /></span>
              <LuArrowUpRight className="text-ink-300" />
            </div>
            <div className="mt-5 text-[13px] text-ink-500">{s.label}</div>
            <div className="font-display text-[46px] leading-none text-ink-900 mt-1 tabular-nums">{s.value}</div>
            <div className="mt-2 text-xs text-ink-500">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* agents - editorial numbered list */}
      <section ref={r1} className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
        <div>
          <div className="eyebrow mb-3">The agents</div>
          <h2 className="text-[46px] leading-[1.02]">Five agents.<br /><em className="italic text-ink-500">One clinic.</em></h2>
          <p className="mt-4 text-[15px] text-ink-600 leading-relaxed max-w-sm">Each agent has its own state, inputs, outputs and decision rules. LangGraph routes every patient through them; Mesa runs hundreds of patients at once.</p>
          <a href="#/agents" className="btn-ghost mt-6">See an agent trace <LuArrowRight /></a>
        </div>
        <ol className="glass divide-y divide-ink-100 !p-0">
          {AGENTS.map((a, i) => (
            <li key={a.name} className="flex gap-5 px-6 py-5 hover:bg-white transition first:rounded-t-[22px] last:rounded-b-[22px]">
              <span className="font-display text-[28px] leading-none text-ink-300 tabular-nums w-10 shrink-0 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-[16px] font-medium text-ink-900"><a.icon className="text-brand-600" /> {a.name}</div>
                <p className="mt-1 text-[14px] text-ink-600 leading-relaxed">{a.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* journey */}
      <section ref={r2} className="glass p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="eyebrow mb-2">LangGraph workflow</div>
            <h2 className="text-[40px] leading-none">A patient’s journey</h2>
          </div>
          <p className="text-[14px] text-ink-600 max-w-md leading-relaxed">Low confidence routes to further assessment; a rejected suggestion or conflicting knowledge-graph evidence routes to reassessment.</p>
        </div>
        <ol className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {['Intake', 'AI diagnosis', 'Confidence check', 'Dermatologist review', 'Knowledge-graph check', 'Treatment simulation', 'Follow-up'].map((s, i) => (
            <li key={s} className="relative rounded-2xl bg-ink-50 border border-ink-100 p-4">
              <div className="text-[11px] text-ink-400 tabular-nums">Step {i + 1}</div>
              <div className="mt-2 text-[14px] font-medium text-ink-900 leading-snug">{s}</div>
              <div className="mt-3 h-1 rounded-full bg-gradient-to-r from-[#c9f27a] to-[#9be7ff]" style={{ opacity: 0.35 + i * 0.1 }} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
