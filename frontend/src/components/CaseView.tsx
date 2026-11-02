import React from 'react';
import { LuBrain, LuCircleCheck, LuExternalLink, LuNetwork, LuPill, LuStethoscope, LuTriangleAlert } from 'react-icons/lu';
import { fmt } from '../lib/api';
import { Plot, SERIES } from './Plot';
import { Alert, Badge, Bar, Card, cx } from './ui';

const STATUS: Record<string, { tone: any; label: string }> = {
  confident: { tone: 'emerald', label: 'Confident prediction' },
  uncertain: { tone: 'amber', label: 'Uncertain — further assessment' },
  outside_scope: { tone: 'violet', label: 'Outside supported scope' },
  rejected_ood: { tone: 'rose', label: 'Rejected — out of distribution' },
  invalid_image: { tone: 'rose', label: 'Invalid image' },
  no_image: { tone: 'slate', label: 'No image supplied' },
  model_unavailable: { tone: 'rose', label: 'Model unavailable' },
};

export function PredictionCard({ ai }: { ai: any }) {
  if (!ai) return null;
  const st = STATUS[ai.status] || { tone: 'slate', label: ai.status };
  const probs = ai.class_probabilities ? Object.entries<number>(ai.class_probabilities).slice(0, 8) : [];
  const enabled: Record<string, string> = ai.supported_classes?.enabled_map || {};
  return (
    <Card title={<span className="flex items-center gap-2"><LuBrain className="text-brand-600" /> AI Diagnostic Agent</span>}
      action={<Badge tone={st.tone}>{st.label}</Badge>}>
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div><div className="label">Prediction</div><div className="text-xl font-semibold text-ink-900">{ai.predicted_class || '— (withheld)'}</div>
          {ai.top_dataset_class && <div className="text-xs text-ink-500 mt-0.5">top dataset class: {ai.top_dataset_class}</div>}</div>
        <div><div className="label">Calibrated confidence</div><div className="text-xl font-semibold text-ink-900 tabular-nums">{fmt.pct(ai.confidence)}</div>
          <Bar value={ai.confidence || 0} label="confidence" /></div>
        <div><div className="label">90% conformal set</div><div className="flex flex-wrap gap-1.5">{(ai.prediction_set || []).map((c: string) => <Badge key={c} tone={enabled[c] ? 'cyan' : 'slate'}>{c}</Badge>)}{!ai.prediction_set?.length && <span className="text-sm text-ink-500">—</span>}</div></div>
      </div>
      {ai.warning && <Alert tone={ai.status === 'confident' ? 'info' : 'warn'}>{ai.warning}</Alert>}
      {probs.length > 0 && (
        <Plot ariaLabel="Class probabilities" height={Math.max(180, probs.length * 30)}
          data={[{ type: 'bar', orientation: 'h', y: probs.map(([c]) => c).reverse(), x: probs.map(([, p]) => p).reverse(),
            marker: { color: probs.map(([c]) => (enabled[c] ? SERIES[0] : '#c3cbd8')).reverse() },
            hovertemplate: '%{y}: %{x:.1%}<extra></extra>' }]}
          layout={{ margin: { l: 150, r: 20, t: 10, b: 36 }, xaxis: { tickformat: '.0%', range: [0, 1] } }} />
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500 mt-2">
        {ai.ood_score !== undefined && <span>OOD score {fmt.num(ai.ood_score, 1)} (threshold {fmt.num(ai.model?.ood_threshold, 1)})</span>}
        {ai.model && <span>Model: {ai.model.backbone} + {ai.model.head?.split(' ')[0]} head · test acc {fmt.pct(ai.model.test_accuracy)}</span>}
        {(ai.flags || []).length > 0 && <span>Flags: {ai.flags.join(', ')}</span>}
      </div>
    </Card>
  );
}

export function ReviewCard({ c }: { c: any }) {
  const r = c.review || {};
  const kg = c.kg || {};
  const tone = r.decision === 'accept' ? 'emerald' : r.decision === 'human_override' ? 'violet' : r.decision === 'reject' ? 'rose' : 'amber';
  return (
    <Card title={<span className="flex items-center gap-2"><LuStethoscope className="text-violet-600" /> Dermatologist Agent review</span>}
      subtitle="Rule-based simulated reviewer — not a medical professional" action={<Badge tone={tone}>{r.decision}</Badge>}>
      <div className="text-sm"><span className="text-ink-500">Final (simulated) diagnosis: </span><span className="text-ink-900 font-semibold">{c.final_diagnosis || 'Referral — no diagnosis'}</span></div>
      <p className="text-sm text-ink-600 mt-2 leading-relaxed">{r.rationale}</p>
      <div className="mt-4 rounded-xl bg-ink-50 border border-ink-200 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-900"><LuNetwork className="text-emerald-600" /> Knowledge-graph verification
          <Badge tone={kg.conflict ? 'rose' : kg.status === 'supported' ? 'emerald' : 'amber'} className="ml-auto">{kg.status}</Badge></div>
        {kg.supporting_symptoms?.length > 0 && <div className="text-xs text-ink-600 mt-2">Supporting symptoms: {kg.supporting_symptoms.join(', ')}</div>}
        {kg.differentials?.length > 0 && <div className="text-xs text-ink-600 mt-1">Differentials: {kg.differentials.join(', ')}</div>}
        {kg.kg_best && <div className="text-xs text-ink-500 mt-1">Best symptom match in KG: {kg.kg_best}</div>}
      </div>
      {c.reassessment_reasons?.length > 0 && <div className="mt-3 text-xs text-amber-700">Reassessments: {c.reassessment_reasons.join(' → ')}</div>}
    </Card>
  );
}

export function TreatmentCard({ t, f }: { t: any; f: any }) {
  if (!t) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><LuPill className="text-emerald-600" /> Treatment Agent — simulated pathway</span>}
      subtitle={t.note} action={t.improved === null ? <Badge>referral</Badge> : <Badge tone={t.improved ? 'emerald' : 'amber'}>{t.improved ? 'improved' : 'not improved'}</Badge>}>
      <ol className="relative border-l border-ink-200 ml-2 space-y-3">
        {(t.pathway || []).map((s: any, i: number) => (
          <li key={i} className="ml-4">
            <span className={cx('absolute -left-[7px] mt-1 size-3 rounded-full ring-4 ring-white', s.responded ? 'bg-emerald-500' : s.responded === false ? 'bg-amber-400' : 'bg-slate-400')} />
            <div className="text-sm text-ink-900">{s.stage}</div>
            <div className="text-xs text-ink-500">{s.weeks} weeks · {s.responded === null ? 'pending' : s.responded ? 'simulated response' : 'no simulated response'}{s.p_response_param !== undefined && ` · p=${s.p_response_param}`}</div>
          </li>
        ))}
      </ol>
      {f && <div className="mt-4 text-sm text-ink-600">Follow-up: <span className="text-ink-900">{f.status}</span>{f.scheduled_after_weeks ? ` after ${f.scheduled_after_weeks} weeks` : ''}{f.reassessment_required && ' — reassessment required'}</div>}
    </Card>
  );
}

export function References({ refs, title = 'Retrieved evidence (RAG)' }: { refs: any[]; title?: string }) {
  if (!refs?.length) return null;
  return (
    <Card title={title} subtitle="Paraphrased knowledge-base passages with their public sources">
      <ol className="space-y-3">
        {refs.map((r: any) => (
          <li key={r.id || r.n} className="text-sm">
            <div className="text-ink-700 leading-relaxed"><span className="text-brand-600 font-medium mr-1">[{r.n}]</span>{r.text}</div>
            <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline mt-1">
              {r.source_title} <LuExternalLink className="size-3" /></a>
            <span className="text-xs text-ink-400 ml-2">similarity {fmt.num(r.score, 2)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function TraceTimeline({ trace }: { trace: any[] }) {
  const items = (trace || []).filter((t) => t.agent);
  const color: Record<string, string> = { PatientAgent: 'text-brand-600', ClinicEnvironmentAgent: 'text-fuchsia-600', AIDiagnosticAgent: 'text-brand-600', DermatologistAgent: 'text-violet-600', TreatmentAgent: 'text-emerald-600' };
  return (
    <ol className="space-y-2 max-h-[460px] overflow-y-auto scrollbar-thin pr-2">
      {items.map((t, i) => {
        const { agent, action, time, ...rest } = t;
        return (
          <li key={i} className="rounded-xl bg-ink-50 border border-ink-200 px-3 py-2 animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="flex items-center gap-2 text-sm"><span className={cx('font-medium', color[agent])}>{agent}</span><span className="text-ink-400">·</span><span className="text-ink-900">{action}</span><span className="ml-auto text-[11px] text-ink-400 tabular-nums">{time}</span></div>
            <div className="text-xs text-ink-500 mt-0.5 break-words">{Object.entries(rest).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function RoutePath({ route }: { route: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {route.map((r, i) => (
        <React.Fragment key={i}>
          <span className={cx('rounded-lg px-2 py-1 border', r === 'reassessment' ? 'border-amber-200 bg-amber-50 text-amber-700' : r === 'further_assessment' ? 'border-violet-200 bg-violet-50 text-violet-600' : 'border-ink-200 bg-ink-50 text-ink-700')}>{r.replace(/_/g, ' ')}</span>
          {i < route.length - 1 && <span className="text-ink-400">→</span>}
        </React.Fragment>
      ))}
      <LuCircleCheck className="text-emerald-600 ml-1" aria-label="completed" />
    </div>
  );
}

export function WarningsList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return <ul className="text-xs text-amber-700 space-y-1">{items.map((w) => <li key={w} className="flex gap-1.5"><LuTriangleAlert className="mt-0.5 shrink-0" />{w}</li>)}</ul>;
}
