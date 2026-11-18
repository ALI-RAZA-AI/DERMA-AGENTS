import React, { useState } from 'react';
import { LuArrowRight, LuCircleCheck, LuLoaderCircle, LuUserPlus } from 'react-icons/lu';
import { SymptomPicker } from '../components/SymptomPicker';
import { Alert, Card, DemoBanner, ErrorBox, Field, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useMeta } from '../lib/hooks';

export default function Register() {
  const meta = useMeta();
  const [f, setF] = useState({ name: '', age: 34, gender: 'unspecified', severity: 'moderate', history: '', previous_treatment: false });
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setCreated(await api.post('/api/patients', { ...f, symptoms })); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Patient Agent" title="Patient registration" icon={<LuUserPlus />}
        description="Register a synthetic patient. The Patient Agent uses these attributes for intake; symptoms feed the knowledge-graph verification during review." />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Synthetic patient details">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Display name (optional)"><input className="input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Demo patient A" /></Field>
              <Field label="Age"><input className="input" type="number" min={0} max={120} required value={f.age} onChange={(e) => setF({ ...f, age: Number(e.target.value) })} /></Field>
              <Field label="Gender">
                <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                  {['unspecified', 'female', 'male', 'other'].map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Self-reported severity">
                <select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
                  {['mild', 'moderate', 'severe'].map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
                </select>
              </Field>
            </div>
            <div><span className="label">Symptoms <span className="text-ink-400 font-normal">· {symptoms.length} selected</span></span><SymptomPicker meta={meta} value={symptoms} onChange={setSymptoms} /></div>
            <Field label="History / notes" hint="Synthetic text only. Max 500 characters."><textarea className="input min-h-20" maxLength={500} value={f.history} onChange={(e) => setF({ ...f, history: e.target.value })} /></Field>
            <label className="flex items-center gap-2.5 text-[13.5px] text-ink-700 cursor-pointer w-fit"><input type="checkbox" checked={f.previous_treatment} onChange={(e) => setF({ ...f, previous_treatment: e.target.checked })} /> Previously treated for a skin condition</label>
            <ErrorBox error={err} />
            <div className="pt-1 border-t border-ink-100"><button className="btn-primary mt-4" disabled={busy}>{busy ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuUserPlus className="size-4" />} {busy ? 'Registering…' : 'Register patient'}</button></div>
          </form>
        </Card>
        <div className="space-y-4">
          <DemoBanner />
          {created ? (
            <Card title={<span className="flex items-center gap-2"><LuCircleCheck className="size-[18px] text-green-700" /> Patient registered</span>} subtitle={`ID ${created.id.slice(0, 12)}…`}>
              <dl className="text-[13.5px] grid grid-cols-2 gap-y-2">
                <dt className="text-ink-500">Age</dt><dd className="text-ink-900 font-medium tabular-nums">{created.age}</dd>
                <dt className="text-ink-500">Severity</dt><dd className="text-ink-900 font-medium capitalize">{created.severity}</dd>
                <dt className="text-ink-500">Symptoms</dt><dd className="text-ink-900 font-medium tabular-nums">{created.symptoms.length}</dd>
              </dl>
              <a className="btn-primary mt-4 w-full" href={`#/diagnosis?patient=${created.id}`}>Continue to AI diagnosis <LuArrowRight /></a>
            </Card>
          ) : <Alert title="What happens next">After registration, upload a skin image on the AI Skin Diagnosis page. The full five-agent LangGraph workflow then runs on this patient.</Alert>}
        </div>
      </div>
    </div>
  );
}
