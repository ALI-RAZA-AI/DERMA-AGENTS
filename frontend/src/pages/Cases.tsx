import React, { useMemo, useState } from 'react';
import { PredictionCard, References, ReviewCard, RoutePath, TreatmentCard } from '../components/CaseView';
import { Badge, Card, Empty, PageHeader, Spinner } from '../components/ui';
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
      <PageHeader eyebrow="Database" title="Patient case history"
        description="Every LangGraph workflow run is stored (synthetic patients only). Select a row to inspect the full stored state: AI output, review, knowledge-graph check, simulated pathway and evidence."
        actions={<><input className="input !w-64" placeholder="Search cases…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cases" /><button className="btn-ghost" onClick={reload}>Refresh</button></>} />
      <Card className="p-0 overflow-hidden">
        {loading ? <div className="p-5"><Spinner /></div> : !rows.length ? <div className="p-5"><Empty>No cases stored yet.</Empty></div> : (
          <div className="overflow-x-auto scrollbar-thin max-h-[460px]">
            <table className="table-base">
              <thead className="sticky top-0 bg-ink-50"><tr><th>Created</th><th>Image</th><th>AI status</th><th>AI prediction</th><th>Conf.</th><th>Decision</th><th>Final diagnosis</th><th>KG</th><th>Outcome</th><th>Reassess.</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(r.id)}>
                    <td className="whitespace-nowrap text-ink-600">{new Date(r.created * 1000).toLocaleString()}</td>
                    <td className="text-ink-500 text-xs">{r.image_name ? (r.image_name.startsWith('demo:') ? 'test image' : 'upload') : '—'}</td>
                    <td><Badge tone={r.ai_status === 'confident' ? 'emerald' : r.ai_status === 'no_image' ? 'slate' : 'amber'}>{r.ai_status}</Badge></td>
                    <td>{r.ai_prediction || '—'}</td><td>{fmt.pct(r.ai_confidence)}</td>
                    <td>{r.decision}</td><td className="text-ink-900">{r.final_diagnosis || 'Referral'}</td><td>{r.kg_status}</td>
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
            {sel.ai?.status !== 'no_image' ? <PredictionCard ai={sel.ai} /> : <Card title="AI Diagnostic Agent"><p className="text-sm text-ink-600">No image supplied for this case.</p></Card>}
            <ReviewCard c={sel} />
            <TreatmentCard t={sel.treatment} f={sel.follow_up} />
            <References refs={sel.review?.evidence?.references} />
          </div>
        </div>
      )}
    </div>
  );
}
