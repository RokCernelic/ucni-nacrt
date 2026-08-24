'use client';

import { useState, useMemo, useCallback, createContext, useContext, useRef, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';
import type { Predmet, Standard } from '@/types/curriculum';

// Slog za naslov razdelka (Cilji / Standardi znanja / Novi pojmi)
function sectionToggleStyle(open: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '5px', width: '100%',
    background: 'none', border: 'none', padding: '6px 20px 6px 44px', cursor: 'pointer',
    textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: '10px',
    fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: open ? 'var(--forest)' : 'var(--muted)',
  };
}
import { useProgress } from '@/hooks/useProgress';
import { useHours } from '@/hooks/useHours';
import { useOpenChapters } from '@/hooks/useOpenChapters';
import {
  useEnotaOrder,
  PALETTE_TYPES, PALETTE_COLORS,
  type PaletteType, type ResolvedEnotaItem,
} from '@/hooks/useEnotaOrder';

// ── Icons ──────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="6" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="3" cy="3" r="1.2" fill="currentColor" />
      <circle cx="7" cy="3" r="1.2" fill="currentColor" />
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <circle cx="3" cy="11" r="1.2" fill="currentColor" />
      <circle cx="7" cy="11" r="1.2" fill="currentColor" />
    </svg>
  );
}

// ── Palette drag context ───────────────────────────────────

const PaletteDragCtx = createContext<PaletteType | null>(null);

// ── Standardi list ─────────────────────────────────────────

const M_BADGE = <span key="m" style={{ marginLeft: '6px', fontSize: '10px', background: 'var(--forest)', color: '#fff', borderRadius: '3px', padding: '1px 5px', fontWeight: 600, fontStyle: 'normal' }}>M</span>;
const I_BADGE = <span key="i" style={{ marginLeft: '6px', fontSize: '10px', background: 'var(--wood)', color: '#fff', borderRadius: '3px', padding: '1px 5px', fontWeight: 600, fontStyle: 'normal' }}>I</span>;
const S_BADGE = <span key="s" style={{ marginLeft: '6px', fontSize: '10px', background: 'var(--cream)', color: 'var(--wood)', borderRadius: '3px', padding: '1px 5px', fontWeight: 500, fontStyle: 'normal' }}>S</span>;

/**
 * Izriše standard z besedilom in oznakami. Znotraj besedila **...** označuje
 * krepki (minimalni) del; ostalo ostane navadno. Oznaka M se postavi tik za
 * konec krepkega dela; če krepkega dela ni, gre na konec. Oznaki I in S sledita.
 */
function renderStandard(s: Standard): ReactNode {
  const nodes: ReactNode[] = [];
  const hasInlineBold = s.text.includes('**');

  if (hasInlineBold) {
    const parts = s.text.split('**');
    // zadnji krepki del (lihi indeksi so krepki) — M gre zanj
    const lastBold = parts.length % 2 === 0 ? parts.length - 1 : parts.length - 2;
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        nodes.push(<strong key={i} style={{ fontWeight: 600 }}>{part}</strong>);
        if (s.minimalni && i === lastBold) nodes.push(M_BADGE);
      } else if (part) {
        nodes.push(<span key={i}>{part}</span>);
      }
    });
  } else {
    nodes.push(s.text);
    if (s.minimalni) nodes.push(M_BADGE);
  }

  if (s.izbirni) nodes.push(I_BADGE);
  if (s.shared) nodes.push(S_BADGE);
  return nodes;
}

// Filter standardov po oznakah: prazna množica = pokaži vse.
export type StdFilter = Set<'M' | 'I' | 'S'>;

function matchesFilter(s: Standard, filter: StdFilter): boolean {
  if (filter.size === 0) return true;
  return (filter.has('M') && !!s.minimalni)
    || (filter.has('I') && !!s.izbirni)
    || (filter.has('S') && !!s.shared);
}

function StandardiList({ standardi, filter, onToggleFilter }: { standardi: Standard[]; filter: StdFilter; onToggleFilter: (key: 'M' | 'I' | 'S') => void }) {
  const visible = standardi.filter(s => matchesFilter(s, filter));
  return (
    <div style={{ padding: '2px 0 0' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
        <StandardFilter filter={filter} onToggle={onToggleFilter} />
      </div>
      {visible.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>
          Ni standardov v izbranem filtru.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visible.map((s) => (
            <li key={s.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ marginTop: '3px', color: s.shared ? 'var(--wood)' : 'var(--muted)', fontSize: '13px', flexShrink: 0 }}>»</span>
              <span style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.55, fontWeight: (s.minimalni && !s.text.includes('**')) ? 600 : 400, fontStyle: s.izbirni ? 'italic' : 'normal' }}>
                {renderStandard(s)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoviPojmiList({ noviPojmi }: { noviPojmi: string[] }) {
  return (
    <div style={{ padding: 0 }}>
      <p style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6, margin: 0 }}>
        {noviPojmi.map((p, i) => (
          <span key={i}>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{p}</span>
            {i < noviPojmi.length - 1 && <span style={{ color: 'var(--muted)', margin: '0 6px' }}>◦</span>}
          </span>
        ))}
      </p>
    </div>
  );
}

// ── Legenda oznak ──────────────────────────────────────────

function Legend() {
  const items: { label: string; bg: string; color: string; desc: string }[] = [
    { label: 'O', bg: 'var(--forest)', color: '#fff', desc: 'obvezni cilj' },
    { label: 'I', bg: 'var(--wood)', color: '#fff', desc: 'izbirni cilj / standard' },
    { label: 'M', bg: 'var(--forest)', color: '#fff', desc: 'minimalni standard' },
    { label: 'S', bg: 'var(--cream)', color: 'var(--wood)', desc: 'skupni standard' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '0 2px 8px', fontFamily: 'var(--font-sans)' }}>
      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        Legenda:
      </span>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, background: it.bg, color: it.color, borderRadius: '3px', padding: '2px 6px', lineHeight: 1 }}>{it.label}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{it.desc}</span>
        </span>
      ))}
    </div>
  );
}

// ── Filter standardov ──────────────────────────────────────

function StandardFilter({ filter, onToggle }: { filter: StdFilter; onToggle: (key: 'M' | 'I' | 'S') => void }) {
  const opts: { key: 'M' | 'I' | 'S'; bg: string; color: string; title: string }[] = [
    { key: 'M', bg: 'var(--forest)', color: '#fff', title: 'Prikaži samo minimalne standarde' },
    { key: 'I', bg: 'var(--wood)', color: '#fff', title: 'Prikaži samo izbirne standarde' },
    { key: 'S', bg: 'var(--cream)', color: 'var(--wood)', title: 'Prikaži samo skupne standarde' },
  ];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        Filter:
      </span>
      {opts.map(o => {
        const active = filter.has(o.key);
        return (
          <button
            key={o.key}
            onClick={() => onToggle(o.key)}
            title={o.title}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700,
              width: '24px', height: '22px', borderRadius: '4px', cursor: 'pointer',
              background: active ? o.bg : 'transparent',
              color: active ? o.color : 'var(--muted)',
              border: `1px solid ${active ? o.bg : 'var(--hairline)'}`,
              lineHeight: 1, padding: 0,
              transition: 'all 0.15s',
            }}
          >
            {o.key}
          </button>
        );
      })}
    </div>
  );
}

// ── Palette ────────────────────────────────────────────────

function Palette({ onDragStart, onDragEnd }: { onDragStart: (t: PaletteType) => void; onDragEnd: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '10px 2px 6px' }}>
      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap', marginRight: '2px' }}>
        Dodaj:
      </span>
      {PALETTE_TYPES.map(type => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', type);
            e.dataTransfer.effectAllowed = 'copy';
            onDragStart(type);
          }}
          onDragEnd={onDragEnd}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--r-sm)',
            border: `1px solid ${PALETTE_COLORS[type]}44`,
            color: PALETTE_COLORS[type],
            background: `${PALETTE_COLORS[type]}11`,
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'grab',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {type}
        </div>
      ))}
    </div>
  );
}

// ── Drop zone ──────────────────────────────────────────────

function DropZone({ onDrop }: { onDrop: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(); }}
      style={{
        height: over ? '32px' : '6px',
        margin: '2px 0',
        background: over ? 'rgba(10,46,14,0.08)' : 'transparent',
        borderRadius: '4px',
        border: over ? '1.5px dashed var(--forest)' : 'none',
        transition: 'height 0.1s, background 0.1s',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── Cilj row (read-only) ───────────────────────────────────

function CiljRow({ tip, text }: { tip: 'O' | 'I'; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
      <span style={{
        flexShrink: 0, marginTop: '1px', fontSize: '10px', fontWeight: 700,
        letterSpacing: '0.05em',
        background: tip === 'O' ? 'var(--forest)' : 'var(--wood)',
        color: '#fff', borderRadius: '3px', padding: '2px 6px',
      }}>
        {tip}
      </span>
      <span style={{ flex: 1, fontSize: '13px', lineHeight: 1.55, color: 'var(--body)' }}>
        {text}
      </span>
    </div>
  );
}

// ── Custom enota row ───────────────────────────────────────

function CustomEnotaRow({ item, onToggle, onDragStart, onDragEnd }: {
  item: ResolvedEnotaItem & { kind: 'custom' };
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', background: item.checked ? '#f4fbf4' : 'var(--canvas)', transition: 'background 0.2s' }}>
      <div ref={headerRef} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 20px' }}>
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'enota');
            if (headerRef.current) e.dataTransfer.setDragImage(headerRef.current, 0, 16);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          style={{ cursor: 'grab', color: 'var(--muted)', flexShrink: 0 }}
          title="Povleci za preurejanje ali odstranitev"
        >
          <GripIcon />
        </span>
        <button
          onClick={onToggle}
          style={{
            width: '20px', height: '20px', flexShrink: 0,
            border: `2px solid ${item.checked ? 'var(--green-ok)' : item.color}`,
            borderRadius: '4px',
            background: item.checked ? 'var(--green-ok)' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', transition: 'all 0.15s',
          }}
        >
          {item.checked && <CheckIcon />}
        </button>
        <span style={{
          flex: 1, fontSize: '13px', fontStyle: 'italic',
          color: item.checked ? 'var(--green-ok)' : item.color,
          textDecoration: 'none',
          opacity: item.checked ? 0.7 : 1,
        }}>
          {item.type}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--muted)', flexShrink: 0 }}>ur: 1</span>
      </div>
    </div>
  );
}

// ── Podpoglavje row ────────────────────────────────────────

function PodpoglavjeRow({ podpoglavje, predmetId, checked, onToggle, unitHours, onHourChange, remaining, number, isAnonymous }: {
  podpoglavje: import('@/types/curriculum').Podpoglavje;
  predmetId: string;
  checked: boolean;
  onToggle: () => void;
  unitHours: number;
  onHourChange: (delta: number) => void;
  remaining: number;
  number: string;
  isAnonymous?: boolean;
}) {
  const [openCilji, setOpenCilji] = useState(false);
  const [openStandardi, setOpenStandardi] = useState(false);
  const [openPojmi, setOpenPojmi] = useState(false);
  const [stdFilter, setStdFilter] = useState<StdFilter>(new Set());
  const toggleFilter = (key: 'M' | 'I' | 'S') => setStdFilter(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const hasCilji = podpoglavje.cilji.length > 0;
  const hasStandardi = (podpoglavje.standardi?.length ?? 0) > 0;
  const hasPojmi = (podpoglavje.noviPojmi?.length ?? 0) > 0;

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', background: checked ? '#f4fbf4' : 'var(--canvas)', transition: 'background 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 20px' }}>
        {isAnonymous ? (
          <Link
            href="/login"
            title="Prijavite se za beleženje napredka"
            style={{ width: '20px', height: '20px', flexShrink: 0, alignSelf: 'flex-start', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
          >
            <LockIcon />
          </Link>
        ) : (
          <button
            onClick={onToggle}
            title={checked ? 'Označi kot neopravljeno' : 'Označi kot opravljeno'}
            style={{ width: '20px', height: '20px', flexShrink: 0, alignSelf: 'flex-start', marginTop: '2px', border: `2px solid ${checked ? 'var(--green-ok)' : 'var(--hairline)'}`, borderRadius: '4px', background: checked ? 'var(--green-ok)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', transition: 'all 0.15s' }}
          >
            {checked && <CheckIcon />}
          </button>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: podpoglavje.izbirna ? 400 : 500, fontStyle: podpoglavje.izbirna ? 'italic' : 'normal', color: checked ? 'var(--green-ok)' : podpoglavje.izbirna ? 'var(--muted)' : 'var(--ink)', opacity: checked ? 0.7 : 1 }}>
            <span style={{ fontWeight: 400, color: 'var(--muted)', marginRight: '6px', fontSize: '12px' }}>{number}</span>{podpoglavje.naslov}
            {podpoglavje.izbirna && (
              <span style={{ marginLeft: '8px', fontSize: '9px', fontWeight: 600, fontStyle: 'normal', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wood)', border: '1px solid var(--wood-lt)', borderRadius: '3px', padding: '1px 5px', verticalAlign: 'middle' }}>
                izbirno
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em', marginRight: '2px' }}>ur:</span>
          <button onClick={() => onHourChange(-1)} disabled={unitHours <= 0}
            style={{ width: '22px', height: '22px', border: '1px solid var(--hairline)', borderRadius: '4px', background: 'transparent', cursor: unitHours <= 0 ? 'not-allowed' : 'pointer', color: unitHours <= 0 ? 'var(--hairline)' : 'var(--muted)', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            −
          </button>
          <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
            {unitHours}
          </span>
          <button onClick={() => onHourChange(1)} disabled={remaining <= 0}
            style={{ width: '22px', height: '22px', border: '1px solid var(--hairline)', borderRadius: '4px', background: 'transparent', cursor: remaining <= 0 ? 'not-allowed' : 'pointer', color: remaining <= 0 ? 'var(--hairline)' : 'var(--forest)', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            +
          </button>
        </div>
      </div>

      {hasCilji && (
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          <button onClick={() => setOpenCilji(v => !v)} style={sectionToggleStyle(openCilji)}>
            <ChevronIcon open={openCilji} /> Cilji
          </button>
          {openCilji && (
            <div style={{ padding: '0 20px 6px 44px' }}>
              {podpoglavje.cilji.map(c => (
                <CiljRow key={c.id} tip={c.tip} text={c.text} />
              ))}
            </div>
          )}
        </div>
      )}
      {hasStandardi && (
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          <button onClick={() => setOpenStandardi(v => !v)} style={sectionToggleStyle(openStandardi)}>
            <ChevronIcon open={openStandardi} /> Standardi znanja
          </button>
          {openStandardi && (
            <div style={{ padding: '0 20px 6px 44px', background: '#fafaf8' }}>
              <StandardiList standardi={podpoglavje.standardi} filter={stdFilter} onToggleFilter={toggleFilter} />
            </div>
          )}
        </div>
      )}
      {hasPojmi && (
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          <button onClick={() => setOpenPojmi(v => !v)} style={sectionToggleStyle(openPojmi)}>
            <ChevronIcon open={openPojmi} /> Novi pojmi
          </button>
          {openPojmi && (
            <div style={{ padding: '6px 20px 6px 44px', background: 'var(--cream)' }}>
              <NoviPojmiList noviPojmi={podpoglavje.noviPojmi!} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Poglavje row ──────────────────────────────────────────

function PoglavjeRow({ poglavje, index, predmetId, checked, onToggle, isOpen, onToggleOpen, getHours, onHourChange, remaining, resolve, addEnota, reorder, removeEnota, toggleCustom, isAnonymous }: {
  poglavje: import('@/types/curriculum').Poglavje;
  index: number;
  predmetId: string;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  getHours: (key: string) => number;
  onHourChange: (key: string, delta: number) => void;
  remaining: number;
  resolve: (key: string, currIds: string[]) => ResolvedEnotaItem[];
  addEnota: (key: string, type: PaletteType, at: number, currIds: string[]) => void;
  reorder: (key: string, from: number, to: number, currIds: string[]) => void;
  removeEnota: (key: string, id: string) => void;
  toggleCustom: (key: string, id: string) => void;
  isAnonymous?: boolean;
}) {
  const [openOpis, setOpenOpis] = useState(false);
  const [isDraggingCustom, setIsDraggingCustom] = useState(false);
  const dragFromRef = useRef<number | null>(null);
  const dragDroppedRef = useRef(false);
  const paletteType = useContext(PaletteDragCtx);

  const poglavjeKey = `${predmetId}:${poglavje.id}`;
  const podpoglavjeIds = poglavje.podpoglavja.map(pp => pp.id);
  const podpoglavjeMap = useMemo(() => new Map(poglavje.podpoglavja.map(pp => [pp.id, pp])), [poglavje.podpoglavja]);
  const items = resolve(poglavjeKey, podpoglavjeIds);

  const customCount = items.filter(i => i.kind === 'custom').length;
  const checkedCustomCount = items.filter(i => i.kind === 'custom' && i.checked).length;

  const totalHours = poglavje.podpoglavja.reduce((s, pp) => s + getHours(`${predmetId}:${pp.id}`), 0) + customCount;
  const doneHours = poglavje.podpoglavja
    .filter(pp => checked[`${predmetId}:${pp.id}`])
    .reduce((s, pp) => s + getHours(`${predmetId}:${pp.id}`), 0) + checkedCustomCount;
  const allDone = totalHours > 0 && doneHours === totalHours;

  const handleDrop = (toIndex: number) => {
    if (paletteType !== null) {
      addEnota(poglavjeKey, paletteType, toIndex, podpoglavjeIds);
    } else if (dragFromRef.current !== null) {
      dragDroppedRef.current = true;
      reorder(poglavjeKey, dragFromRef.current, toIndex, podpoglavjeIds);
      dragFromRef.current = null;
      setIsDraggingCustom(false);
    }
  };

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)' }}>
      <button onClick={onToggleOpen}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, background: allDone ? 'var(--green-ok)' : 'var(--forest)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', transition: 'background 0.3s' }}>
          {allDone ? <CheckIcon /> : <ChevronIcon open={isOpen} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 400, color: 'var(--ink)', letterSpacing: '0.01em' }}>
            <span style={{ fontWeight: 300, color: 'var(--muted)', marginRight: '10px' }}>{index}</span>{poglavje.naslov}
          </div>
        </div>
        <span style={{ fontSize: '12px', color: doneHours > 0 ? 'var(--green-ok)' : 'var(--muted)', fontWeight: doneHours > 0 ? 600 : 400, whiteSpace: 'nowrap' }}>
          {doneHours} / {totalHours} ur
        </span>
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          {poglavje.opis && (
            <div style={{ borderBottom: '1px solid var(--hairline)' }}>
              <button
                onClick={() => setOpenOpis(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: openOpis ? 'var(--forest)' : 'var(--muted)', textAlign: 'left' }}
              >
                <ChevronIcon open={openOpis} />
                Opis poglavja
              </button>
              {openOpis && (
                <div style={{ padding: '2px 20px 14px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {poglavje.opis.split('\n\n').map((para, i) => (
                    <p key={i} style={{ margin: 0, fontSize: '13px', color: 'var(--body)', lineHeight: 1.65 }}>{para}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div onDragOver={(e) => e.preventDefault()}>
            <DropZone onDrop={() => handleDrop(0)} />
            {(() => {
              let currNum = 0;
              return items.map((item, idx) => {
                if (item.kind === 'curriculum') currNum++;
                const currNumSnapshot = currNum;
                return (
                  <div key={item.id}>
                    {item.kind === 'curriculum' ? (
                      <PodpoglavjeRow
                        podpoglavje={podpoglavjeMap.get(item.id)!}
                        predmetId={predmetId}
                        checked={!!checked[`${predmetId}:${item.id}`]}
                        onToggle={() => onToggle(`${predmetId}:${item.id}`)}
                        unitHours={getHours(`${predmetId}:${item.id}`)}
                        onHourChange={delta => onHourChange(`${predmetId}:${item.id}`, delta)}
                        remaining={remaining}
                        number={`${index}.${currNumSnapshot}`}
                        isAnonymous={isAnonymous}
                      />
                    ) : (
                      <CustomEnotaRow
                        item={item}
                        onToggle={() => toggleCustom(poglavjeKey, item.id)}
                        onDragStart={() => { dragDroppedRef.current = false; dragFromRef.current = idx; setIsDraggingCustom(true); }}
                        onDragEnd={() => {
                          if (!dragDroppedRef.current && dragFromRef.current !== null) {
                            const dragged = items[dragFromRef.current];
                            if (dragged?.kind === 'custom') removeEnota(poglavjeKey, dragged.id);
                          }
                          dragDroppedRef.current = false;
                          dragFromRef.current = null;
                          setIsDraggingCustom(false);
                        }}
                      />
                    )}
                    <DropZone onDrop={() => handleDrop(idx + 1)} />
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grade divider ─────────────────────────────────────────

function GradeDivider({ razred, target, used, doneHours, totalHours }: {
  razred: number; target: number; used: number; doneHours: number; totalHours: number;
}) {
  const remaining = target - used;
  const over = remaining < 0;
  const pct = totalHours === 0 ? 0 : Math.round((doneHours / totalHours) * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '0 2px 8px' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest)', whiteSpace: 'nowrap' }}>
        {razred}. razred
      </span>
      <div style={{ flex: 1, height: '4px', background: 'var(--hairline)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green-ok)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: doneHours > 0 ? 'var(--green-ok)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
        {doneHours} / {totalHours} opravljenih ur
      </span>
      {remaining !== 0 && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: over ? '#c0392b' : 'var(--muted)', whiteSpace: 'nowrap' }}>
          {over ? `preveč: ${Math.abs(remaining)} ur` : `Nerazporejene ure: ${remaining}`}
        </span>
      )}
    </div>
  );
}

// ── Main tree ─────────────────────────────────────────────

export default function CurriculumTree({ predmet, classId, razredFilter = null, classBar, isAnonymous = false, gradeTargets = { 8: 70, 9: 64 } }: {
  predmet: Predmet;
  classId?: string;
  razredFilter?: number | null;
  classBar?: ReactNode;
  isAnonymous?: boolean;
  gradeTargets?: Record<number, number>;
}) {
  const { checked, toggle } = useProgress(classId ? `ucni-nacrt-progress-${classId}` : undefined);
  const { getHours, change } = useHours(classId ? `ucni-nacrt-hours-${classId}` : undefined);
  const { resolve, addEnota, reorder, removeEnota, toggleCustom, countCustom, countCheckedCustom } = useEnotaOrder(classId ? `ucni-nacrt-enote-order-${classId}` : undefined);
  const { openChapters, toggle: toggleChapter, expandAll, collapseAll } = useOpenChapters(classId ? `ucni-nacrt-open-chapters-${classId}` : undefined);
  const [paletteDrag, setPaletteDrag] = useState<PaletteType | null>(null);

  const filteredPoglavja = useMemo(() =>
    razredFilter != null ? predmet.poglavja.filter(p => p.razred === razredFilter) : predmet.poglavja,
  [predmet.poglavja, razredFilter]);

  const gradeData = useMemo(() => {
    const map: Record<number, { podpoglavjeKeys: string[]; poglavjeKeys: string[]; target: number }> = {};
    for (const [rStr, target] of Object.entries(gradeTargets)) {
      map[Number(rStr)] = { podpoglavjeKeys: [], poglavjeKeys: [], target };
    }
    for (const p of filteredPoglavja) {
      if (p.razred && map[p.razred]) {
        map[p.razred].poglavjeKeys.push(`${predmet.id}:${p.id}`);
        for (const pp of p.podpoglavja) map[p.razred].podpoglavjeKeys.push(`${predmet.id}:${pp.id}`);
      }
    }
    return map;
  }, [filteredPoglavja, predmet.id, gradeTargets]);

  // Privzete ure na podpoglavje (ključ: `${predmet.id}:${pp.id}`)
  const hourDefaults = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of predmet.poglavja)
      for (const pp of p.podpoglavja)
        m[`${predmet.id}:${pp.id}`] = pp.privzeteUre ?? 1;
    return m;
  }, [predmet]);

  // getHours z upoštevanjem privzetih ur podpoglavja
  const getHoursD = useCallback((key: string) => getHours(key, hourDefaults[key] ?? 1), [getHours, hourDefaults]);

  const gradeUsed = useMemo(() => {
    const r: Record<number, number> = {};
    for (const [rStr, data] of Object.entries(gradeData)) {
      const razred = Number(rStr);
      r[razred] = data.podpoglavjeKeys.reduce((s, k) => s + getHoursD(k), 0) + countCustom(data.poglavjeKeys);
    }
    return r;
  }, [gradeData, getHoursD, countCustom]);

  const gradeDoneHours = useMemo(() => {
    const r: Record<number, number> = {};
    for (const [rStr, data] of Object.entries(gradeData)) {
      const razred = Number(rStr);
      r[razred] = data.podpoglavjeKeys.filter(k => checked[k]).reduce((s, k) => s + getHoursD(k), 0)
        + countCheckedCustom(data.poglavjeKeys);
    }
    return r;
  }, [gradeData, checked, getHoursD, countCheckedCustom]);

  const handleExpandAll = useCallback(() => expandAll(filteredPoglavja.map(p => p.id)), [expandAll, filteredPoglavja]);

  const handleHourChange = useCallback((unitKey: string, delta: number, razred: number) => {
    const data = gradeData[razred];
    if (!data) return;
    change(unitKey, delta, data.podpoglavjeKeys, data.target - countCustom(data.poglavjeKeys), hourDefaults);
  }, [gradeData, change, countCustom, hourDefaults]);

  return (
    <PaletteDragCtx.Provider value={paletteDrag}>
      <div>
        <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
              {predmet.opis}
            </p>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(36px,5vw,56px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>
              {predmet.naslov}
            </h1>
            {classBar}
          </div>
        </div>

        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 32px 64px' }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '16px 0 8px' }}>
            <button onClick={handleExpandAll}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '5px 12px', cursor: 'pointer' }}>
              Razširi vse
            </button>
            <button onClick={collapseAll}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', color: 'var(--muted)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '5px 12px', cursor: 'pointer' }}>
              Strni vse
            </button>
          </div>

          {(() => {
            const groups: { razred: number; items: { poglavje: typeof predmet.poglavja[0]; index: number }[] }[] = [];
            const continuous = predmet.continuousNumbering ?? false;
            const gradeCounter: Record<number, number> = {};
            filteredPoglavja.forEach((poglavje) => {
              const razred = poglavje.razred ?? 0;
              const last = groups[groups.length - 1];
              let index: number;
              if (continuous) {
                index = predmet.poglavja.indexOf(poglavje) + 1;
              } else {
                gradeCounter[razred] = (gradeCounter[razred] ?? 0) + 1;
                index = gradeCounter[razred];
              }
              if (!last || last.razred !== razred) groups.push({ razred, items: [{ poglavje, index }] });
              else last.items.push({ poglavje, index });
            });

            return groups.map(({ razred, items }, gi) => {
              const data = gradeData[razred];
              const remaining = data ? data.target - (gradeUsed[razred] ?? 0) : 0;
              return (
                <div key={razred} style={{ marginTop: gi === 0 ? 0 : '32px' }}>
                  <GradeDivider
                    razred={razred}
                    target={data?.target ?? 0}
                    used={gradeUsed[razred] ?? 0}
                    doneHours={gradeDoneHours[razred] ?? 0}
                    totalHours={gradeUsed[razred] ?? 0}
                  />
                  <Palette
                    onDragStart={setPaletteDrag}
                    onDragEnd={() => setPaletteDrag(null)}
                  />
                  {gi === 0 && <Legend />}
                  <div style={{ marginTop: '6px', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                    {items.map(({ poglavje, index }) => (
                      <PoglavjeRow
                        key={poglavje.id}
                        poglavje={poglavje}
                        index={index}
                        predmetId={predmet.id}
                        checked={checked}
                        onToggle={toggle}
                        isOpen={openChapters.has(poglavje.id)}
                        onToggleOpen={() => toggleChapter(poglavje.id)}
                        getHours={getHoursD}
                        onHourChange={(key, delta) => handleHourChange(key, delta, razred)}
                        remaining={remaining}
                        resolve={resolve}
                        addEnota={addEnota}
                        reorder={reorder}
                        removeEnota={removeEnota}
                        toggleCustom={toggleCustom}
                        isAnonymous={isAnonymous}
                      />
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          <p style={{ marginTop: '20px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
            {isAnonymous ? (
              <>Napredek se shranjuje v oblak. <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>Prijavite se</Link> za shranjevanje.</>
            ) : (
              'Napredek in ure se shranjujejo samodejno v oblak.'
            )}
          </p>
        </div>
      </div>
    </PaletteDragCtx.Provider>
  );
}
