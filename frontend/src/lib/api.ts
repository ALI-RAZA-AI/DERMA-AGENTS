// Typed API client for the DermaAgents FastAPI backend.
export const API_BASE: string = (import.meta as any).env?.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) { super(message); }
}

async function handle<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail: any = null;
    try { detail = await r.json(); } catch { /* ignore */ }
    const msg = typeof detail?.detail === 'string' ? detail.detail
      : Array.isArray(detail?.detail) ? detail.detail.map((d: any) => d.msg).join('; ') : r.statusText;
    throw new ApiError(r.status, msg || `HTTP ${r.status}`, detail);
  }
  const ct = r.headers.get('content-type') || '';
  return (ct.includes('application/json') ? r.json() : (r.blob() as any)) as Promise<T>;
}

export const api = {
  get: <T = any>(p: string) => fetch(API_BASE + p).then((r) => handle<T>(r)),
  post: <T = any>(p: string, body?: unknown) => fetch(API_BASE + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r)),
  form: <T = any>(p: string, fd: FormData) => fetch(API_BASE + p, { method: 'POST', body: fd }).then((r) => handle<T>(r)),
  download: async (p: string, body: unknown, fallbackName: string) => {
    const r = await fetch(API_BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({})))?.detail || r.statusText);
    const blob = await r.blob();
    const cd = r.headers.get('content-disposition') || '';
    const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};

export const fileUrl = (group: string, name: string) => `${API_BASE}/api/reports/files/${group}/${name}`;

export type Meta = {
  symptoms: { id: string; label: string; description: string }[];
  diseases: string[];
  supported_classes: { enabled: string[]; enabled_map: Record<string, string>; disabled_proposal_classes: string[]; recognised_out_of_scope: string[] } | null;
  scenarios: Record<string, { title: string; purpose: string; sweep?: Record<string, number[]>; overrides?: Record<string, unknown> }>;
  default_params: Record<string, any>;
  agents: Record<string, { responsibilities: string[]; inputs: string[]; outputs: string[]; state: string[]; decision_rules: string[]; communicates_with: string[]; note?: string }>;
  credit: string;
};

export const fmt = {
  pct: (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`),
  num: (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d)),
  int: (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString()),
};
