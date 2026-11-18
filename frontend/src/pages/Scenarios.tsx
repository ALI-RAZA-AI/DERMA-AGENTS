import React, { useMemo, useState } from 'react';
import { LuGitCompareArrows, LuPlay } from 'react-icons/lu';
import { MUTED, Plot, SERIES } from '../components/Plot';
import { AiWorking, Alert, Card, CardSkeleton, ErrorBox, PageHeader, Slider, Tabs } from '../components/ui';
import { api, fmt } from '../lib/api';
import { useApi, useInterval } from '../lib/hooks';

const METRICS: [string, string, 'pct' | 'num'][] = [
  ['avg_waiting_time_min', 'Avg waiting time (min)', 'num'], ['avg_diagnosis_time_min', 'Avg diagnosis time (min)', 'num'],
  ['patients_served', 'Patients served', 'num'], ['left_without_being_seen', 'Left without being seen', 'num'],
  ['doctor_workload_consults_per_doctor_day', 'Consults / doctor / day', 'num'], ['dermatologist_utilization', 'Dermatologist utilization', 'pct'],
  ['avg_queue_length_derm', 'Avg dermatologist queue', 'num'], ['ai_human_disagreement_rate', 'AI–human disagreement', 'pct'],
  ['diagnostic_accuracy_final', 'Final diagnostic accuracy', 'pct'], ['simulated_treatment_success_rate', 'Simulated treatment success', 'pct'],
  ['system_efficiency_served_ratio', 'System efficiency (served / arrived)', 'pct'], ['kg_agreement_rate', 'KG agreement', 'pct'],
  ['reassessment_rate', 'Reassessment rate', 'pct'],
];

const label = (r: any) => `${r.scenario.split('_')[0]} ${r.variant === 'main' ? r.title.replace(/^\d\.\s*/, '') : r.variant.replace('traditional_under_same_conditions', 'same load, no AI')}`;

export default function Scenarios() {
  const latest = useApi<any>('/api/scenarios/latest');
  const [reps, setReps] = useState(3);
  const [job, setJob] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState('avg_waiting_time_min');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const data = latest.data;

  useInterval(async () => {
    if (!job) return;
    const j = await api.get(`/api/jobs/${job}`);
    if (j.state === 'done') { setJob(null); latest.setData(j.result); }
    if (j.state === 'error') { setJob(null); setErr(j.error); }
  }, job ? 800 : null);

  const run = async () => {
    setErr(null);
    try { const r = await api.post('/api/scenarios/compare', { replications: reps }); setJob(r.job_id); } catch (e: any) { setErr(e.message); }
  };
  const summary: any[] = data?.summary || [];
  const nonSweep = summary.filter((r) => r.scenario !== 'S5_ai_accuracy');
  const sweep = summary.filter((r) => r.scenario === 'S5_ai_accuracy');
  const mdef = METRICS.find((m) => m[0] === metric)!;
  const chart = useMemo(() => [{
    type: 'bar', orientation: 'h', y: nonSweep.map(label).reverse(), x: nonSweep.map((r) => r[`${metric}_mean`]).reverse(),
    error_x: { type: 'data', array: nonSweep.map((r) => r[`${metric}_sd`]).reverse(), color: '#94A3B8', thickness: 1 },
    marker: { color: nonSweep.map((r) => (r.workflow === 'traditional' ? MUTED : r.workflow === 'knowledge_augmented' ? SERIES[1] : SERIES[0])).reverse() },
    hovertemplate: `%{y}<br>${mdef[1]}: %{x:${mdef[2] === 'pct' ? '.1%' : '.2f'}}<extra></extra>`,
  }], [summary, metric]);
  const acc = sweep.map((r) => Number(r.variant.split('=')[1]));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Experiments" title="Six-scenario comparison" icon={<LuGitCompareArrows />}
        description="Each scenario is executed as real Mesa runs with independent random seeds (replications); bars show mean ± SD. Common random numbers make arrivals and patient mixes identical across workflows within a replication."
        actions={<div className="flex flex-wrap items-end gap-3"><div className="w-44"><Slider label="Replications" value={reps} min={1} max={10} onChange={setReps} /></div>
          <button className="btn-primary" disabled={!!job} onClick={run}><LuPlay className="size-4" /> {job ? 'Running…' : 'Run all six scenarios'}</button></div>} />
      <ErrorBox error={err} />
      {job && <AiWorking label="Background job running the Mesa experiments" steps={['Traditional clinic', 'AI-assisted clinic', 'High patient load', 'Limited dermatologists', 'AI accuracy levels', 'Knowledge-augmented clinic']} />}
      {latest.loading && !data && <CardSkeleton chart />}
      {!data && !latest.loading && <Alert title="No experiment yet">Press "Run all six scenarios" to execute the Mesa experiments.</Alert>}
      {data && (
        <>
          <div className="text-[12.5px] text-ink-500">Last run {new Date(data.created * 1000).toLocaleString()} · {data.replications} replications · base: {data.base_params.arrival_rate_per_hour} arrivals/h, {data.base_params.n_dermatologists} dermatologists, {data.base_params.days} days × {data.base_params.operating_minutes / 60} h</div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
            {Object.entries<any>(data.scenarios).map(([k, s], i) => <div key={k} className="card px-4 py-3 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}><div className="text-[13.5px] font-semibold text-ink-900">{s.title}</div><div className="text-[12px] text-ink-500 mt-1 leading-relaxed">{s.purpose}</div></div>)}
          </div>
          <Card title="Compare a metric across scenarios" subtitle="Grey = traditional workflow, sky blue = AI-assisted, green = knowledge-augmented"
            action={<div className="flex flex-wrap gap-2 items-center"><select className="input w-full sm:!w-64" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric">{METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <Tabs tabs={[{ id: 'chart', label: 'Chart' }, { id: 'table', label: 'Table' }]} value={view} onChange={setView} /></div>}>
            {view === 'chart' ? (
              <Plot ariaLabel={`${mdef[1]} by scenario`} height={360} data={chart}
                layout={{ margin: { l: 230, r: 30, t: 10, b: 40 }, xaxis: { title: { text: mdef[1] }, tickformat: mdef[2] === 'pct' ? '.0%' : undefined } }} />
            ) : (
              <div className="overflow-x-auto scrollbar-thin rounded-lg border border-ink-200"><table className="table-base"><thead><tr><th>Scenario</th>{METRICS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
                <tbody>{summary.map((r, i) => <tr key={i}><td className="whitespace-nowrap">{label(r)}</td>{METRICS.map(([k, , f]) => <td key={k}>{f === 'pct' ? fmt.pct(r[`${k}_mean`]) : fmt.num(r[`${k}_mean`], 2)}<span className="text-ink-400 text-[11.5px]"> ±{f === 'pct' ? fmt.pct(r[`${k}_sd`]) : fmt.num(r[`${k}_sd`], 2)}</span></td>)}</tr>)}</tbody></table></div>
            )}
          </Card>
          {sweep.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card title="Scenario 5 · AI accuracy vs. disagreement" subtitle="Lower AI accuracy → more AI–human disagreement">
                <Plot ariaLabel="AI accuracy versus disagreement and final accuracy" height={300}
                  data={[{ type: 'scatter', mode: 'lines+markers', name: 'AI–human disagreement', x: acc, y: sweep.map((r) => r.ai_human_disagreement_rate_mean), line: { color: SERIES[0], width: 2 }, marker: { size: 8 } },
                    { type: 'scatter', mode: 'lines+markers', name: 'Final diagnostic accuracy', x: acc, y: sweep.map((r) => r.diagnostic_accuracy_final_mean), line: { color: SERIES[1], width: 2 }, marker: { size: 8 } }]}
                  layout={{ xaxis: { title: { text: 'AI accuracy parameter' }, tickformat: '.0%' }, yaxis: { tickformat: '.0%', range: [0, 1] } }} />
              </Card>
              <Card title="Scenario 5 · AI accuracy vs. efficiency" subtitle="Diagnosis time and reassessments">
                <Plot ariaLabel="AI accuracy versus diagnosis time" height={300}
                  data={[{ type: 'scatter', mode: 'lines+markers', name: 'Avg diagnosis time (min)', x: acc, y: sweep.map((r) => r.avg_diagnosis_time_min_mean), line: { color: SERIES[2], width: 2 }, marker: { size: 8 } }]}
                  layout={{ xaxis: { title: { text: 'AI accuracy parameter' }, tickformat: '.0%' }, yaxis: { title: { text: 'minutes' } } }} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
