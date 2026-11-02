import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { LuExternalLink } from 'react-icons/lu';
import { Badge, Card, PageHeader, Spinner, cx } from '../components/ui';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';

const TYPE_COLOR: Record<string, string> = {
  Disease: '#2a78d6', Symptom: '#1baf7a', Treatment: '#eda100', Severity: '#6250d6', ReassessmentTrigger: '#e34948', FollowUp: '#e87ba4', Patient: '#98a1b1',
};

export default function KnowledgeGraph() {
  const { data, loading } = useApi<any>('/api/knowledge-graph');
  const [types, setTypes] = useState<Set<string>>(new Set(['Disease', 'Symptom', 'Treatment', 'ReassessmentTrigger']));
  const [selected, setSelected] = useState<any>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const filtered = useMemo(() => {
    if (!data) return null;
    const nodes = data.nodes.filter((n: any) => types.has(n.type)).map((n: any) => ({ ...n }));
    const ids = new Set(nodes.map((n: any) => n.id));
    const links = data.edges.filter((e: any) => ids.has(e.source) && ids.has(e.target)).map((e: any) => ({ ...e }));
    return { nodes, links };
  }, [data, types]);

  useEffect(() => {
    if (!filtered || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const W = 1000, H = 960;
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom as any);
    const sim = d3.forceSimulation(filtered.nodes as any)
      .force('link', d3.forceLink(filtered.links as any).id((d: any) => d.id).distance((l: any) => (l.relation === 'indicatesDisease' ? 70 : 55)).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('x', d3.forceX(W / 2).strength(0.07))
      .force('y', d3.forceY(H / 2).strength(0.1))
      .force('collide', d3.forceCollide().radius((d: any) => (d.type === 'Disease' ? 26 : 12)));
    const link = g.append('g').selectAll('line').data(filtered.links).join('line')
      .attr('stroke', (d: any) => (d.relation === 'differentialOf' ? '#e66767' : 'rgba(17,26,48,0.12)'))
      .attr('stroke-width', (d: any) => (d.weight ? 0.6 + d.weight * 1.8 : 1))
      .attr('stroke-dasharray', (d: any) => (d.relation === 'differentialOf' ? '4 3' : null));
    const node = g.append('g').selectAll('g').data(filtered.nodes).join('g').style('cursor', 'pointer')
      .on('click', (_e: any, d: any) => api.get(`/api/knowledge-graph/node/${encodeURIComponent(d.id)}`).then(setSelected))
      .call(d3.drag<any, any>().on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; }).on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any);
    node.append('circle').attr('r', (d: any) => (d.type === 'Disease' ? 16 : d.type === 'Patient' ? 5 : 8))
      .attr('fill', (d: any) => TYPE_COLOR[d.type] || '#888').attr('stroke', '#ffffff').attr('stroke-width', 2)
      .attr('opacity', (d: any) => (d.type === 'Disease' && !d.classifier_supported ? 0.6 : 1));
    node.append('text').text((d: any) => (d.type === 'Disease' || d.type === 'Symptom' ? d.label : ''))
      .attr('x', (d: any) => (d.type === 'Disease' ? 20 : 11)).attr('y', 4)
      .attr('font-size', (d: any) => (d.type === 'Disease' ? 13 : 10)).attr('fill', (d: any) => (d.type === 'Disease' ? '#111a30' : '#586378'))
      .attr('font-weight', (d: any) => (d.type === 'Disease' ? 600 : 400)).style('pointer-events', 'none');
    node.append('title').text((d: any) => `${d.type}: ${d.label}`);
    sim.on('tick', () => {
      filtered.nodes.forEach((d: any) => { d.x = Math.max(30, Math.min(W - 160, d.x)); d.y = Math.max(20, Math.min(H - 20, d.y)); });
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
    const fit = () => {
      const xs = filtered.nodes.map((d: any) => d.x), ys = filtered.nodes.map((d: any) => d.y);
      if (!xs.length) return;
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 150, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
      const k = Math.min(2.2, W / (x1 - x0), H / (y1 - y0));
      svg.transition().duration(600).call(zoom.transform as any, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));
    };
    sim.on('end', fit);
    const tid = setTimeout(fit, 1600);
    return () => { sim.stop(); clearTimeout(tid); };
  }, [filtered]);

  const toggle = (t: string) => { const s = new Set(types); s.has(t) ? s.delete(t) : s.add(t); setTypes(s); };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ontology · NetworkX" title="Knowledge graph explorer"
        description="The ontology (rdflib/OWL) instantiated as a NetworkX graph: diseases, symptoms (indicatesDisease, weighted), simulated treatment stages (treatedBy), differentials, reassessment triggers and per-patient case nodes added by live workflow runs. Drag to rearrange, scroll to zoom, click a node for details and sources." />
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_COLOR).map(([t, c]) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={types.has(t)} className={cx('chip ring-1 ring-inset transition', types.has(t) ? 'bg-ink-100 text-ink-900 ring-ink-200' : 'text-ink-500 ring-ink-200')}>
            <span className="size-2.5 rounded-full" style={{ background: c }} />{t} {data?.counts?.[t] !== undefined && <span className="text-ink-500">({data.counts[t]})</span>}
          </button>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1fr_360px] gap-6">
        <Card className="p-2 overflow-hidden">
          {loading ? <Spinner /> : <svg ref={svgRef} viewBox="0 0 1000 960" className="w-full h-[660px]" role="img" aria-label="Interactive knowledge graph" />}
        </Card>
        <Card title={selected ? selected.label : 'Node details'} subtitle={selected ? `${selected.type} · ${selected.id}` : 'Click any node'}>
          {selected ? (
            <div className="space-y-3 text-sm">
              {selected.summary && <p className="text-ink-600">{selected.summary}</p>}
              {selected.description && <p className="text-ink-600">{selected.description}</p>}
              {selected.type === 'Disease' && <Badge tone={selected.classifier_supported ? 'emerald' : 'amber'}>{selected.classifier_supported ? 'image classifier enabled' : 'classifier disabled (no dataset support)'}</Badge>}
              {selected.p_response !== undefined && <div className="text-xs text-ink-500">Simulated stage: {selected.weeks} weeks, response parameter {selected.p_response} (synthetic)</div>}
              <ul className="space-y-1.5 max-h-[460px] overflow-y-auto scrollbar-thin pr-1">
                {selected.neighbours.map((n: any, i: number) => (
                  <li key={i} className="rounded-lg bg-ink-50 border border-ink-200 px-2.5 py-1.5">
                    <div className="text-xs text-ink-500">{n.direction === 'out' ? '→' : '←'} {n.relation}</div>
                    <div className="text-ink-800">{n.label}</div>
                    {n.source_url && <a href={n.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-1">source <LuExternalLink className="size-3" /></a>}
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-sm text-ink-500">Dashed red edges are <i>differentialOf</i> relations. Edge thickness on symptom links reflects the symptom weight used in KG verification.</p>}
        </Card>
      </div>
    </div>
  );
}
