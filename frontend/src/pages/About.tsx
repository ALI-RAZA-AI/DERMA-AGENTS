import React from 'react';
import { LuGraduationCap, LuInfo, LuLayers, LuShieldCheck, LuTriangleAlert } from 'react-icons/lu';
import { Badge, Card, PageHeader } from '../components/ui';
import { APP_NAME, APP_TAGLINE, DevName } from '../components/Layout';

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
      <PageHeader eyebrow="Final Year Project" title={`${APP_NAME} — project information`} icon={<LuInfo />}
        description={`${APP_TAGLINE}: combining agent-based modelling, computer vision, multi-agent systems, RAG, a knowledge graph and healthcare simulation.`} />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={<span className="flex items-center gap-2"><LuGraduationCap className="size-[18px] text-brand-600" /> Credits</span>}>
          <div className="text-[12.5px] font-medium text-ink-500">Developed and designed by</div>
          <DevName className="text-[20px] tracking-[-0.01em]" />
          <dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-ink-500">University</dt><dd>University of Central Punjab</dd>
            <dt className="text-ink-500">Section</dt><dd>AG2</dd>
            <dt className="text-ink-500">Course</dt><dd>Agent Based Modelling</dd>
            <dt className="text-ink-500">Instructor</dt><dd>Zishan Hussain Chuhan</dd>
          </dl>
          <div className="mt-4 pt-3 border-t border-ink-100 text-[12px] text-ink-500 leading-relaxed">Proposal group: Ali Raza (L1F23BSAI0071), Ali Ghouse (L1F23BSAI0055), Abdul Rafay Imran (L1F23BSAI0034), M Abubakar (L1F23BSAI0076).</div>
        </Card>
        <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><LuLayers className="size-[18px] text-brand-600" /> Technology stack</span>}>
          <dl className="divide-y divide-ink-100">{STACK.map(([k, v]) => <div key={k} className="grid sm:grid-cols-[160px_1fr] gap-1 py-2.5 first:pt-0 last:pb-0 text-[13px]"><dt className="text-ink-900 font-semibold">{k}</dt><dd className="text-ink-600">{v}</dd></div>)}</dl>
        </Card>
      </div>
      <Card title={<span className="flex items-center gap-2"><LuTriangleAlert className="size-[18px] text-amber-600" /> Honest limitations & substitutions</span>} subtitle="What differs from the original plan and why">
        <div className="grid md:grid-cols-2 gap-3">
          {SUBS.map(([k, v]) => <div key={k} className="subtle-panel p-3.5"><div className="text-[13.5px] font-semibold text-ink-900">{k}</div><p className="text-[13px] text-ink-600 mt-1 leading-relaxed">{v}</p></div>)}
          <div className="subtle-panel p-3.5"><div className="text-[13.5px] font-semibold text-ink-900">Dataset coverage</div><p className="text-[13px] text-ink-600 mt-1 leading-relaxed">The uploaded dataset supports Acne, Eczema and Seborrheic Keratosis directly, and malignant lesions only as an unspecified “Skin Cancer” class. <Badge>Psoriasis</Badge> <Badge>Melanoma</Badge> <Badge>BCC</Badge> are disabled for image prediction; they remain in the knowledge graph and simulation.</p></div>
        </div>
      </Card>
      <Card title={<span className="flex items-center gap-2"><LuShieldCheck className="size-[18px] text-green-700" /> Scope & ethics</span>}>
        <ul className="text-[13px] text-ink-600 list-disc marker:text-ink-300 pl-5 space-y-1.5 leading-relaxed">
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
