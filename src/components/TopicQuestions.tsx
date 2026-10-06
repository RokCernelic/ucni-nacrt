'use client';

import { useState } from 'react';
import type { TopicQuestion } from '@/hooks/useTopicQuestions';
import RichField from '@/components/RichField';
import { sanitizeRichHtml, isRichEmpty } from '@/lib/richText';

const smallBtn = (primary = false): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: primary ? 600 : 500,
  color: primary ? '#fff' : 'var(--forest)', background: primary ? 'var(--forest)' : 'transparent',
  border: primary ? 'none' : '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer',
});
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1,
};

/** Prikaz shranjenega HTML (ob prikazu še enkrat očiščen). */
function Rich({ html, style }: { html: string; style?: React.CSSProperties }) {
  return <div className="rich-content" style={style} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html).html }} />;
}

function Editor({ initial, onSave, onCancel, saveLabel }: {
  initial?: TopicQuestion; onSave: (text: string, answer: string) => void; onCancel?: () => void; saveLabel: string;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const empty = isRichEmpty(text);
  const save = () => {
    if (empty) return;
    onSave(text, isRichEmpty(answer) ? '' : answer);
    if (!initial) { setText(''); setAnswer(''); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <RichField value={text} onChange={setText} onSubmit={save} minHeight={56}
        placeholder="Vprašanje ali naloga … (prilepi lahko iz Worda — enačbe, ulomki, x², √ ostanejo)" />
      <RichField value={answer} onChange={setAnswer} onSubmit={save} minHeight={34} placeholder="Odgovor / rešitev (neobvezno)" />
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={save} disabled={empty} style={{ ...smallBtn(true), opacity: empty ? 0.5 : 1, cursor: empty ? 'not-allowed' : 'pointer' }}>{saveLabel}</button>
        {onCancel && <button onClick={onCancel} style={smallBtn()}>Prekliči</button>}
      </div>
    </div>
  );
}

/** Vprašanja in naloge, pripeta na podpoglavje. */
export default function TopicQuestions({ items, onChange }: { items: TopicQuestion[]; onChange: (items: TopicQuestion[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'var(--font-sans)' }}>
      {items.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(q => (
            <li key={q.id} style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.5 }}>
              {editingId === q.id ? (
                <Editor initial={q} saveLabel="Shrani" onCancel={() => setEditingId(null)}
                  onSave={(text, answer) => { onChange(items.map(x => x.id === q.id ? { ...x, text, answer: answer || undefined } : x)); setEditingId(null); }} />
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Rich html={q.text} />
                    {q.answer && (
                      <div style={{ display: 'flex', gap: '4px', fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        <span>Rešitev:</span><Rich html={q.answer} style={{ flex: 1, minWidth: 0 }} />
                      </div>
                    )}
                  </div>
                  <button title="Uredi" onClick={() => setEditingId(q.id)} style={iconBtn}>✎</button>
                  <button title="Odstrani" style={{ ...iconBtn, color: '#c0392b' }}
                    onClick={() => { if (confirm('Odstranim to vprašanje / nalogo?')) onChange(items.filter(x => x.id !== q.id)); }}>×</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <Editor saveLabel="+ Dodaj" onSave={(text, answer) => onChange([...items, { id: crypto.randomUUID(), text, ...(answer ? { answer } : {}) }])} />
    </div>
  );
}
