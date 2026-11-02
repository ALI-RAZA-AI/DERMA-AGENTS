import React, { useEffect, useRef, useState } from 'react';
import { LuHand, LuImage, LuPlay, LuScanSearch, LuUpload, LuWorkflow } from 'react-icons/lu';
import { PredictionCard, References, ReviewCard, RoutePath, TraceTimeline, TreatmentCard, WarningsList } from '../components/CaseView';
import { SymptomPicker } from '../components/SymptomPicker';
import { Alert, Badge, Card, DemoBanner, ErrorBox, Field, PageHeader, Spinner, cx } from '../components/ui';
import { api, API_BASE } from '../lib/api';
import { useApi, useMeta } from '../lib/hooks';

export default function Diagnosis({ query }: { query: URLSearchParams }) {
  const meta = useMeta();
  const pid = query.get('patient');
  const { data: patient } = useApi<any>(pid ? `/api/patients/${pid}` : null);
  const { data: demos } = useApi<any[]>('/api/demo-images');
  const [file, setFile] = useState<File | null>(null);
  const [demo, setDemo] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [inline, setInline] = useState({ age: 30, severity: 'moderate', gender: 'unspecified' });
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pred, setPred] = useState<any>(null);
  const [kase, setKase] = useState<any>(null);
  const [ov, setOv] = useState({ decision: 'reject', final_diagnosis: '' });
  const drop = useRef<HTMLLabelElement>(null);

  useEffect(() => { if (patient) setSymptoms(patient.symptoms || []); }, [patient]);
  useEffect(() => { if (!file) return; const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);

  const pickFile = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(f.type)) { setErr('Please choose a JPEG, PNG, WEBP or BMP image.'); return; }
    if (f.size > 8 * 1024 * 1024) { setErr('Image must be 8 MB or smaller.'); return; }
    setErr(null); setFile(f); setDemo(null); setPred(null); setKase(null);
  };
  const pickDemo = (name: string) => { setDemo(name); setFile(null); setPreview(`${API_BASE}/api/demo-images/${name}`); setPred(null); setKase(null); };

  const predict = async () => {
    setBusy('predict'); setErr(null);
    try {
      const fd = new FormData();
      if (file) fd.append('image', file);
      else if (demo) { const b = await fetch(`${API_BASE}/api/demo-images/${demo}`).then((r) => r.blob()); fd.append('image', new File([b], demo, { type: b.type || 'image/jpeg' })); }
      setPred(await api.form('/api/diagnosis/predict', fd));
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const runAgents = async (override?: any) => {
    setBusy(override ? 'override' : 'agents'); setErr(null);
    try {
      const fd = new FormData();
      if (file) fd.append('image', file); else if (demo) fd.append('demo_image', demo);
      if (pid && !override) fd.append('patient_id', pid);
      else fd.append('patient', JSON.stringify({ ...(patient || inline), age: Number((patient || inline).age), symptoms, name: patient?.name || undefined, history: patient?.history || '' }));
      if (override) fd.append('override', JSON.stringify({ ...override, reviewer: 'human evaluator (UI)' }));
      const c = await api.form('/api/agents/run', fd);
      setKase(c); setPred(c.ai?.status !== 'no_image' ? c.ai : pred);
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const hasImage = !!(file || demo);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="AI Diagnostic Agent" title="AI skin diagnosis"
        description="Upload a clinical skin photograph (or pick a held-out test image) and run the trained classifier alone, or the full five-agent LangGraph workflow. Unsupported, ambiguous and out-of-distribution images are rejected instead of being forced into a disease label." />
      <div className="grid xl:grid-cols-[440px_1fr] gap-6">
        <div className="space-y-4">
          <Card title="1 · Skin image">
            <label ref={drop} htmlFor="img" className={cx('relative flex flex-col items-center justify-center rounded-[22px] p-5 text-center cursor-pointer transition min-h-64 overflow-hidden', preview ? 'bg-scan-950' : 'border-2 border-dashed border-ink-300 bg-white/60 hover:border-brand-500 hover:bg-brand-50/40')}
              onDragOver={(e) => { e.preventDefault(); drop.current?.classList.add('ring-4', 'ring-brand-100'); }} onDragLeave={() => drop.current?.classList.remove('ring-4', 'ring-brand-100')}
              onDrop={(e) => { e.preventDefault(); drop.current?.classList.remove('ring-4', 'ring-brand-100'); pickFile(e.dataTransfer.files?.[0]); }}>
              {preview ? (
                <>
                  <div className="absolute inset-0 dot-grid opacity-[0.07]" />
                  <div className="absolute left-4 top-3.5 text-left z-10"><div className="text-[12px] font-medium text-white">Lesion capture</div><div className="text-[10.5px] text-white/45">{file ? file.name.slice(0, 28) : 'held-out test image'}</div></div>
                  <span className="absolute right-4 top-3.5 z-10 chip bg-white/8 text-white/75 ring-1 ring-white/10"><span className="size-1.5 rounded-full bg-[#7fb2ff]" />{busy ? 'Analysing' : 'Ready'}</span>
                  <div className="relative mt-7">
                    <img src={preview} alt="Selected skin image preview" className="max-h-60 rounded-xl object-contain" />
                    {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'].map((c) => <span key={c} className={cx('absolute size-5 border-white/80', c)} />)}
                    {busy && <span className="absolute inset-x-0 h-0.5 bg-[#7fb2ff] shadow-[0_0_12px_#7fb2ff] animate-pulse-soft" style={{ top: '50%' }} />}
                  </div>
                  <div className="relative mt-3 text-[11px] text-white/45">Click or drop to replace</div>
                </>
              ) : (
                <><span className="grid place-items-center size-12 rounded-2xl bg-brand-50 text-brand-600"><LuUpload className="size-5" /></span><div className="mt-3 text-[15px] font-medium text-ink-900">Drop a skin photograph</div><div className="text-xs text-ink-500 mt-1">or click to browse · JPEG · PNG · WEBP · BMP · up to 8 MB</div></>)}
              <input id="img" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            {demos && demos.length > 0 && (
              <div className="mt-4">
                <div className="label flex items-center gap-1.5"><LuImage /> Held-out test images (never used in training)</div>
                <div className="grid grid-cols-5 gap-2">
                  {demos.map((d: any) => (
                    <button key={d.file} type="button" onClick={() => pickDemo(d.file)} title={`${d.label} (dataset test split)`}
                      className={cx('relative aspect-square rounded-lg overflow-hidden ring-2 transition', demo === d.file ? 'ring-brand-500' : 'ring-transparent hover:ring-ink-200')}>
                      <img src={`${API_BASE}/api/demo-images/${d.file}`} alt={`Test image labelled ${d.label}`} className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                {demo && <div className="text-xs text-ink-500 mt-2">Ground-truth label of selected test image: <span className="text-ink-900">{demos.find((d: any) => d.file === demo)?.label}</span></div>}
              </div>
            )}
          </Card>
          <Card title="2 · Patient information" subtitle={patient ? `Registered patient ${pid?.slice(0, 10)}…` : 'Quick synthetic patient (or register one first)'}>
            {!patient && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Field label="Age"><input className="input" type="number" min={0} max={120} value={inline.age} onChange={(e) => setInline({ ...inline, age: Number(e.target.value) })} /></Field>
                <Field label="Sex"><select className="input" value={inline.gender} onChange={(e) => setInline({ ...inline, gender: e.target.value })}>{['unspecified', 'female', 'male', 'other'].map((g) => <option key={g}>{g}</option>)}</select></Field>
                <Field label="Severity"><select className="input" value={inline.severity} onChange={(e) => setInline({ ...inline, severity: e.target.value })}>{['mild', 'moderate', 'severe'].map((g) => <option key={g}>{g}</option>)}</select></Field>
              </div>
            )}
            <span className="label">Symptoms</span>
            <SymptomPicker meta={meta} value={symptoms} onChange={setSymptoms} />
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-ghost" disabled={!hasImage || !!busy} onClick={predict}><LuScanSearch /> {busy === 'predict' ? 'Classifying…' : 'Classifier only'}</button>
            <button className="btn-primary" disabled={!!busy} onClick={() => runAgents()}><LuWorkflow /> {busy === 'agents' ? 'Agents working…' : 'Run 5-agent workflow'}</button>
          </div>
          {!hasImage && <p className="text-xs text-ink-500">Without an image the workflow still runs: the AI agent reports "no image" and the dermatologist relies on symptoms and the knowledge graph.</p>}
          <DemoBanner />
        </div>

        <div className="space-y-4 min-w-0">
          <ErrorBox error={err} />
          {busy && <Card><Spinner label={busy === 'predict' ? 'Running OpenCV preprocessing + classifier…' : 'LangGraph is routing the case through the agents…'} /></Card>}
          {!pred && !kase && !busy && (
            <Card title="How a scan is processed" subtitle="Every step below runs real code in the backend">
              <ol className="divide-y divide-ink-100">
                {[['Preprocess', 'OpenCV decode, resize, centre-crop and normalise; quality checks reject tiny, blank or blurred images.'],
                  ['Classify', 'Three ImageNet backbones → ensemble head → calibrated probabilities over 14 dataset classes.'],
                  ['Check uncertainty', '90% conformal prediction set, validated confidence threshold and out-of-distribution score.'],
                  ['Review', 'Dermatologist agent weighs the result against your symptoms, the knowledge graph and retrieved evidence.'],
                  ['Simulate care', 'Category-level care pathway, follow-up and reassessment — no prescriptions.']].map(([t, d], i) => (
                  <li key={t} className="flex gap-4 py-3.5"><span className="font-display text-2xl leading-none text-ink-300 w-8">{String(i + 1).padStart(2, '0')}</span>
                    <div><div className="text-[14.5px] font-medium text-ink-900">{t}</div><p className="text-[13px] text-ink-600 mt-0.5 leading-relaxed">{d}</p></div></li>))}
              </ol>
            </Card>
          )}
          {!pred && !kase && !busy && <Alert title="Supported classes">{meta?.supported_classes ? <>Enabled: <b>{meta.supported_classes.enabled.join(', ')}</b>. Disabled (not in the uploaded dataset): {meta.supported_classes.disabled_proposal_classes.join(', ')}. Other dataset classes are recognised only to flag images as out of scope.</> : 'Loading…'}</Alert>}
          {pred && <PredictionCard ai={pred} />}
          {pred?.quality_warnings?.length > 0 && <WarningsList items={pred.quality_warnings} />}
          {kase && (
            <>
              <Card title="Workflow route" subtitle={`Case ${kase.case_id.slice(0, 12)} · ${kase.elapsed_ms} ms · ${kase.reassessment_count} reassessment(s)`}
                action={<a className="text-xs text-brand-600 hover:underline" href={`#/agents?case=${kase.case_id}`}>Open in workflow view</a>}>
                <RoutePath route={kase.route_log} />
              </Card>
              <div className="grid 2xl:grid-cols-2 gap-4">
                <ReviewCard c={kase} />
                <TreatmentCard t={kase.treatment} f={kase.follow_up} />
              </div>
              <Card title={<span className="flex items-center gap-2"><LuHand className="text-amber-700" /> Human-in-the-loop override</span>}
                subtitle="Overrides the simulated dermatologist decision; the run is re-executed and logged as human_override.">
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <Field label="Decision"><select className="input" value={ov.decision} onChange={(e) => setOv({ ...ov, decision: e.target.value })}><option value="accept">accept AI</option><option value="reject">reject AI</option></select></Field>
                  <Field label="Final diagnosis"><select className="input" value={ov.final_diagnosis} onChange={(e) => setOv({ ...ov, final_diagnosis: e.target.value })}>
                    <option value="">(keep AI suggestion)</option>{meta?.diseases.map((d) => <option key={d}>{d}</option>)}</select></Field>
                  <button className="btn-violet" disabled={!!busy} onClick={() => runAgents({ decision: ov.decision, final_diagnosis: ov.final_diagnosis || null })}><LuPlay /> Apply override</button>
                </div>
              </Card>
              <References refs={kase.review?.evidence?.references} />
              <Card title="Agent execution log" subtitle={<span>Generator: <Badge>{kase.review?.evidence?.generator || '—'}</Badge></span>}>
                <TraceTimeline trace={kase.trace} />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
