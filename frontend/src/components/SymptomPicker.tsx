import React from 'react';
import { LuCheck } from 'react-icons/lu';
import { Meta } from '../lib/api';
import { cx } from './ui';

export function SymptomPicker({ meta, value, onChange }: { meta: Meta | null; value: string[]; onChange: (v: string[]) => void }) {
  if (!meta) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Symptoms">
      {meta.symptoms.map((s) => {
        const on = value.includes(s.id);
        return (
          <button type="button" key={s.id} onClick={() => toggle(s.id)} aria-pressed={on} title={s.description}
            className={cx('chip ring-1 ring-inset transition', on ? 'bg-brand-50 text-brand-600 ring-brand-500/40' : 'bg-ink-50 text-ink-600 ring-ink-200 hover:text-ink-900 hover:bg-ink-50')}>
            {on && <LuCheck className="size-3.5" />}{s.label}
          </button>
        );
      })}
    </div>
  );
}
