import React, { useMemo, useState } from 'react';
import { LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu';
import { Plot, SERIES } from '../components/Plot';
import { Alert, Badge, Card, ErrorBox, PageHeader, Slider, Stat, Tabs, cx } from '../components/ui';
import { api, fmt } from '../lib/api';
import { useInterval } from '../lib/hooks';

const DEFAULTS = { arrival_rate_per_hour: 10, n_dermatologists: 3, ai_accuracy: 0.85, diagnostic_capacity: 2, treatment_capacity: 2,
  operating_minutes: 480, days: 5, workflow: 'ai_assisted', doctor_accuracy: 0.8, confidence_threshold: 0.7, seed: 42, speed: 40 };

function ClinicFloor({ s }: { s: any }) {
  const q = s?.queues || { ai: 0, dermatologist: 0, treatment: 0 };
  const dots = (n: number, c: string) => Array.from({ length: Math.min(n, 40) }, (_, i) => <span key={i} className={cx('size-2.5 rounded-full animate-fade-up', c)} />);
  const rooms = Array.from({ length: s?.busy?.of || 0 }, (_, i) => i < (s?.busy?.dermatologists || 0));
  return (
    <div className="grid md:grid-cols-4 gap-3 text-sm">
      <div className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="label">Waiting area → AI</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.ai, 'bg-brand-500')}</div><div className="text-xs text-ink-500 mt-2">{q.ai} queued · {s?.busy?.ai_stations ?? 0}/{s?.busy?.ai_of ?? 0} AI stations busy</div></div>
      <div className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="label">Dermatologist queue</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.dermatologist, 'bg-violet-500')}</div><div className="text-xs text-ink-500 mt-2">{q.dermatologist} waiting · congestion {fmt.num(s?.congestion, 2)}</div></div>
      <div className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="label">Consultation rooms</div><div className="flex flex-wrap gap-2">{rooms.map((b, i) => <span key={i} className={cx('grid place-items-center size-9 rounded-lg text-xs font-medium border', b ? 'bg-violet-50 border-violet-300 text-violet-600' : 'bg-ink-50 border-ink-200 text-ink-500')}>D{i + 1}</span>)}</div><div className="text-xs text-ink-500 mt-2">{s?.busy?.dermatologists ?? 0} of {s?.busy?.of ?? 0} busy</div></div>
      <div className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="label">Treatment planning</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.treatment, 'bg-emerald-500')}</div><div className="text-xs text-ink-500 mt-2">{s?.served ?? 0} served · {s?.left ?? 0} left unseen</div></div>
    </div>
  );
}

export default function Simulation() {
  const [p, setP] = useState<any>(DEFAULTS);
  const [status, setStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'queues' | 'agents' | 'events'>('queues');
  const running = status?.state === 'running';

  const poll = async () => {
    try {
      const s = await api.get('/api/simulation/status'); setStatus(s);
      if (s.state !== 'idle') setMetrics(await api.get('/api/simulation/metrics'));
    } catch (e: any) { setErr(e.message); }
  };
  useInterval(poll, running ? 700 : null);
  React.useEffect(() => { poll(); }, []);

  const act = async (kind: 'start' | 'pause' | 'reset' | 'resume') => {
    setErr(null);
    try {
      const r = kind === 'start' ? await api.post('/api/simulation/start', p) : await api.post(`/api/simulation/${kind}`);
      setStatus(r); if (kind === 'reset') setMetrics(null); else setTimeout(poll, 200);
    } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (v: any) => setP({ ...p, [k]: v });
  const ts = metrics?.timeseries || [];
  const m = metrics?.metrics;
  const tsData = useMemo(() => [
    { type: 'scatter', mode: 'lines', name: 'Dermatologist queue', x: ts.map((r: any) => r.minute / 60), y: ts.map((r: any) => r.queue_derm), line: { color: SERIES[0], width: 2 } },
    { type: 'scatter', mode: 'lines', name: 'AI queue', x: ts.map((r: any) => r.minute / 60), y: ts.map((r: any) => r.queue_ai), line: { color: SERIES[1], width: 2 } },
    { type: 'scatter', mode: 'lines', name: 'Busy dermatologists', x: ts.map((r: any) => r.minute / 60), y: ts.map((r: any) => r.busy_derms), line: { color: SERIES[2], width: 2 } },
  ], [ts]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mesa agent-based model" title="Clinic simulation"
        description="Runs the actual Mesa model in the backend (1 step = 1 simulated minute). Patients arrive by a Poisson process, queue for AI stations and dermatologists, and leave if their waiting tolerance is exceeded. AI accuracy here is an experiment parameter, independent of the trained image classifier."
        actions={<>
          <button className="btn-primary" disabled={running} onClick={() => act(status?.state === 'paused' ? 'resume' : 'start')}><LuPlay /> {status?.state === 'paused' ? 'Resume' : 'Start'}</button>
          <button className="btn-ghost" disabled={!running} onClick={() => act('pause')}><LuPause /> Pause</button>
          <button className="btn-ghost" onClick={() => act('reset')}><LuRotateCcw /> Reset</button>
        </>} />
      <ErrorBox error={err} />
      <div className="grid xl:grid-cols-[340px_1fr] gap-6">
        <Card title="Parameters" subtitle="Applied when you press Start">
          <div className="space-y-4">
            <div><span className="label">Workflow</span>
              <select className="input" value={p.workflow} onChange={(e) => set('workflow')(e.target.value)}>
                <option value="traditional">Traditional (no AI)</option><option value="ai_assisted">AI-assisted</option><option value="knowledge_augmented">Knowledge-augmented</option>
              </select></div>
            <Slider label="Arrival rate (patients / hour)" value={p.arrival_rate_per_hour} min={2} max={30} step={0.5} onChange={set('arrival_rate_per_hour')} />
            <Slider label="Dermatologists" value={p.n_dermatologists} min={1} max={8} onChange={set('n_dermatologists')} />
            <Slider label="AI accuracy (experiment)" value={p.ai_accuracy} min={0.4} max={1} step={0.01} onChange={set('ai_accuracy')} format={(v) => fmt.pct(v, 0)} />
            <Slider label="Diagnostic capacity (AI stations)" value={p.diagnostic_capacity} min={1} max={6} onChange={set('diagnostic_capacity')} />
            <Slider label="Treatment capacity (desks)" value={p.treatment_capacity} min={1} max={6} onChange={set('treatment_capacity')} />
            <Slider label="Operating time (hours / day)" value={p.operating_minutes / 60} min={2} max={12} onChange={(v) => set('operating_minutes')(v * 60)} />
            <Slider label="Days" value={p.days} min={1} max={10} onChange={set('days')} />
            <Slider label="Simulation speed (min / tick)" value={p.speed} min={1} max={200} onChange={set('speed')} />
          </div>
        </Card>
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={running ? 'emerald' : status?.state === 'finished' ? 'sky' : 'slate'}>{status?.state || 'idle'}</Badge>
            {status?.minute !== undefined && <span className="text-sm text-ink-600">Day {status.day} · minute {status.minute} / {status.total_minutes} {status.clinic_open ? '' : '(closed — finishing patients inside)'}</span>}
            {status?.progress !== undefined && <div className="flex-1 min-w-40 h-1.5 rounded-full bg-ink-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-500 to-sky-400" style={{ width: `${status.progress * 100}%` }} /></div>}
          </div>
          {!status || status.state === 'idle' ? <Alert title="Ready">Set parameters and press Start. Different parameter values produce different queueing behaviour — try raising the arrival rate or removing a dermatologist.</Alert> : null}
          {status?.state && status.state !== 'idle' && <Card title="Clinic floor (live)"><ClinicFloor s={status} /></Card>}
          {m && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Avg waiting time" value={`${fmt.num(m.avg_waiting_time_min)} min`} hint={`p90 ${fmt.num(m.p90_waiting_time_min)} min`} tone="amber" />
              <Stat label="Avg diagnosis time" value={`${fmt.num(m.avg_diagnosis_time_min)} min`} tone="sky" />
              <Stat label="Patients served" value={`${m.patients_served} / ${m.arrived}`} hint={`${m.left_without_being_seen} left unseen`} tone="emerald" />
              <Stat label="Derm. utilization" value={fmt.pct(m.dermatologist_utilization)} hint={`${fmt.num(m.doctor_workload_consults_per_doctor_day)} consults / doctor / day`} tone="violet" />
              <Stat label="AI–human disagreement" value={fmt.pct(m.ai_human_disagreement_rate)} tone="cyan" />
              <Stat label="Final diagnostic accuracy" value={fmt.pct(m.diagnostic_accuracy_final)} hint="vs synthetic ground truth" tone="emerald" />
              <Stat label="Reassessment rate" value={fmt.pct(m.reassessment_rate)} hint={`KG agreement ${fmt.pct(m.kg_agreement_rate)}`} tone="rose" />
              <Stat label="Simulated treatment success" value={fmt.pct(m.simulated_treatment_success_rate)} tone="sky" />
            </div>
          )}
          {metrics && (
            <Card action={<Tabs tabs={[{ id: 'queues', label: 'Queues' }, { id: 'agents', label: 'Agents' }, { id: 'events', label: 'Event log' }]} value={tab} onChange={setTab} />}
              title="Live model output" subtitle="Collected with Mesa DataCollector every 5 simulated minutes">
              {tab === 'queues' && <Plot ariaLabel="Queue length over time" height={300} data={tsData} layout={{ xaxis: { title: { text: 'simulated hours (all days)' } }, yaxis: { title: { text: 'patients / doctors' } } }} />}
              {tab === 'agents' && (
                <div className="overflow-x-auto"><table className="table-base"><thead><tr><th>Agent</th><th>ID</th><th>Activity</th></tr></thead>
                  <tbody>{metrics.agents.map((a: any, i: number) => <tr key={i}><td>{a.agent}</td><td>{a.id ?? '—'}</td><td className="text-ink-600">{Object.entries(a).filter(([k]) => !['agent', 'id'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v as number * 100) / 100 : v}`).join(' · ')}</td></tr>)}</tbody></table></div>
              )}
              {tab === 'events' && (
                <ul className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin text-xs font-mono">
                  {(status?.recent_events || []).slice().reverse().map((e: any, i: number) => (
                    <li key={i} className="text-ink-600"><span className="text-ink-400">d{e.day} t{e.t}</span> <span className="text-brand-600">{e.agent}#{e.agent_id}</span> {e.event} {Object.entries(e).filter(([k]) => !['t', 'day', 'agent', 'agent_id', 'event'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
