import React, { useMemo, useState } from 'react';
import { LuArrowRight, LuBookOpen, LuExternalLink, LuSearch } from 'react-icons/lu';
import { References } from '../components/CaseView';
import { AiWorking, Alert, Badge, Card, CardSkeleton, ErrorBox, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';

const EXAMPLES = ['When should a changing mole be assessed urgently?', 'How is eczema treatment stepped up?',
  'How can seborrheic keratosis be told apart from melanoma?', 'What are the main symptoms of psoriasis?', 'How is basal cell carcinoma diagnosed?'];

export default function Rag() {
  const { data: src } = useApi<any>('/api/rag/sources');
  const [q, setQ] = useState(EXAMPLES[0]);
  const [disease, setDisease] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const ask = async (question = q) => {
    setBusy(true); setErr(null);
    try { setRes(await api.post('/api/rag/query', { question, k: 4, disease: disease || null })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const chunks = useMemo(() => (src?.chunks || []).filter((c: any) => !filter || c.disease === filter), [src, filter]);
  const diseases = useMemo(() => Array.from(new Set<string>((src?.chunks || []).map((c: any) => c.disease))), [src]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LangChain RAG" title="RAG knowledge base" icon={<LuBookOpen />}
        description="Each question goes through a LangChain retriever over the vector store, is enriched with knowledge-graph facts and answered with numbered citations. The knowledge base is paraphrased from public sources listed below; it is not clinically validated." />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex flex-col md:flex-row gap-3">
          <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} minLength={3} maxLength={500} aria-label="Question" />
          <select className="input md:!w-52" value={disease} onChange={(e) => setDisease(e.target.value)} aria-label="Focus disease">
            <option value="">Any disease</option>{diseases.filter((d) => d !== 'Dataset').map((d) => <option key={d}>{d}</option>)}
          </select>
          <button className="btn-primary" disabled={busy}><LuSearch className="size-4" /> {busy ? 'Retrieving…' : 'Ask'}</button>
        </form>
        <div className="flex flex-wrap items-center gap-2 mt-3"><span className="text-[12px] text-ink-500 mr-1">Try:</span>{EXAMPLES.map((e) => <button key={e} type="button" disabled={busy} className="chip bg-surface text-ink-600 ring-1 ring-inset ring-ink-200 hover:ring-brand-300 hover:bg-brand-50 hover:text-ink-900 transition-colors disabled:opacity-50" onClick={() => { setQ(e); ask(e); }}>{e}</button>)}</div>
      </Card>
      <ErrorBox error={err} />
      {busy && <AiWorking label="Retrieving passages and composing a grounded answer" steps={['Embed query', 'Vector retrieval', 'Knowledge-graph facts', 'Grounded answer']} />}
      {res && (
        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Grounded answer" subtitle={<span>Generator: <Badge tone={res.generator.startsWith('LLM') ? 'sky' : 'amber'}>{res.generator}</Badge></span>}>
            <p className="text-[13.5px] text-ink-800 leading-relaxed whitespace-pre-line">{res.answer}</p>
            {res.kg_facts?.length > 0 && (
              <div className="mt-4 space-y-2">{res.kg_facts.map((f: any) => (
                <div key={f.disease} className="subtle-panel p-3 text-xs text-ink-600">
                  <div className="text-[13px] text-ink-900 font-semibold mb-1">KG facts · {f.disease}</div>
                  <div>Key features: {f.key_symptoms.join(', ')}</div>
                  {f.differentials.length > 0 && <div>Differentials: {f.differentials.join(', ')}</div>}
                  <div>Reassessment: {f.reassessment_triggers.join('; ')}</div>
                  <div className="flex flex-wrap items-center gap-1">Simulated pathway: {f.simulated_pathway.map((x: string, i: number) => <React.Fragment key={i}>{i > 0 && <LuArrowRight className="size-3 text-ink-400" aria-label="then" />}{x}</React.Fragment>)}</div>
                </div>))}</div>
            )}
            <div className="mt-4"><Alert tone="warn">{res.disclaimer}</Alert></div>
          </Card>
          <References refs={res.references} />
        </div>
      )}
      <Card title="Knowledge base contents" subtitle={src ? `${src.n_chunks} indexed passages · ${src.embedding} · ${src.vector_store}` : ''}
        action={!src ? undefined : <select className="input w-full sm:!w-52" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by disease"><option value="">All diseases</option>{diseases.map((d) => <option key={d}>{d}</option>)}</select>}>
        {!src && <div className="grid md:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} lines={2} />)}</div>}
        <div className="grid md:grid-cols-2 gap-3 max-h-[520px] scroll-area scrollbar-thin pr-1">
          {chunks.map((c: any) => (
            <div key={c.id} className="subtle-panel p-3 text-sm">
              <div className="flex flex-wrap gap-1.5 mb-1.5"><Badge tone="sky">{c.disease}</Badge><Badge>{c.section}</Badge></div>
              <p className="text-ink-600 text-[13px] leading-relaxed">{c.text}</p>
              <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[12px] link inline-flex items-center gap-1 mt-1.5">{c.source_title} <LuExternalLink className="size-3" /></a>
            </div>
          ))}
        </div>
      </Card>
      {src && (
        <Card title="Bibliography" subtitle="Public sources behind the knowledge base and knowledge graph (retrieved 2026-11-01)">
          <ol className="grid md:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] list-decimal marker:text-ink-400 pl-5">
            {Object.values<any>(src.sources).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="link">{s.title}</a> <span className="text-ink-400">— {s.publisher}</span></li>)}
          </ol>
        </Card>
      )}
    </div>
  );
}
