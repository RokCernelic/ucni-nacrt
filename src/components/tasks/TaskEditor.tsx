'use client';

import { useState, useMemo } from 'react';
import RichField from '@/components/RichField';
import { isRichEmpty, sanitizeRichHtml } from '@/lib/richText';
import { parseNumber } from '@/lib/quiz/scoring';
import {
  BLOOM, DIFFICULTY, KINDS, ANSWER_KINDS, SOURCES, emptyTask,
  type TaskDraft, type AnswerKind, type TaskKind,
} from '@/lib/tasks/types';
import { topicsOf, topicInfo, topicLabel, chapterInfo, allCurricula } from '@/lib/tasks/topics';
import { Chip, btn, tinyLabel, input } from './ui';

const LETTERS = 'ABCDEF';
const uid = () => crypto.randomUUID();

function problemsOf(t: TaskDraft): string[] {
  const p: string[] = [];
  if (isRichEmpty(t.body)) p.push('vpiši besedilo naloge');
  if (t.answer_kind === 'mc' || t.answer_kind === 'tf') {
    const filled = (t.options ?? []).filter(o => o.text.trim());
    if (filled.length < 2) p.push('potrebni sta vsaj 2 možnosti');
    if (!t.correct || !filled.some(o => o.id === t.correct)) p.push('označi pravilno možnost');
  }
  if (t.answer_kind === 'numeric' && parseNumber(t.correct ?? '') === null) p.push('vpiši pravilno številsko vrednost');
  return p;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={tinyLabel}>{label}</span>
      {children}
    </div>
  );
}

/** Urejevalnik naloge iz baze. `fixedTopic` = odprto iz podpoglavja učnega načrta (že povezano). */
export default function TaskEditor({ initial, fixedTopic, onSave, onCancel }: {
  initial?: TaskDraft;
  fixedTopic?: string;
  onSave: (draft: TaskDraft) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [t, setT] = useState<TaskDraft>(() => initial ?? emptyTask(fixedTopic
    ? { topics: [fixedTopic], curriculum: fixedTopic.split(':')[0] } : {}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagText, setTagText] = useState((initial?.tags ?? []).join(', '));
  const [pickCurr, setPickCurr] = useState(t.curriculum ?? allCurricula()[0]?.id ?? '');
  const [pickChapter, setPickChapter] = useState('');
  const up = (patch: Partial<TaskDraft>) => setT(prev => ({ ...prev, ...patch }));
  const problems = problemsOf(t);

  const setKind = (k: AnswerKind) => {
    if (k === 'tf') up({ answer_kind: k, options: [{ id: uid(), text: 'Drži' }, { id: uid(), text: 'Ne drži' }], correct: null });
    else if (k === 'mc') up({ answer_kind: k, options: t.answer_kind === 'mc' && t.options ? t.options : [0, 1, 2, 3].map(() => ({ id: uid(), text: '' })), correct: t.answer_kind === 'mc' ? t.correct : null });
    else up({ answer_kind: k, options: null, correct: k === 'numeric' ? (t.answer_kind === 'numeric' ? t.correct : '') : null });
  };
  const toggleKindTag = (k: TaskKind) => up({ kinds: t.kinds.includes(k) ? t.kinds.filter(x => x !== k) : [...t.kinds, k] });

  // Predmet → poglavje (po razredih) → podpoglavje, vse iz učnega načrta
  const chapterOptions = useMemo(() => {
    const byGrade = new Map<number, { key: string; label: string }[]>();
    for (const tp of topicsOf(pickCurr)) {
      const g = tp.grade ?? 0;
      const list = byGrade.get(g) ?? [];
      if (!list.some(c => c.key === tp.chapterKey)) list.push({ key: tp.chapterKey, label: tp.chapter });
      byGrade.set(g, list);
    }
    return [...byGrade.entries()];
  }, [pickCurr]);
  const topicOptions = useMemo(() => topicsOf(pickCurr).filter(tp => tp.chapterKey === pickChapter), [pickCurr, pickChapter]);
  const topicStandards = t.topics.flatMap(k => (topicInfo(k)?.standards ?? []).map(s => ({ ...s, topic: k })));

  const save = async () => {
    if (problems.length || busy) return;
    setBusy(true); setError(null);
    try {
      const tags = tagText.split(',').map(s => s.trim()).filter(Boolean);
      const clean = (h: string | null) => (h && !isRichEmpty(h) ? sanitizeRichHtml(h).html : null);
      await onSave({ ...t, tags, body: sanitizeRichHtml(t.body).html, answer: clean(t.answer), solution: clean(t.solution) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'var(--font-sans)' }}>
      <Field label="Oblika odgovora">
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {ANSWER_KINDS.map(a => (
            <Chip key={a.id} active={t.answer_kind === a.id} onClick={() => setKind(a.id)} title={a.quiz ? 'Uporabno v kvizu (samodejno ocenjevanje)' : 'Le za učne liste in pisne teste'}>
              {a.name}{a.quiz ? ' ·kviz' : ''}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Besedilo naloge">
        <RichField value={t.body} onChange={v => up({ body: v })} minHeight={70} allowImage onSubmit={() => void save()}
          placeholder="Besedilo naloge … (prilepi lahko iz Worda — enačbe, ulomki, x², √ ostanejo; slika = skica)" />
      </Field>

      {(t.answer_kind === 'mc' || t.answer_kind === 'tf') && (
        <Field label="Možnosti — označi pravilno">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {(t.options ?? []).map((o, i) => {
              const right = t.correct === o.id;
              return (
                <div key={o.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button type="button" onClick={() => up({ correct: o.id })} title={right ? 'Pravilen odgovor' : 'Označi kot pravilen'}
                    style={{ width: '28px', height: '28px', flexShrink: 0, borderRadius: '50%', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                      border: `2px solid ${right ? 'var(--green-ok)' : 'var(--hairline)'}`, background: right ? 'var(--green-ok)' : 'transparent', color: right ? '#fff' : 'var(--muted)' }}>
                    {right ? '✓' : LETTERS[i]}
                  </button>
                  <input value={o.text} disabled={t.answer_kind === 'tf'} placeholder={`Možnost ${LETTERS[i]}`}
                    onChange={e => up({ options: t.options!.map(x => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                    style={{ ...input, flex: 1, borderColor: right ? 'var(--green-ok)' : 'var(--hairline)' }} />
                  {t.answer_kind === 'mc' && t.options!.length > 2 && (
                    <button type="button" onClick={() => up({ options: t.options!.filter(x => x.id !== o.id), correct: right ? null : t.correct })}
                      style={{ ...btn(), padding: '4px 8px', color: '#c0392b' }}>×</button>
                  )}
                </div>
              );
            })}
            {t.answer_kind === 'mc' && (t.options?.length ?? 0) < 6 && (
              <button type="button" onClick={() => up({ options: [...(t.options ?? []), { id: uid(), text: '' }] })} style={{ ...btn(), alignSelf: 'flex-start' }}>+ Možnost</button>
            )}
          </div>
        </Field>
      )}

      {t.answer_kind === 'numeric' && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label="Pravilna vrednost">
            <input value={t.correct ?? ''} inputMode="decimal" placeholder="npr. 9,81" onChange={e => up({ correct: e.target.value })}
              style={{ ...input, width: '130px', borderColor: t.correct && parseNumber(t.correct) === null ? '#c0392b' : 'var(--hairline)' }} />
          </Field>
          <Field label="Toleranca ±">
            <input type="number" min={0} step="any" value={t.tolerance ?? ''} onChange={e => up({ tolerance: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} style={{ ...input, width: '100px' }} />
          </Field>
          <Field label="Enota">
            <input value={t.unit ?? ''} placeholder="npr. N" onChange={e => up({ unit: e.target.value || null })} style={{ ...input, width: '90px' }} />
          </Field>
        </div>
      )}

      {(t.answer_kind === 'short' || t.answer_kind === 'open') && (
        <Field label="Odgovor / rešitev (neobvezno)">
          <RichField value={t.answer ?? ''} onChange={v => up({ answer: v })} minHeight={36} allowImage placeholder="Končni odgovor" />
        </Field>
      )}

      <Field label="Postopek / namig (neobvezno)">
        <RichField value={t.solution ?? ''} onChange={v => up({ solution: v })} minHeight={36} allowImage placeholder="Postopek reševanja ali namig" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
        <Field label="Težavnost">
          <div style={{ display: 'flex', gap: '4px' }}>
            {DIFFICULTY.map(d => <Chip key={d.level} active={t.difficulty === d.level} color={d.color} onClick={() => up({ difficulty: t.difficulty === d.level ? null : d.level })}>{d.name}</Chip>)}
          </div>
        </Field>
        <Field label={`Bloom${t.bloom ? ` — ${BLOOM[t.bloom - 1].name}` : ''}`}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {BLOOM.map(b => <Chip key={b.level} square active={t.bloom === b.level} color={b.color} title={`${b.name} — ${b.hint}`} onClick={() => up({ bloom: t.bloom === b.level ? null : b.level })}>{b.level}</Chip>)}
          </div>
        </Field>
        <Field label="Vrsta naloge">
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {KINDS.map(k => <Chip key={k.id} active={t.kinds.includes(k.id)} onClick={() => toggleKindTag(k.id)}>{k.name}</Chip>)}
          </div>
        </Field>
      </div>

      <Field label="Učni načrt — poglavje / podpoglavje">
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          {t.chapters.map(k => {
            const ci = chapterInfo(k);
            return (
              <span key={k} title="Naloga je povezana s poglavjem (brez podpoglavja)" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--forest)', border: '1px dashed var(--forest)', borderRadius: '4px', padding: '2px 4px 2px 8px' }}>
                {ci ? `${ci.grade ? `${ci.grade}. r · ` : ''}${ci.label}` : k} <span style={{ color: 'var(--muted)' }}>(poglavje)</span>
                <button type="button" onClick={() => up({ chapters: t.chapters.filter(x => x !== k) })}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            );
          })}
          {t.topics.map(k => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--forest)', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '2px 4px 2px 8px' }}>
              {topicLabel(k)}
              <button type="button" onClick={() => up({ topics: t.topics.filter(x => x !== k), standards: t.standards.filter(id => !topicInfo(k)?.standards.some(s => s.id === id)) })}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
            </span>
          ))}
          <select value={pickCurr} onChange={e => { setPickCurr(e.target.value); setPickChapter(''); }} title="Predmet" style={{ ...input, padding: '4px 6px' }}>
            {allCurricula().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={pickChapter} onChange={e => setPickChapter(e.target.value)} title="Poglavje" style={{ ...input, padding: '4px 6px', maxWidth: '240px' }}>
            <option value="">poglavje …</option>
            {chapterOptions.map(([g, list]) => (
              <optgroup key={g} label={g ? `${g}. razred` : 'brez razreda'}>
                {list.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </optgroup>
            ))}
          </select>
          <select value="" disabled={!pickChapter} title="Podpoglavje"
            onChange={e => {
              const k = e.target.value;
              if (k === '__chapter__') { if (!t.chapters.includes(pickChapter)) up({ chapters: [...t.chapters, pickChapter], curriculum: t.curriculum ?? pickCurr }); }
              else if (k && !t.topics.includes(k)) up({ topics: [...t.topics, k], curriculum: t.curriculum ?? pickCurr });
            }}
            style={{ ...input, padding: '4px 6px', maxWidth: '280px', opacity: pickChapter ? 1 : 0.5 }}>
            <option value="">{pickChapter ? '+ dodaj podpoglavje …' : 'najprej izberi poglavje'}</option>
            {pickChapter && !t.chapters.includes(pickChapter) && <option value="__chapter__">★ samo poglavje (brez podpoglavja)</option>}
            {topicOptions.filter(o => !t.topics.includes(o.key)).map(o => (
              <option key={o.key} value={o.key}>{o.number} {o.title}</option>
            ))}
          </select>
        </div>
      </Field>

      {topicStandards.length > 0 && (
        <Field label="Standardi znanja, ki jih naloga preverja">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '170px', overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 8px' }}>
            {topicStandards.map(s => (
              <label key={`${s.topic}-${s.id}`} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--body)', cursor: 'pointer', lineHeight: 1.4 }}>
                <input type="checkbox" checked={t.standards.includes(s.id)} style={{ marginTop: '2px' }}
                  onChange={e => up({ standards: e.target.checked ? [...t.standards, s.id] : t.standards.filter(x => x !== s.id) })} />
                <span>{s.text.replace(/\*\*/g, '')}{s.minimalni && <b style={{ marginLeft: '4px', color: 'var(--forest)' }}>M</b>}</span>
              </label>
            ))}
          </div>
        </Field>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Točke">
          <input type="number" min={0.5} step={0.5} value={t.points} onChange={e => up({ points: Math.max(0, Number(e.target.value) || 0) })} style={{ ...input, width: '70px' }} />
        </Field>
        <Field label="Čas (min)">
          <input type="number" min={0} value={t.minutes ?? ''} onChange={e => up({ minutes: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} style={{ ...input, width: '70px' }} />
        </Field>
        <Field label="Vir">
          <select value={t.source ?? ''} onChange={e => up({ source: e.target.value || null })} style={input}>
            {SOURCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Ključniki (z vejico)">
          <input value={tagText} onChange={e => setTagText(e.target.value)} placeholder="npr. gostota, vzgon" style={{ ...input, width: '200px' }} />
        </Field>
        <Field label="Stanje">
          <div style={{ display: 'flex', gap: '4px' }}>
            <Chip active={t.status === 'verified'} onClick={() => up({ status: 'verified' })}>preverjena</Chip>
            <Chip active={t.status === 'draft'} color="#b7791f" onClick={() => up({ status: 'draft' })}>osnutek</Chip>
          </div>
        </Field>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: '10px' }}>
        <button type="button" onClick={() => void save()} disabled={!!problems.length || busy}
          style={{ ...btn(true), opacity: problems.length || busy ? 0.5 : 1, cursor: problems.length || busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Shranjujem …' : initial?.id ? 'Shrani' : 'Dodaj nalogo'}
        </button>
        <button type="button" onClick={onCancel} style={btn()}>Prekliči</button>
        {problems.length > 0 && <span style={{ fontSize: '12px', color: '#b7791f' }}>⚠ {problems.join(' · ')}</span>}
        {error && <span style={{ fontSize: '12px', color: '#c0392b' }}>{error}</span>}
      </div>
    </div>
  );
}
