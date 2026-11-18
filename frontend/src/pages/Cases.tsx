import React, { useMemo, useState } from 'react';
import { PredictionCard, References, ReviewCard, RoutePath, TreatmentCard } from '../components/CaseView';
import { Badge, Card, Empty, PageHeader, Skeleton, pretty } from '../components/ui';
import { LuHistory, LuRefreshCw, LuSearch } from 'react-icons/lu';
import { api, fmt } from '../lib/api';
import { useApi } from '../lib/hooks';

export default function Cases() {
  const { data, loading, reload } = useApi<any[]>('/api/cases?limit=300');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any>(null);
  const rows = useMemo(() => (data || []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())), [data, q]);
  const open = async (id: string) => setSel(await api.get(`/api/cases/${id}`));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Database" title="Patient case history" icon={<LuHistory />}
        description="Every LangGraph workflow run is stored (synthetic patients only). Select a row to inspect the full stored state: AI output, review, knowledge-graph check, simulated pathway and evidence."
        actions={<><div className="relative w-full sm:w-64"><LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-400 pointer-events-none" /><input className="input !pl-9" placeholder="Search cases…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cases" /></div><button className="btn-ghost" onClick={reload} disabled={loading}><LuRefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} /> Refresh</button></>} />
      <Card className="!p-0 overflow-hidden" title={<span className="px-5 pt-4 block">Stored cases</span>} subtitle={<span className="px-5 block">{data ? `${rows.length} of ${data.length} cases${q ? ' match your search' : ''} · select a row to inspect it` : 'Loading…'}</span>}>
        {loading && !data ? <div className="p-5 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div> : !rows.length ? <div className="p-5"><Empty>{q ? 'No cases match your search.' : 'No cases stored yet. Run the workflow on the AI Skin Diagnosis page to create one.'}</Empty></div> : (
          <div className="overflow-auto scrollbar-thin max-h-[460px] border-t border-ink-200">
            <table className="table-base">
              <thead className="sticky top-0 z-10"><tr><th>Created</th><th>Image</th><th>AI status</th><th>AI prediction</th><th>Conf.</th><th>Decision</th><th>Final diagnosis</th><th>KG</th><th>Outcome</th><th>Reassess.</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => open(r.id)} className={sel?.case_id === r.id ? 'cursor-pointer [&>td]:!bg-brand-100' : 'cursor-pointer'} tabIndex={0} aria-selected={sel?.case_id === r.id} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(r.id))}>
                    <td className="whitespace-nowrap text-ink-600">{new Date(r.created * 1000).toLocaleString()}</td>
                    <td className="text-ink-500">{r.image_name ? (r.image_name.startsWith('demo:') ? 'test image' : 'upload') : '—'}</td>
                    <td><Badge tone={r.ai_status === 'confident' ? 'green' : r.ai_status === 'no_image' ? 'slate' : 'amber'}>{r.ai_status}</Badge></td>
                    <td>{r.ai_prediction || '—'}</td><td>{fmt.pct(r.ai_confidence)}</td>
                    <td className="whitespace-nowrap">{pretty(r.decision)}</td><td className="text-ink-900 font-medium whitespace-nowrap">{r.final_diagnosis || 'Referral'}</td><td className="whitespace-nowrap">{pretty(r.kg_status)}</td>
                    <td>{r.improved === null ? '—' : r.improved ? 'improved' : 'not improved'}</td><td>{r.reassessments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel && (
        <div className="space-y-4">
          <Card title={`Case ${sel.case_id.slice(0, 12)}`} subtitle={`Patient age ${sel.patient?.age}, ${sel.patient?.gender}, severity ${sel.patient?.severity} · symptoms: ${sel.patient?.symptoms?.join(', ') || 'none'}`}>
            <RoutePath route={sel.route_log || []} />
          </Card>
          <div className="grid xl:grid-cols-2 gap-4">
            {sel.ai?.status !== 'no_image' ? <PredictionCard ai={sel.ai} /> : <Card title="AI Diagnostic Agent"><p className="text-[13px] text-ink-600">No image supplied for this case.</p></Card>}
            <ReviewCard c={sel} />
            <TreatmentCard t={sel.treatment} f={sel.follow_up} />
            <References refs={sel.review?.evidence?.references} />
          </div>
        </div>
      )}
    </div>
  );
}
