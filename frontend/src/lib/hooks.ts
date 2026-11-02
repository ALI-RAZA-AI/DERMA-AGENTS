import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Meta } from './api';

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api.get<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

let metaCache: Promise<Meta> | null = null;
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    metaCache = metaCache || api.get<Meta>('/api/meta');
    metaCache.then(setMeta).catch(() => { metaCache = null; });
  }, []);
  return meta;
}

export function useHashRoute(): [string, (p: string) => void] {
  const get = () => (window.location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(get());
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (p: string) => { window.location.hash = p; }];
}
