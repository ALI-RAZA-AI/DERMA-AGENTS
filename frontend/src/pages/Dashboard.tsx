import React, { useMemo } from 'react';
import { LuActivity, LuBrain, LuClock, LuDatabase, LuGauge, LuLayoutDashboard, LuNetwork, LuRefreshCw, LuUsers } from 'react-icons/lu';
import { MUTED, Plot, SERIES, SEQ } from '../components/Plot';
import { Alert, Card, CardSkeleton, Empty, ErrorBox, PageHeader, Stat, StatSkeletonRow } from '../components/ui';
import { fmt } from '../lib/api';
import { useApi } from '../lib/hooks';

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<any>('/api/analytics');
  const sc = data?.scenarios;
  const main = useMemo(() => (sc?.summary || []).filter((r: any) => r.variant === 'main'), [sc]);
  const tm = data?.model?.test_metrics;
  const ds = data?.dataset;
  const pick = (k: string) => main.find((r: any) => r.scenario === k);
  const s1 = pick('S1_traditional'), s2 = pick('S2_ai_assisted');
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="Main analytics dashboard"
        description="Every value on this page is read live from the backend: dataset audit, trained model evaluation, stored workflow cases and the latest six-scenario simulation experiment."
        icon={<LuLayoutDashboard />}
        actions={<button className="btn-ghost" onClick={reload} disabled={loading}><LuRefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} /> Refresh</button>} />
      <ErrorBox error={error} />
      {loading && !data ? (
        <div className="space-y-4"><StatSkeletonRow /><StatSkeletonRow /><div className="grid lg:grid-cols-2 gap-4"><CardSkeleton chart /><CardSkeleton chart /></div></div>
      ) : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Labelled images" value={fmt.int(ds?.labelled_images)} hint={`${ds?.class_counts_total ? Object.keys(ds.class_counts_total).length : '—'} dataset classes`} icon={<LuDatabase />} tone="green" />
        <Stat label="Classifier accuracy" value={fmt.pct(tm?.accuracy)} hint={`macro-F1 ${fmt.num(tm?.macro_f1, 3)} · ${data?.model?.selected_backbone ?? ''}`} icon={<LuBrain />} delay={60} />
        <Stat label="Workflow cases" value={fmt.int(data?.cases?.total ?? 0)} hint={`reassessed ${fmt.pct(data?.cases?.reassessment_rate)}`} icon={<LuUsers />} delay={120} />
        <Stat label="Knowledge graph" value={data?.kg ? fmt.int(Object.values<number>(data.kg).reduce((a, b) => a + b, 0)) : '—'} hint={`${data?.rag_chunks ?? '—'} RAG passages`} icon={<LuNetwork />} tone="green" delay={180} />
      </div>

      {s1 && s2 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Avg wait · traditional" value={`${fmt.num(s1.avg_waiting_time_min_mean)} min`} icon={<LuClock />} tone="slate" />
          <Stat label="Avg wait · AI-assisted" value={`${fmt.num(s2.avg_waiting_time_min_mean)} min`} icon={<LuClock />} delay={60} />
          <Stat label="Derm. utilization (AI)" value={fmt.pct(s2.dermatologist_utilization_mean)} hint={`traditional ${fmt.pct(s1.dermatologist_utilization_mean)}`} icon={<LuGauge />} tone="green" delay={120} />
          <Stat label="AI–human disagreement" value={fmt.pct(s2.ai_human_disagreement_rate_mean)} hint="scenario 2, mean of replications" icon={<LuActivity />} delay={180} />
        </div>
      ) : <Alert title="No scenario experiment yet">Run the six-scenario comparison to populate clinic metrics. <a className="underline" href="#/scenarios">Go to Scenario Comparison</a>.</Alert>}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Images per dataset class" subtitle="Uploaded dataset after audit (train + test pooled)">
          {ds ? (
            <Plot ariaLabel="Bar chart of images per class" height={360}
              data={[{ type: 'bar', orientation: 'h', marker: { color: Object.keys(ds.class_counts_total).map((c) => ['Acne', 'Eczema', 'Seborrheic Keratoses', 'Skin Cancer'].includes(c) ? SEQ : MUTED).reverse() },
                y: Object.keys(ds.class_counts_total).reverse(), x: Object.values(ds.class_counts_total).reverse(),
                hovertemplate: '%{y}: %{x} images<extra></extra>' }]}
              layout={{ margin: { l: 140, r: 16, t: 8, b: 40 }, xaxis: { title: { text: 'images' } } }} />
          ) : <Empty>Dataset audit not found.</Empty>}
          <p className="text-[12px] text-ink-500 mt-2 flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-500" />Mapped to a Derm Agents proposal disease</span><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ink-300" />Other dataset class (recognised, out of scope)</span></p>
        </Card>
        <Card title="Per-class F1 on held-out test split" subtitle="Selected model, grouped split (no near-duplicate leakage)">
          {tm ? (
            <Plot ariaLabel="Per-class F1 bar chart" height={360}
              data={[{ type: 'bar', orientation: 'h', marker: { color: SERIES[0] },
                y: Object.keys(tm.per_class).reverse(), x: Object.values<any>(tm.per_class).map((v) => v.f1).reverse(),
                customdata: Object.values<any>(tm.per_class).map((v) => v.support).reverse(),
                hovertemplate: '%{y}: F1 %{x:.2f} (n=%{customdata})<extra></extra>' }]}
              layout={{ margin: { l: 140, r: 16, t: 8, b: 40 }, xaxis: { range: [0, 1], title: { text: 'F1-score' } } }} />
          ) : <Empty>Model evaluation not found.</Empty>}
        </Card>
      </div>

      {main.length > 0 && (
        <Card title="Scenario headline metrics" subtitle={`Mean of ${sc.replications} replications per scenario`}>
          <div className="grid md:grid-cols-2 gap-4">
            <Plot ariaLabel="Average waiting time by scenario" height={280}
              data={[{ type: 'bar', x: main.map((r: any) => r.title.replace(/^\d\.\s*/, '')), y: main.map((r: any) => r.avg_waiting_time_min_mean),
                error_y: { type: 'data', array: main.map((r: any) => r.avg_waiting_time_min_sd), color: '#94A3B8', thickness: 1 },
                marker: { color: SERIES[0] }, hovertemplate: '%{x}: %{y:.1f} min<extra></extra>' }]}
              layout={{ yaxis: { title: { text: 'avg waiting time (min)' } }, margin: { b: 90 } }} />
            <Plot ariaLabel="Diagnostic accuracy by scenario" height={280}
              data={[{ type: 'bar', x: main.map((r: any) => r.title.replace(/^\d\.\s*/, '')), y: main.map((r: any) => r.diagnostic_accuracy_final_mean),
                marker: { color: SERIES[1] }, hovertemplate: '%{x}: %{y:.1%}<extra></extra>' }]}
              layout={{ yaxis: { title: { text: 'final diagnostic accuracy' }, tickformat: '.0%', range: [0, 1] }, margin: { b: 90 } }} />
          </div>
        </Card>
      )}
      </>}
    </div>
  );
}
