import React, { useEffect, useMemo, useState } from 'react';
import { References, ReviewCard, RoutePath, TraceTimeline, TreatmentCard, PredictionCard } from '../components/CaseView';
import { Badge, Card, Empty, PageHeader, Spinner, Tabs, cx } from '../components/ui';
import { api } from '../lib/api';
import { useApi, useMeta } from '../lib/hooks';

// fixed layout for the LangGraph nodes (x, y in a 1000 x 420 canvas)
const POS: Record<string, [number, number]> = {
  __start__: [40, 60], patient_intake: [170, 60], ai_diagnosis: [330, 60], confidence_evaluation: [500, 60],
  further_assessment: [500, 200], dermatologist_review: [680, 60], kg_verification: [860, 60],
  reassessment: [770, 220], treatment_simulation: [860, 340], follow_up: [640, 340], __end__: [420, 340],
};
const AGENT_OF: Record<string, string> = {
  patient_intake: 'Patient + Clinic', ai_diagnosis: 'AI Diagnostic', confidence_evaluation: 'AI Diagnostic', further_assessment: 'Dermatologist',
  dermatologist_review: 'Dermatologist', kg_verification: 'Dermatologist + KG', reassessment: 'Clinic Environment', treatment_simulation: 'Treatment', follow_up: 'Treatment',
};

function WorkflowGraph({ graph, active }: { graph: any; active: string[] }) {
  const visited = new Set(active);
  const pairs = new Set(active.map((n, i) => `${i === 0 ? '__start__' : active[i - 1]}>${n}`));
  if (active.length) pairs.add(`${active[active.length - 1]}>__end__`);
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-auto" role="img" aria-label="LangGraph workflow with the executed route highlighted">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#c3c9d3" /></marker>
        <marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#3a74e0" /></marker>
      </defs>
      {graph.edges.map((e: any, i: number) => {
        const a = POS[e.source], b = POS[e.target]; if (!a || !b) return null;
        const on = pairs.has(`${e.source}>${e.target}`);
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const sx = a[0] + (dx / len) * 62, sy = a[1] + (dy / len) * 24, ex = b[0] - (dx / len) * 66, ey = b[1] - (dy / len) * 26;
        return <line key={i} x1={sx} y1={sy} x2={ex} y2={ey} stroke={on ? '#3a74e0' : '#c3c9d3'} strokeWidth={on ? 2.5 : 1.4}
          strokeDasharray={e.conditional ? '6 5' : undefined} markerEnd={`url(#${on ? 'arr2' : 'arr'})`} />;
      })}
      {Object.entries(POS).map(([n, [x, y]]) => {
        const on = visited.has(n) || (n === '__start__' && active.length > 0) || (n === '__end__' && active.length > 0);
        const term = n.startsWith('__');
        return (
          <g key={n} transform={`translate(${x},${y})`}>
            <rect x={term ? -38 : -70} y={-24} width={term ? 76 : 140} height={48} rx={term ? 24 : 14}
              fill={on ? '#eef4ff' : '#ffffff'} stroke={on ? '#3a74e0' : '#e2e7ee'} strokeWidth={on ? 1.6 : 1} />
            <text textAnchor="middle" y={term ? 4 : -2} fontSize="11.5" fill={on ? '#111a30' : '#586378'} fontWeight={600}>{n.replace(/__/g, '').replace(/_/g, ' ')}</text>
            {!term && <text textAnchor="middle" y={14} fontSize="9.5" fill="#98a1b1">{AGENT_OF[n]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function Agents({ query }: { query: URLSearchParams }) {
  const meta = useMeta();
  const { data: graph } = useApi<any>('/api/workflow/graph');
  const { data: cases, reload } = useApi<any[]>('/api/cases?limit=50');
  const [sel, setSel] = useState<string | null>(query.get('case'));
  const [kase, setKase] = useState<any>(null);
  const [tab, setTab] = useState<'trace' | 'specs'>('trace');
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!sel && cases?.length) setSel(cases[0].id); }, [cases, sel]);
  useEffect(() => { if (sel) api.get(`/api/cases/${sel}`).then(setKase).catch(() => setKase(null)); }, [sel]);
  const agentCounts = useMemo(() => {
    const c: Record<string, number> = {};
    (kase?.trace || []).forEach((t: any) => { if (t.agent) c[t.agent] = (c[t.agent] || 0) + 1; });
    return c;
  }, [kase]);

  const runDemo = async (kind: string) => {
    setRunning(true);
    const presets: Record<string, any> = {
      acne: { age: 19, severity: 'moderate', symptoms: ['comedones', 'oily_skin', 'inflamed_spots', 'face_chest_back'] },
      conflict: { age: 45, severity: 'moderate', symptoms: ['silvery_scales', 'plaques_extensor', 'nail_changes'] },
      lesion: { age: 67, severity: 'moderate', symptoms: ['stuck_on', 'brown_black_lesion', 'older_age', 'warty_surface'] },
    };
    const demos = await api.get<any[]>('/api/demo-images').catch(() => []);
    const want = kind === 'lesion' ? 'Seborrheic' : 'Acne';
    const d = demos.find((x) => x.label.startsWith(want));
    const fd = new FormData();
    fd.append('patient', JSON.stringify(presets[kind]));
    if (d) fd.append('demo_image', d.file);
    try { const c = await api.form('/api/agents/run', fd); setSel(c.case_id); setKase(c); reload(); } finally { setRunning(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LangGraph · LangChain" title="Multi-agent workflow visualization"
        description="Each case is a stateful LangGraph run. The highlighted path is the route actually executed for the selected case; dashed edges are conditional routes. The log shows real agent actions (classifier calls, KG queries, RAG retrieval)."
        actions={<>
          <button className="btn-ghost" disabled={running} onClick={() => runDemo('acne')}>Run demo: acne image + acne symptoms</button>
          <button className="btn-ghost" disabled={running} onClick={() => runDemo('conflict')}>Run demo: acne image + psoriasis symptoms</button>
          <button className="btn-ghost" disabled={running} onClick={() => runDemo('lesion')}>Run demo: pigmented lesion</button>
        </>} />
      {running && <Spinner label="Running the five agents…" />}
      <div className="grid xl:grid-cols-[1fr_340px] gap-6">
        <Card title="LangGraph state machine" subtitle={kase ? `Case ${kase.case_id?.slice(0, 12)} — ${kase.route_log?.length} node executions` : 'Select a case'}>
          {graph ? <WorkflowGraph graph={graph} active={kase?.route_log || []} /> : <Spinner />}
          {kase && <div className="mt-3"><RoutePath route={kase.route_log} /></div>}
        </Card>
        <Card title="Recent cases" subtitle="Stored in the database">
          {!cases?.length ? <Empty>No cases yet — run a demo above or use AI Skin Diagnosis.</Empty> : (
            <ul className="space-y-1.5 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
              {cases.map((c) => (
                <li key={c.id}><button onClick={() => setSel(c.id)} className={cx('w-full text-left rounded-xl px-3 py-2 border transition', sel === c.id ? 'bg-brand-50 border-brand-200' : 'bg-ink-50 border-ink-200 hover:bg-ink-50')}>
                  <div className="flex items-center gap-2 text-sm"><span className="text-ink-900">{c.final_diagnosis || 'Referral'}</span><Badge className="ml-auto" tone={c.decision === 'accept' ? 'emerald' : c.decision === 'human_override' ? 'violet' : 'amber'}>{c.decision}</Badge></div>
                  <div className="text-[11px] text-ink-500 mt-0.5">{new Date(c.created * 1000).toLocaleString()} · AI {c.ai_status} · {c.reassessments} reassess.</div>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {kase && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['PatientAgent', 'ClinicEnvironmentAgent', 'AIDiagnosticAgent', 'DermatologistAgent', 'TreatmentAgent'].map((a) => (
              <div key={a} className="glass px-4 py-3"><div className="text-xs text-ink-500">{a.replace('Agent', ' Agent')}</div><div className="text-xl font-semibold text-ink-900 tabular-nums">{agentCounts[a] || 0}</div><div className="text-[11px] text-ink-400">logged actions</div></div>
            ))}
          </div>
          <Tabs tabs={[{ id: 'trace', label: 'Execution trace & outputs' }, { id: 'specs', label: 'Agent specifications' }]} value={tab} onChange={setTab} />
          {tab === 'trace' ? (
            <div className="grid xl:grid-cols-2 gap-4">
              <Card title="Agent execution log"><TraceTimeline trace={kase.trace} /></Card>
              <div className="space-y-4">
                {kase.ai?.status !== 'no_image' && <PredictionCard ai={kase.ai} />}
                <ReviewCard c={kase} />
                <TreatmentCard t={kase.treatment} f={kase.follow_up} />
                <References refs={kase.review?.evidence?.references} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {meta && Object.entries(meta.agents).map(([name, s]) => (
                <Card key={name} title={name} subtitle={s.note}>
                  {(['responsibilities', 'inputs', 'outputs', 'state', 'decision_rules', 'communicates_with'] as const).map((k) => (
                    <div key={k} className="mb-3"><div className="label">{k.replace('_', ' ')}</div>
                      <ul className="text-sm text-ink-600 list-disc pl-4 space-y-0.5">{(s as any)[k].map((x: string) => <li key={x}>{x}</li>)}</ul></div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
