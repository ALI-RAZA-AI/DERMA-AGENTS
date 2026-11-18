import React from 'react';
import { LuCheck } from 'react-icons/lu';
import { Meta } from '../lib/api';
import { cx, Skeleton } from './ui';

export function SymptomPicker({ meta, value, onChange }: { meta: Meta | null; value: string[]; onChange: (v: string[]) => void }) {
  if (!meta) return <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading symptoms">{[96, 120, 80, 140, 104, 88, 128, 72].map((w, i) => <Skeleton key={i} className="h-[26px] !rounded-full" style={{ width: w }} />)}</div>;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Symptoms">
      {meta.symptoms.map((s) => {
        const on = value.includes(s.id);
        return (
          <button type="button" key={s.id} onClick={() => toggle(s.id)} aria-pressed={on} title={s.description}
            className={cx('chip ring-1 ring-inset transition-colors duration-150', on ? 'bg-brand-100 text-ink-900 ring-brand-400' : 'bg-surface text-ink-600 ring-ink-200 hover:ring-ink-300 hover:bg-ink-50 hover:text-ink-900')}>
            {on && <LuCheck className="size-3.5 text-brand-700" />}{s.label}
          </button>
        );
      })}
    </div>
  );
}
