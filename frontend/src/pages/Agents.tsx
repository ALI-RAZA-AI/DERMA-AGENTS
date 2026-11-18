import React, { useEffect, useMemo, useState } from 'react';
import { References, ReviewCard, RoutePath, TraceTimeline, TreatmentCard, PredictionCard } from '../components/CaseView';
import { AiWorking, Badge, Card, CardSkeleton, Empty, LiveDot, PageHeader, Skeleton, Tabs, cx } from '../components/ui';
import { LuBrain, LuBuilding2, LuPill, LuPlay, LuStethoscope, LuUser, LuWorkflow } from 'react-icons/lu';
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
    <div className="overflow-x-auto scrollbar-thin -mx-1 px-1"><svg viewBox="0 0 1000 420" className="w-full min-w-[640px] h-auto" role="img" aria-label="LangGraph workflow with the executed route highlighted">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style={{ fill: 'var(--color-ink-300)' }} /></marker>
        <marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style={{ fill: 'var(--color-brand-600)' }} /></marker>
      </defs>
      {graph.edges.map((e: any, i: number) => {
        const a = POS[e.source], b = POS[e.target]; if (!a || !b) return null;
        const on = pairs.has(`${e.source}>${e.target}`);
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const sx = a[0] + (dx / len) * 62, sy = a[1] + (dy / len) * 24, ex = b[0] - (dx / len) * 66, ey = b[1] - (dy / len) * 26;
        return <line key={i} x1={sx} y1={sy} x2={ex} y2={ey} style={{ stroke: on ? 'var(--color-brand-600)' : 'var(--color-ink-300)' }} strokeWidth={on ? 2.2 : 1.3} className={on ? 'transition-all duration-500' : undefined}
          strokeDasharray={e.conditional ? '6 5' : undefined} markerEnd={`url(#${on ? 'arr2' : 'arr'})`} />;
      })}
      {Object.entries(POS).map(([n, [x, y]]) => {
        const on = visited.has(n) || (n === '__start__' && active.length > 0) || (n === '__end__' && active.length > 0);
        const term = n.startsWith('__');
        return (
          <g key={n} transform={`translate(${x},${y})`}>
            <rect x={term ? -38 : -74} y={-25} width={term ? 76 : 148} height={50} rx={term ? 25 : 12}
              style={{ fill: on ? (term ? 'var(--color-green-100)' : 'var(--color-brand-100)') : 'var(--color-surface)', stroke: on ? (term ? 'var(--color-forest)' : '#38BDF8') : 'var(--color-ink-200)' }} strokeWidth={on ? 1.6 : 1} />
            <text textAnchor="middle" y={term ? 5 : -2} fontSize="13" style={{ fill: on ? 'var(--color-ink-900)' : 'var(--color-ink-500)' }} fontWeight={600}>{n.replace(/__/g, '').replace(/_/g, ' ')}</text>
            {!term && <text textAnchor="middle" y={15} fontSize="10.5" style={{ fill: 'var(--color-ink-500)' }}>{AGENT_OF[n]}</text>}
          </g>
        );
      })}
    </svg></div>
  );
}

const AGENT_CARDS: [string, string, any][] = [
  ['PatientAgent', 'Patient Agent', LuUser], ['ClinicEnvironmentAgent', 'Clinic Environment', LuBuilding2], ['AIDiagnosticAgent', 'AI Diagnostic Agent', LuBrain],
  ['DermatologistAgent', 'Dermatologist Agent', LuStethoscope], ['TreatmentAgent', 'Treatment Agent', LuPill],
];

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
      <PageHeader eyebrow="LangGraph · LangChain" title="Multi-agent workflow visualization" icon={<LuWorkflow />}
        description="Each case is a stateful LangGraph run. The highlighted path is the route actually executed for the selected case; dashed edges are conditional routes. The log shows real agent actions (classifier calls, KG queries, RAG retrieval)."
        actions={<>
          <span className="w-full text-[12px] font-medium text-ink-500">Run a demo case</span>
          <button className="btn-ghost btn-sm" disabled={running} onClick={() => runDemo('acne')}><LuPlay className="size-3.5" /> Acne image + acne symptoms</button>
          <button className="btn-ghost btn-sm" disabled={running} onClick={() => runDemo('conflict')}><LuPlay className="size-3.5" /> Acne image + psoriasis symptoms</button>
          <button className="btn-ghost btn-sm" disabled={running} onClick={() => runDemo('lesion')}><LuPlay className="size-3.5" /> Pigmented lesion</button>
        </>} />
      {running && <AiWorking label="Running the five agents" steps={['Patient Agent', 'Clinic Environment', 'AI Diagnostic Agent', 'Dermatologist Agent', 'Treatment Agent']} />}
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <Card title="LangGraph state machine" subtitle={kase ? `Case ${kase.case_id?.slice(0, 12)} — ${kase.route_log?.length} node executions` : 'Select a case'}>
          {graph ? <WorkflowGraph graph={graph} active={kase?.route_log || []} /> : <Skeleton className="h-72 w-full" />}
          {kase && <div className="mt-3"><RoutePath route={kase.route_log} /></div>}
        </Card>
        <Card title="Recent cases" subtitle="Stored in the database">
          {!cases?.length ? <Empty>No cases yet — run a demo above or use AI Skin Diagnosis.</Empty> : (
            <ul className="grid sm:grid-cols-2 2xl:grid-cols-1 gap-1.5 max-h-[420px] scroll-area scrollbar-thin pr-1">
              {cases.map((c) => (
                <li key={c.id}><button onClick={() => setSel(c.id)} aria-pressed={sel === c.id} className={cx('w-full text-left rounded-lg px-3 py-2 border transition-colors duration-150', sel === c.id ? 'bg-brand-50 border-brand-300' : 'bg-surface border-ink-200 hover:bg-ink-50 hover:border-ink-300')}>
                  <div className="flex items-center gap-2 text-[13.5px] min-w-0"><span className="text-ink-900 font-medium truncate">{c.final_diagnosis || 'Referral'}</span><Badge className="ml-auto" tone={c.decision === 'accept' ? 'green' : c.decision === 'human_override' ? 'sky' : 'amber'}>{c.decision}</Badge></div>
                  <div className="text-[12px] text-ink-500 mt-0.5">{new Date(c.created * 1000).toLocaleString()} · AI {c.ai_status} · {c.reassessments} reassess.</div>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {kase && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {AGENT_CARDS.map(([a, label, Icon], i) => {
              const n = agentCounts[a] || 0;
              return (
                <div key={a} className={cx('card px-4 py-3 animate-fade-up transition-shadow duration-300', n > 0 && 'ring-1 ring-brand-200 shadow-[0_0_0_4px_rgba(56,189,248,0.10)]')} style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-500"><Icon className={cx('size-4', n > 0 ? 'text-brand-600' : 'text-ink-400')} />{label}{n > 0 && <span className="ml-auto"><LiveDot tone="sky" /></span>}</div>
                  <div className="text-[22px] font-semibold text-ink-900 tabular-nums mt-1">{n}</div>
                  <div className="text-[12px] text-ink-400">logged actions</div>
                </div>
              );
            })}
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
                    <div key={k} className="mb-3 last:mb-0"><div className="label capitalize">{k.replace('_', ' ')}</div>
                      <ul className="text-[13px] text-ink-600 list-disc marker:text-ink-300 pl-4 space-y-0.5">{(s as any)[k].map((x: string) => <li key={x}>{x}</li>)}</ul></div>
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
