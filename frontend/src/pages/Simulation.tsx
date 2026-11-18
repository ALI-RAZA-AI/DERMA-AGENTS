import React, { useMemo, useState } from 'react';
import { LuActivity, LuBuilding2, LuClock, LuGauge, LuPause, LuPlay, LuRotateCcw, LuStethoscope, LuTarget, LuUsers } from 'react-icons/lu';
import { Plot, SERIES } from '../components/Plot';
import { Alert, Badge, Card, ErrorBox, LiveDot, PageHeader, Slider, Stat, Tabs, cx } from '../components/ui';
import { api, fmt } from '../lib/api';
import { useInterval } from '../lib/hooks';

const DEFAULTS = { arrival_rate_per_hour: 10, n_dermatologists: 3, ai_accuracy: 0.85, diagnostic_capacity: 2, treatment_capacity: 2,
  operating_minutes: 480, days: 5, workflow: 'ai_assisted', doctor_accuracy: 0.8, confidence_threshold: 0.7, seed: 42, speed: 40 };

function ClinicFloor({ s }: { s: any }) {
  const q = s?.queues || { ai: 0, dermatologist: 0, treatment: 0 };
  const dots = (n: number, c: string) => <>{Array.from({ length: Math.min(n, 40) }, (_, i) => <span key={i} className={cx('size-2.5 rounded-full animate-fade-up', c)} />)}{n > 40 && <span className="text-[11px] text-ink-500">+{n - 40}</span>}</>;
  const rooms = Array.from({ length: s?.busy?.of || 0 }, (_, i) => i < (s?.busy?.dermatologists || 0));
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
      <div className="subtle-panel p-3"><div className="label">Waiting area · AI stations</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.ai, 'bg-brand-500')}</div><div className="text-xs text-ink-500 mt-2">{q.ai} queued · {s?.busy?.ai_stations ?? 0}/{s?.busy?.ai_of ?? 0} AI stations busy</div></div>
      <div className="subtle-panel p-3"><div className="label">Dermatologist queue</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.dermatologist, 'bg-brand-700')}</div><div className="text-xs text-ink-500 mt-2">{q.dermatologist} waiting · congestion {fmt.num(s?.congestion, 2)}</div></div>
      <div className="subtle-panel p-3"><div className="label">Consultation rooms</div><div className="flex flex-wrap gap-2">{rooms.map((b, i) => <span key={i} className={cx('grid place-items-center size-9 rounded-lg text-xs font-medium border', b ? 'bg-brand-100 border-brand-400 text-brand-800 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]' : 'bg-surface border-ink-200 text-ink-400')}>D{i + 1}</span>)}</div><div className="text-xs text-ink-500 mt-2">{s?.busy?.dermatologists ?? 0} of {s?.busy?.of ?? 0} busy</div></div>
      <div className="subtle-panel p-3"><div className="label">Treatment planning</div><div className="flex flex-wrap gap-1.5 min-h-10">{dots(q.treatment, 'bg-green-700')}</div><div className="text-xs text-ink-500 mt-2">{s?.served ?? 0} served · {s?.left ?? 0} left unseen</div></div>
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
    { type: 'scatter', mode: 'lines', name: 'AI queue', x: ts.map((r: any) => r.minute / 60), y: ts.map((r: any) => r.queue_ai), line: { color: SERIES[4], width: 1.5 } },
    { type: 'scatter', mode: 'lines', name: 'Busy dermatologists', x: ts.map((r: any) => r.minute / 60), y: ts.map((r: any) => r.busy_derms), line: { color: SERIES[1], width: 1.5, shape: 'hv' } },
  ], [ts]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mesa agent-based model" title="Clinic simulation" icon={<LuBuilding2 />}
        description="Runs the actual Mesa model in the backend (1 step = 1 simulated minute). Patients arrive by a Poisson process, queue for AI stations and dermatologists, and leave if their waiting tolerance is exceeded. AI accuracy here is an experiment parameter, independent of the trained image classifier."
        actions={<>
          <button className="btn-primary" disabled={running} onClick={() => act(status?.state === 'paused' ? 'resume' : 'start')}><LuPlay className="size-4" /> {status?.state === 'paused' ? 'Resume' : 'Start'}</button>
          <button className="btn-ghost" disabled={!running} onClick={() => act('pause')}><LuPause className="size-4" /> Pause</button>
          <button className="btn-ghost" onClick={() => act('reset')}><LuRotateCcw className="size-4" /> Reset</button>
        </>} />
      <ErrorBox error={err} />
      <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
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
          <div className="card px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge tone={running ? 'green' : status?.state === 'finished' ? 'sky' : 'slate'}>{running && <LiveDot tone="green" />}<span className="capitalize">{status?.state || 'idle'}</span></Badge>
            {status?.minute !== undefined && <span className="text-[13px] text-ink-600 tabular-nums">Day {status.day} · minute {status.minute} / {status.total_minutes} {status.clinic_open ? '' : '(closed — finishing patients inside)'}</span>}
            {status?.progress !== undefined && <div className="flex-1 min-w-40 flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Simulation progress"><div className={cx('h-full rounded-full transition-[width] duration-500', status.state === 'finished' ? 'bg-green-700' : 'bg-brand-500')} style={{ width: `${Math.min(100, status.progress * 100)}%` }} /></div><span className="text-[12px] text-ink-500 tabular-nums w-10 text-right">{Math.min(100, Math.round(status.progress * 100))}%</span></div>}
          </div>
          {!status || status.state === 'idle' ? <Alert title="Ready">Set parameters and press Start. Different parameter values produce different queueing behaviour — try raising the arrival rate or removing a dermatologist.</Alert> : null}
          {status?.state && status.state !== 'idle' && <Card title="Clinic floor (live)"><ClinicFloor s={status} /></Card>}
          {m && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Avg waiting time" value={`${fmt.num(m.avg_waiting_time_min)} min`} hint={`p90 ${fmt.num(m.p90_waiting_time_min)} min`} icon={<LuClock />} />
              <Stat label="Avg diagnosis time" value={`${fmt.num(m.avg_diagnosis_time_min)} min`} hint="AI station + review" icon={<LuStethoscope />} />
              <Stat label="Patients served" value={`${m.patients_served} / ${m.arrived}`} hint={`${m.left_without_being_seen} left unseen`} icon={<LuUsers />} tone="green" />
              <Stat label="Derm. utilization" value={fmt.pct(m.dermatologist_utilization)} hint={`${fmt.num(m.doctor_workload_consults_per_doctor_day)} consults / doctor / day`} icon={<LuGauge />} tone="green" />
              <Stat label="AI–human disagreement" value={fmt.pct(m.ai_human_disagreement_rate)} hint="share of reviewed cases" icon={<LuActivity />} />
              <Stat label="Final diagnostic accuracy" value={fmt.pct(m.diagnostic_accuracy_final)} hint="vs synthetic ground truth" icon={<LuTarget />} tone="green" />
              <Stat label="Reassessment rate" value={fmt.pct(m.reassessment_rate)} hint={`KG agreement ${fmt.pct(m.kg_agreement_rate)}`} icon={<LuRotateCcw />} />
              <Stat label="Simulated treatment success" value={fmt.pct(m.simulated_treatment_success_rate)} hint="synthetic response model" icon={<LuActivity />} tone="green" />
            </div>
          )}
          {metrics && (
            <Card action={<Tabs tabs={[{ id: 'queues', label: 'Queues' }, { id: 'agents', label: 'Agents' }, { id: 'events', label: 'Event log' }]} value={tab} onChange={setTab} />}
              title="Live model output" subtitle="Collected with Mesa DataCollector every 5 simulated minutes">
              {tab === 'queues' && <Plot ariaLabel="Queue length over time" height={300} data={tsData} layout={{ xaxis: { title: { text: 'simulated hours (all days)' } }, yaxis: { title: { text: 'patients / doctors' } } }} />}
              {tab === 'agents' && (
                <div className="overflow-auto scrollbar-thin max-h-80 rounded-lg border border-ink-200"><table className="table-base"><thead><tr><th>Agent</th><th>ID</th><th>Activity</th></tr></thead>
                  <tbody>{metrics.agents.map((a: any, i: number) => <tr key={i}><td>{a.agent}</td><td>{a.id ?? '—'}</td><td className="text-ink-600">{Object.entries(a).filter(([k]) => !['agent', 'id'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v as number * 100) / 100 : v}`).join(' · ')}</td></tr>)}</tbody></table></div>
              )}
              {tab === 'events' && (
                <ul className="space-y-1 max-h-80 scroll-area scrollbar-thin text-[12px] tabular-nums">
                  {(status?.recent_events || []).slice().reverse().map((e: any, i: number) => (
                    <li key={i} className="text-ink-600 px-2 py-1 rounded-md even:bg-ink-50 [overflow-wrap:anywhere]"><span className="text-ink-400">d{e.day} t{e.t}</span> <span className="text-brand-700 font-medium">{e.agent}#{e.agent_id}</span> {e.event} {Object.entries(e).filter(([k]) => !['t', 'day', 'agent', 'agent_id', 'event'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')}</li>
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
