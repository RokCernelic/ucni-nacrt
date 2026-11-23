'use client';

import { useState } from 'react';
import { parseNumber } from '@/lib/quiz/scoring';
import { formatNumber } from '@/lib/quiz/format';

/**
 * Polje za decimalno število: sprejme decimalno vejico ali piko (2,5 = 2.5). Med tipkanjem ostane zapisano, kot je
 * vpisano; vrednost se sporoči, ko je veljavno število (prazno → null, če je dovoljeno). Neveljaven vnos je obrobljen rdeče.
 */
export default function DecimalInput({ value, onChange, min = 0, allowEmpty = false, style, ...rest }: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  min?: number;
  allowEmpty?: boolean;
  style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'style'>) {
  const shown = value == null ? '' : formatNumber(value);
  const [text, setText] = useState(shown);
  const [synced, setSynced] = useState(shown);
  // vrednost spremenjena od zunaj (npr. razveljavi) → prikaži novo
  if (shown !== synced) { setSynced(shown); if (parseNumber(text) !== value) setText(shown); }
  const n = parseNumber(text);
  const bad = text.trim() === '' ? !allowEmpty : n === null || n < min;
  return (
    <input {...rest} type="text" inputMode="decimal" value={text}
      onChange={e => {
        const t = e.target.value;
        setText(t);
        const v = parseNumber(t);
        if (t.trim() === '' && allowEmpty) onChange(null);
        else if (v !== null && v >= min) onChange(v);
      }}
      onBlur={e => { if (!bad) setText(shown); rest.onBlur?.(e); }}
      style={{ ...style, ...(bad ? { borderColor: '#c0392b' } : {}) }} />
  );
}
