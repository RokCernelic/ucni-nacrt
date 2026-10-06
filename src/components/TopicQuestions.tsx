'use client';

import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { BLOOM, type BloomLevel, type TopicQuestion } from '@/hooks/useTopicQuestions';
import RichField from '@/components/RichField';
import { sanitizeRichHtml, isRichEmpty } from '@/lib/richText';
import { questionsLabel } from '@/lib/quiz/format';

const smallBtn = (primary = false): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: primary ? 600 : 500,
  color: primary ? '#fff' : 'var(--forest)', background: primary ? 'var(--forest)' : 'transparent',
  border: primary ? 'none' : '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer',
});
const tinyLabel: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap',
};

const bloomOf = (l?: BloomLevel) => BLOOM.find(b => b.level === l);

/** Prikaz shranjenega HTML (ob prikazu še enkrat očiščen). */
function Rich({ html, style }: { html: string; style?: React.CSSProperties }) {
  return <div className="rich-content" style={style} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html).html }} />;
}

function BloomChip({ level, active, onClick, size = 22 }: { level: BloomLevel; active: boolean; onClick?: () => void; size?: number }) {
  const b = bloomOf(level)!;
  return (
    <button type="button" onClick={onClick} title={`${b.level} · ${b.name} — ${b.hint}`}
      style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, width: `${size + 2}px`, height: `${size}px`, borderRadius: '4px', padding: 0, lineHeight: 1,
        cursor: onClick ? 'pointer' : 'default', background: active ? b.color : 'transparent', color: active ? '#fff' : 'var(--muted)',
        border: `1px solid ${active ? b.color : 'var(--hairline)'}`, transition: 'all 0.15s' }}>
      {b.level}
    </button>
  );
}

function Editor({ initial, onSave, onCancel, saveLabel }: {
  initial?: TopicQuestion; onSave: (q: Omit<TopicQuestion, 'id'>) => void; onCancel?: () => void; saveLabel: string;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [bloom, setBloom] = useState<BloomLevel | undefined>(initial?.bloom);
  const empty = isRichEmpty(text);
  const save = () => {
    if (empty) return;
    onSave({ text, ...(isRichEmpty(answer) ? {} : { answer }), ...(bloom ? { bloom } : {}), ...(initial?.selected ? { selected: true } : {}) });
    if (!initial) { setText(''); setAnswer(''); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <RichField value={text} onChange={setText} onSubmit={save} minHeight={56} allowImage
        placeholder="Vprašanje ali naloga … (prilepi lahko iz Worda — enačbe, ulomki, x², √ ostanejo)" />
      <RichField value={answer} onChange={setAnswer} onSubmit={save} minHeight={34} allowImage placeholder="Odgovor / rešitev (neobvezno)" />
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={empty} style={{ ...smallBtn(true), opacity: empty ? 0.5 : 1, cursor: empty ? 'not-allowed' : 'pointer' }}>{saveLabel}</button>
        {onCancel && <button onClick={onCancel} style={smallBtn()}>Prekliči</button>}
        <span style={{ flex: 1 }} />
        <span style={tinyLabel}>Bloom:</span>
        {BLOOM.map(b => <BloomChip key={b.level} level={b.level} active={bloom === b.level} onClick={() => setBloom(bloom === b.level ? undefined : b.level)} />)}
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)', minWidth: '80px' }}>{bloomOf(bloom)?.name ?? ''}</span>
      </div>
    </div>
  );
}

/** Vprašanja in naloge, pripeta na podpoglavje: izbor za tisk, filter po Bloomu, slike. */
export default function TopicQuestions({ items, onChange, title }: {
  items: TopicQuestion[]; onChange: (items: TopicQuestion[]) => void; title: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Set<BloomLevel>>(new Set());
  const [withAnswers, setWithAnswers] = useState(false);
  const [printing, setPrinting] = useState(false);

  const visible = filter.size ? items.filter(q => q.bloom && filter.has(q.bloom)) : items;
  const selected = items.filter(q => q.selected);
  const allVisibleSelected = visible.length > 0 && visible.every(q => q.selected);

  const patch = (id: string, p: Partial<TopicQuestion>) => onChange(items.map(x => (x.id === id ? { ...x, ...p } : x)));
  const toggleFilter = (l: BloomLevel) => setFilter(prev => { const n = new Set(prev); if (n.has(l)) n.delete(l); else n.add(l); return n; });
  const setVisibleSelected = (on: boolean) => {
    const ids = new Set(visible.map(q => q.id));
    onChange(items.map(x => (ids.has(x.id) ? { ...x, selected: on || undefined } : x)));
  };

  // list za tisk se izriše le med tiskom in le za TO podpoglavje (ne za druga odprta)
  const print = () => {
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-questions'); setPrinting(false); window.removeEventListener('afterprint', done); };
    flushSync(() => setPrinting(true));
    root.classList.add('printing-questions');
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'var(--font-sans)' }}>
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allVisibleSelected} onChange={e => setVisibleSelected(e.target.checked)} />
            izberi vse{filter.size ? ' (v filtru)' : ''}
          </label>
          <button onClick={print} disabled={!selected.length}
            style={{ ...smallBtn(true), padding: '5px 10px', opacity: selected.length ? 1 : 0.45, cursor: selected.length ? 'pointer' : 'not-allowed' }}>
            🖨 Natisni izbrane ({selected.length})
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={withAnswers} onChange={e => setWithAnswers(e.target.checked)} /> z rešitvami
          </label>
          <span style={{ flex: 1 }} />
          <span style={tinyLabel}>Filter:</span>
          {BLOOM.map(b => <BloomChip key={b.level} level={b.level} active={filter.has(b.level)} onClick={() => toggleFilter(b.level)} />)}
        </div>
      )}

      {items.length > 0 && visible.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>Ni vprašanj v izbranem filtru.</p>
      )}

      {visible.length > 0 && (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.map(q => {
            const b = bloomOf(q.bloom);
            const n = items.indexOf(q) + 1;
            return (
              <li key={q.id} style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.5,
                border: `1px solid ${q.selected ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)',
                background: editingId === q.id ? 'var(--surface)' : 'var(--canvas)', padding: '10px 12px' }}>
                {editingId === q.id ? (
                  <Editor initial={q} saveLabel="Shrani" onCancel={() => setEditingId(null)}
                    onSave={(nq) => { onChange(items.map(x => (x.id === q.id ? { id: q.id, ...nq } : x))); setEditingId(null); }} />
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={!!q.selected} onChange={e => patch(q.id, { selected: e.target.checked || undefined })}
                      title="Izberi za tisk" style={{ marginTop: '3px', cursor: 'pointer' }} />
                    <span style={{ color: 'var(--muted)', minWidth: '18px', fontVariantNumeric: 'tabular-nums' }}>{n}.</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Rich html={q.text} />
                      {q.answer && (
                        <div style={{ display: 'flex', gap: '4px', fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          <span>Rešitev:</span><Rich html={q.answer} style={{ flex: 1, minWidth: 0 }} />
                        </div>
                      )}
                    </div>
                    {b && (
                      <span title={`${b.level} · ${b.name} — ${b.hint}`}
                        style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: b.color, borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        {b.level} · {b.name}
                      </span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(q.id); setAdding(false); }} style={{ ...smallBtn(), padding: '3px 9px', fontSize: '11px' }}>✎ Uredi</button>
                      <button onClick={() => { if (confirm('Izbrišem to vprašanje / nalogo?')) onChange(items.filter(x => x.id !== q.id)); }}
                        style={{ ...smallBtn(), padding: '3px 9px', fontSize: '11px', color: '#c0392b', borderColor: '#e0b4ae' }}>× Izbriši</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {adding ? (
        <div style={{ border: '1px dashed var(--forest)', borderRadius: 'var(--r-md)', padding: '10px 12px', background: 'var(--surface)' }}>
          <Editor saveLabel="Dodaj nalogo" onCancel={() => setAdding(false)}
            onSave={(nq) => { onChange([...items, { id: crypto.randomUUID(), ...nq }]); setAdding(false); }} />
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setEditingId(null); }}
          style={{ alignSelf: 'flex-start', ...smallBtn(), borderStyle: 'dashed', padding: '7px 14px' }}>
          + Nova naloga
        </button>
      )}

      {printing && selected.length > 0 && createPortal(
        <div className="print-questions" aria-hidden>
          <div className="pq-head">
            <div className="pq-title">{title}</div>
            <div className="pq-meta">Ime in priimek: ______________________________ &nbsp; Datum: ____________ &nbsp; {questionsLabel(selected.length)}</div>
          </div>
          <ol className="pq-list">
            {selected.map(q => (
              <li key={q.id} className="pq-item">
                <Rich html={q.text} />
                {withAnswers && q.answer && <div className="pq-answer"><b>Rešitev:</b> <Rich html={q.answer} style={{ display: 'inline' }} /></div>}
                {!withAnswers && <div className="pq-space" />}
              </li>
            ))}
          </ol>
        </div>,
        document.body,
      )}
    </div>
  );
}
