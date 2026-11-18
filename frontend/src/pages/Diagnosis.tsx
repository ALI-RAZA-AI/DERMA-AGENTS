import React, { useEffect, useRef, useState } from 'react';
import { LuHand, LuImage, LuPlay, LuScanSearch, LuUpload, LuWorkflow } from 'react-icons/lu';
import { PredictionCard, References, ReviewCard, RoutePath, TraceTimeline, TreatmentCard, WarningsList } from '../components/CaseView';
import { SymptomPicker } from '../components/SymptomPicker';
import { AiWorking, Alert, Badge, Card, DemoBanner, ErrorBox, Field, LiveDot, PageHeader, cx } from '../components/ui';
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
      <PageHeader eyebrow="AI Diagnostic Agent" title="AI skin diagnosis" icon={<LuScanSearch />}
        description="Upload a clinical skin photograph (or pick a held-out test image) and run the trained classifier alone, or the full five-agent LangGraph workflow. Unsupported, ambiguous and out-of-distribution images are rejected instead of being forced into a disease label." />
      <div className="grid xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <div className="space-y-4 min-w-0">
          <Card title="1 · Skin image">
            <label ref={drop} htmlFor="img" className={cx('relative flex flex-col items-center justify-center rounded-xl p-5 text-center cursor-pointer transition-colors min-h-64 overflow-hidden', preview ? 'bg-ink-50 border border-ink-200 hover:border-brand-300' : 'border-2 border-dashed border-ink-300 bg-surface hover:border-brand-500 hover:bg-brand-50')}
              onDragOver={(e) => { e.preventDefault(); drop.current?.classList.add('ring-4', 'ring-brand-100'); }} onDragLeave={() => drop.current?.classList.remove('ring-4', 'ring-brand-100')}
              onDrop={(e) => { e.preventDefault(); drop.current?.classList.remove('ring-4', 'ring-brand-100'); pickFile(e.dataTransfer.files?.[0]); }}>
              {preview ? (
                <>
                  <div className="absolute left-4 top-3 text-left z-10 min-w-0"><div className="text-[12.5px] font-semibold text-ink-900">Lesion capture</div><div className="text-[12px] text-ink-500 truncate max-w-48">{file ? file.name : 'Held-out test image'}</div></div>
                  <span className="absolute right-3 top-3 z-10 chip bg-surface text-ink-700 ring-1 ring-inset ring-ink-200"><LiveDot tone={busy ? 'sky' : 'green'} active={!!busy} />{busy ? 'Analysing' : 'Ready'}</span>
                  <div className="relative mt-11">
                    <img src={preview} alt="Selected skin image preview" className="max-h-60 rounded-lg object-contain shadow-[0_2px_8px_rgba(15,23,42,0.12)]" />
                    {['-left-1.5 -top-1.5 border-l-2 border-t-2 rounded-tl-md', '-right-1.5 -top-1.5 border-r-2 border-t-2 rounded-tr-md', '-left-1.5 -bottom-1.5 border-l-2 border-b-2 rounded-bl-md', '-right-1.5 -bottom-1.5 border-r-2 border-b-2 rounded-br-md'].map((c) => <span key={c} className={cx('absolute size-5 border-brand-500', c)} />)}
                    {busy && <span className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none"><span className="absolute inset-x-0 h-10 -top-10 bg-gradient-to-b from-transparent via-brand-300/40 to-brand-500/70 [animation:scanline_1.6s_linear_infinite]" /></span>}
                  </div>
                  <div className="relative mt-3 text-[12px] text-ink-500">Click or drop to replace</div>
                </>
              ) : (
                <><span className="grid place-items-center size-11 rounded-xl bg-brand-100 text-brand-700"><LuUpload className="size-5" /></span><div className="mt-3 text-[14px] font-semibold text-ink-900">Drop a skin photograph</div><div className="text-[12px] text-ink-500 mt-1">or click to browse · JPEG · PNG · WEBP · BMP · up to 8 MB</div></>)}
              <input id="img" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            {demos && demos.length > 0 && (
              <div className="mt-4">
                <div className="label flex items-center gap-1.5"><LuImage className="size-3.5" /> Held-out test images (never used in training)</div>
                <div className="grid grid-cols-5 gap-2">
                  {demos.map((d: any) => (
                    <button key={d.file} type="button" onClick={() => pickDemo(d.file)} title={`${d.label} (dataset test split)`}
                      aria-pressed={demo === d.file} aria-label={`Use test image labelled ${d.label}`} className={cx('relative aspect-square rounded-lg overflow-hidden ring-2 ring-offset-1 ring-offset-surface transition-all duration-150', demo === d.file ? 'ring-brand-500' : 'ring-transparent hover:ring-ink-300')}>
                      <img src={`${API_BASE}/api/demo-images/${d.file}`} alt={`Test image labelled ${d.label}`} className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                {demo && <div className="text-[12px] text-ink-500 mt-2">Ground-truth label of selected test image: <span className="text-ink-900 font-medium">{demos.find((d: any) => d.file === demo)?.label}</span></div>}
              </div>
            )}
          </Card>
          <Card title="2 · Patient information" subtitle={patient ? `Registered patient ${pid?.slice(0, 10)}…` : 'Quick synthetic patient (or register one first)'}>
            {!patient && (
              <div className="grid grid-cols-1 sm:grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)] gap-3 mb-4">
                <Field label="Age"><input className="input" type="number" min={0} max={120} value={inline.age} onChange={(e) => setInline({ ...inline, age: Number(e.target.value) })} /></Field>
                <Field label="Sex"><select className="input" value={inline.gender} onChange={(e) => setInline({ ...inline, gender: e.target.value })}>{['unspecified', 'female', 'male', 'other'].map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}</select></Field>
                <Field label="Severity"><select className="input" value={inline.severity} onChange={(e) => setInline({ ...inline, severity: e.target.value })}>{['mild', 'moderate', 'severe'].map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}</select></Field>
              </div>
            )}
            <span className="label">Symptoms</span>
            <SymptomPicker meta={meta} value={symptoms} onChange={setSymptoms} />
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className="btn-ghost !h-10" disabled={!hasImage || !!busy} onClick={predict}><LuScanSearch className="size-4" /> {busy === 'predict' ? 'Classifying…' : 'Classifier only'}</button>
            <button className="btn-primary !h-10" disabled={!!busy} onClick={() => runAgents()}><LuWorkflow className="size-4" /> {busy === 'agents' ? 'Agents working…' : 'Run 5-agent workflow'}</button>
          </div>
          {!hasImage && <p className="text-[12px] text-ink-500 leading-relaxed">Without an image the workflow still runs: the AI agent reports "no image" and the dermatologist relies on symptoms and the knowledge graph.</p>}
          <DemoBanner />
        </div>

        <div className="space-y-4 min-w-0">
          <ErrorBox error={err} />
          {busy && <AiWorking label={busy === 'predict' ? 'Running OpenCV preprocessing and the classifier' : busy === 'override' ? 'Re-running the workflow with your override' : 'LangGraph is routing the case through the agents'}
            steps={busy === 'predict' ? ['Preprocess', 'Classify', 'Calibrate', 'Conformal set', 'OOD check'] : ['Patient Agent', 'Clinic Environment', 'AI Diagnostic Agent', 'Dermatologist Agent', 'Treatment Agent']} />}
          {!pred && !kase && !busy && (
            <Card title="How a scan is processed" subtitle="Every step below runs real code in the backend">
              <ol className="divide-y divide-ink-100">
                {[['Preprocess', 'OpenCV decode, resize, centre-crop and normalise; quality checks reject tiny, blank or blurred images.'],
                  ['Classify', 'Three ImageNet backbones feed an ensemble head that outputs calibrated probabilities over 14 dataset classes.'],
                  ['Check uncertainty', '90% conformal prediction set, validated confidence threshold and out-of-distribution score.'],
                  ['Review', 'Dermatologist agent weighs the result against your symptoms, the knowledge graph and retrieved evidence.'],
                  ['Simulate care', 'Category-level care pathway, follow-up and reassessment — no prescriptions.']].map(([t, d], i) => (
                  <li key={t} className="flex gap-4 py-3.5 first:pt-0 last:pb-0"><span className="grid place-items-center size-7 shrink-0 rounded-full bg-brand-100 text-brand-800 text-[12px] font-semibold tabular-nums">{i + 1}</span>
                    <div className="min-w-0"><div className="text-[14px] font-semibold text-ink-900">{t}</div><p className="text-[13px] text-ink-600 mt-0.5 leading-relaxed">{d}</p></div></li>))}
              </ol>
            </Card>
          )}
          {!pred && !kase && !busy && <Alert title="Supported classes">{meta?.supported_classes ? <>Enabled: <b>{meta.supported_classes.enabled.join(', ')}</b>. Disabled (not in the uploaded dataset): {meta.supported_classes.disabled_proposal_classes.join(', ')}. Other dataset classes are recognised only to flag images as out of scope.</> : 'Loading…'}</Alert>}
          {pred && <PredictionCard ai={pred} />}
          {pred?.quality_warnings?.length > 0 && <WarningsList items={pred.quality_warnings} />}
          {kase && (
            <>
              <Card title="Workflow route" subtitle={`Case ${kase.case_id.slice(0, 12)} · ${kase.elapsed_ms} ms · ${kase.reassessment_count} reassessment(s)`}
                action={<a className="text-[12.5px] link" href={`#/agents?case=${kase.case_id}`}>Open in workflow view</a>}>
                <RoutePath route={kase.route_log} />
              </Card>
              <div className="grid 2xl:grid-cols-2 gap-4">
                <ReviewCard c={kase} />
                <TreatmentCard t={kase.treatment} f={kase.follow_up} />
              </div>
              <Card title={<span className="flex items-center gap-2"><LuHand className="size-[18px] text-green-700" /> Human-in-the-loop override</span>}
                subtitle="Overrides the simulated dermatologist decision; the run is re-executed and logged as human_override.">
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <Field label="Decision"><select className="input" value={ov.decision} onChange={(e) => setOv({ ...ov, decision: e.target.value })}><option value="accept">Accept AI</option><option value="reject">Reject AI</option></select></Field>
                  <Field label="Final diagnosis"><select className="input" value={ov.final_diagnosis} onChange={(e) => setOv({ ...ov, final_diagnosis: e.target.value })}>
                    <option value="">Keep AI suggestion</option>{meta?.diseases.map((d) => <option key={d}>{d}</option>)}</select></Field>
                  <button className="btn-green" disabled={!!busy} onClick={() => runAgents({ decision: ov.decision, final_diagnosis: ov.final_diagnosis || null })}><LuPlay className="size-4" /> {busy === 'override' ? 'Applying…' : 'Apply override'}</button>
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
