import React from 'react';
import { LuGraduationCap, LuLayers, LuShieldCheck, LuTriangleAlert } from 'react-icons/lu';
import { Badge, Card, PageHeader } from '../components/ui';

const STACK: [string, string][] = [
  ['Computer vision', 'OpenCV preprocessing · ImageNet-pretrained MobileNetV2 / ResNet50 / EfficientNet (ONNX Runtime) · scikit-learn head'],
  ['Uncertainty', 'Temperature scaling · split-conformal prediction sets · Mahalanobis OOD rejection'],
  ['Agent-based model', 'Mesa 3 (PatientAgent, AIDiagnosticAgent, DermatologistAgent, TreatmentAgent, ClinicEnvironmentAgent)'],
  ['Orchestration', 'LangGraph state graph with conditional routing and checkpointing · LangChain tools & LCEL'],
  ['Knowledge', 'rdflib OWL ontology · NetworkX knowledge graph · LangChain vector store retrieval (RAG)'],
  ['Backend', 'Python · FastAPI · SQLite (PostgreSQL-ready) · background jobs'],
  ['Frontend', 'React 19 · TypeScript · Tailwind CSS v4 · Plotly · D3 · three.js'],
];

const SUBS: [string, string][] = [
  ['PyTorch fine-tuning', 'PyPI/PyTorch downloads were blocked in the build sandbox. Transfer learning uses frozen ImageNet backbones in ONNX Runtime with a trained scikit-learn head; a PyTorch fine-tuning path is documented for GPU environments.'],
  ['Next.js', 'npm registry blocked. The app is React + TypeScript + Tailwind, bundled with esbuild into a static SPA served by FastAPI (deployable to Vercel as static files).'],
  ['Framer Motion / Lucide React / R3F', 'Replaced by CSS/Web-Animations transitions, Lucide icons via react-icons, and plain three.js.'],
  ['ChromaDB / FAISS', 'Replaced by LangChain InMemoryVectorStore (persisted to JSON) with LSA embeddings implementing the LangChain Embeddings interface.'],
  ['LLM reasoning', 'No API key configured: the RAG generator and dermatologist agent use clearly labelled rule-based logic. Setting ANTHROPIC_API_KEY enables grounded LLM answers.'],
];

export default function About() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Final Year Project" title="DermaAgents — project information"
        description="An Agent-Based Dermatology Diagnosis & Care Simulation Platform combining Agent-Based Modelling, computer vision, multi-agent systems, RAG, a knowledge graph and healthcare simulation." />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={<span className="flex items-center gap-2"><LuGraduationCap className="text-brand-600" /> Credits</span>}>
          <div className="text-4xl font-display text-ink-900">Ali Raza</div>
          <div className="text-sm text-ink-600">Designed and Developed by ALI RAZA</div>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
            <dt className="text-ink-500">University</dt><dd>University of Central Punjab</dd>
            <dt className="text-ink-500">Section</dt><dd>AG2</dd>
            <dt className="text-ink-500">Course</dt><dd>Agent Based Modelling</dd>
            <dt className="text-ink-500">Instructor</dt><dd>Zishan Hussain Chuhan</dd>
          </dl>
          <div className="mt-4 text-xs text-ink-500">Proposal group: Ali Raza (L1F23BSAI0071), Ali Ghouse (L1F23BSAI0055), Abdul Rafay Imran (L1F23BSAI0034), M Abubakar (L1F23BSAI0076).</div>
        </Card>
        <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><LuLayers className="text-violet-600" /> Technology stack</span>}>
          <dl className="space-y-2.5">{STACK.map(([k, v]) => <div key={k} className="grid sm:grid-cols-[170px_1fr] gap-1 text-sm"><dt className="text-ink-900 font-medium">{k}</dt><dd className="text-ink-600">{v}</dd></div>)}</dl>
        </Card>
      </div>
      <Card title={<span className="flex items-center gap-2"><LuTriangleAlert className="text-amber-700" /> Honest limitations & substitutions</span>} subtitle="What differs from the original plan and why">
        <div className="grid md:grid-cols-2 gap-3">
          {SUBS.map(([k, v]) => <div key={k} className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="text-sm font-medium text-ink-900">{k}</div><p className="text-sm text-ink-600 mt-1">{v}</p></div>)}
          <div className="rounded-xl bg-ink-50 border border-ink-200 p-3"><div className="text-sm font-medium text-ink-900">Dataset coverage</div><p className="text-sm text-ink-600 mt-1">The uploaded dataset supports Acne, Eczema and Seborrheic Keratosis directly, and malignant lesions only as an unspecified “Skin Cancer” class. <Badge tone="rose">Psoriasis</Badge> <Badge tone="rose">Melanoma</Badge> <Badge tone="rose">BCC</Badge> are disabled for image prediction; they remain in the knowledge graph and simulation.</p></div>
        </div>
      </Card>
      <Card title={<span className="flex items-center gap-2"><LuShieldCheck className="text-emerald-600" /> Scope & ethics</span>}>
        <ul className="text-sm text-ink-600 list-disc pl-5 space-y-1">
          <li>Academic simulation only. Not a medical device; not medical advice; no real prescriptions or treatment instructions are produced.</li>
          <li>The dermatologist agent is a rule-based simulated reviewer and does not claim to be a medical professional.</li>
          <li>Only synthetic patients are stored. Do not upload real patient photographs.</li>
          <li>Knowledge content is paraphrased from cited public sources and is not clinically validated. Treatment response probabilities are synthetic simulation parameters.</li>
          <li>Dataset images originate from public dermatology atlases (e.g. DermNet); check licences before redistribution. HAM10000 must be cited (Tschandl et al., 2018).</li>
        </ul>
      </Card>
    </div>
  );
}
