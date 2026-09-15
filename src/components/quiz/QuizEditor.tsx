'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  useQuizLibrary, folderPath, cloneQuestion, QuizStorageFullError,
  newMcQuestion, newTrueFalseQuestion, newNumericQuestion,
} from '@/hooks/useQuizLibrary';
import { questionProblems, parseNumber } from '@/lib/quiz/scoring';
import { downscaleImage } from '@/lib/quiz/image';
import { questionsLabel, pointsLabel, formatNumber } from '@/lib/quiz/format';
import type { Quiz, Question, McQuestion, NumericQuestion, QuizFolder } from '@/lib/quiz/types';
import StartSessionDialog from '@/components/quiz/StartSessionDialog';

const LETTERS = 'ABCDEF';
const MAX_OPTIONS = 6;

const input: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', background: 'var(--canvas)',
  border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
};
const btn = (primary = false): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: primary ? 600 : 500,
  color: primary ? '#fff' : 'var(--forest)', background: primary ? 'var(--forest)' : 'transparent',
  border: primary ? 'none' : '1px solid var(--hairline)', borderRadius: 'var(--r-sm)',
  padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
});
const iconBtn: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', background: 'transparent',
  border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', width: '30px', height: '30px', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const label: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)',
};

function flatFolders(folders: QuizFolder[], parentId: string | null = null, depth = 0): { f: QuizFolder; depth: number }[] {
  return folders.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'sl'))
    .flatMap(f => [{ f, depth }, ...flatFolders(folders, f.id, depth + 1)]);
}

function AutoTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return (
    <textarea ref={ref} value={value} rows={2} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ ...input, width: '100%', resize: 'none', lineHeight: 1.5, overflow: 'hidden', fontSize: '15px' }} />
  );
}

function QuestionCard({ q, index, total, onChange, onMove, onDuplicate, onDelete, onError }: {
  q: Question; index: number; total: number;
  onChange: (q: Question) => void; onMove: (dir: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const problems = questionProblems(q);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try { onChange({ ...q, image: await downscaleImage(file) }); }
    catch (e) { onError(e instanceof Error ? e.message : 'Slike ni bilo mogoče naložiti.'); }
  };

  const setMc = (patch: Partial<McQuestion>) => onChange({ ...(q as McQuestion), ...patch });
  const setNum = (patch: Partial<NumericQuestion>) => onChange({ ...(q as NumericQuestion), ...patch });

  return (
    <div style={{ background: 'var(--canvas)', border: `1px solid ${problems.length ? '#ecd9a8' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)', padding: '16px 18px' }}>
      {/* glava */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--forest)', lineHeight: 1, minWidth: '26px' }}>{index + 1}</span>
        <span style={{ ...label, background: 'var(--cream, #f3efe6)', padding: '3px 8px', borderRadius: '4px' }}>
          {q.kind === 'numeric' ? 'Številsko' : 'Izbirno'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>
          točke
          <input type="number" min={0.5} step={0.5} value={q.points}
            onChange={e => onChange({ ...q, points: Math.max(0, Number(e.target.value) || 0) })}
            style={{ ...input, width: '64px', padding: '4px 6px', fontSize: '13px' }} />
        </span>
        <span style={{ flex: 1 }} />
        <button title="Premakni gor" style={{ ...iconBtn, opacity: index === 0 ? 0.35 : 1 }} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button title="Premakni dol" style={{ ...iconBtn, opacity: index === total - 1 ? 0.35 : 1 }} disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
        <button title="Podvoji vprašanje" style={iconBtn} onClick={onDuplicate}>⧉</button>
        <button title="Izbriši vprašanje" style={{ ...iconBtn, color: '#c0392b' }} onClick={onDelete}>×</button>
      </div>

      {/* besedilo + slika */}
      <AutoTextarea value={q.prompt} onChange={v => onChange({ ...q, prompt: v })} placeholder="Besedilo vprašanja …" />
      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        {q.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.image} alt="" style={{ maxWidth: '320px', maxHeight: '220px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button style={btn()} onClick={() => fileRef.current?.click()}>Zamenjaj sliko</button>
              <button style={{ ...btn(), color: '#c0392b' }} onClick={() => onChange({ ...q, image: undefined })}>Odstrani sliko</button>
            </div>
          </>
        ) : (
          <button style={btn()} onClick={() => fileRef.current?.click()}>+ Slika</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {/* odgovori */}
      {q.kind === 'mc' ? (
        <div style={{ marginTop: '14px' }}>
          <div style={{ ...label, marginBottom: '8px' }}>Možnosti — označi pravilno</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {q.options.map((o, oi) => {
              const isRight = q.correct === o.id;
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button title={isRight ? 'Pravilen odgovor' : 'Označi kot pravilen'} onClick={() => setMc({ correct: o.id })}
                    style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: '50%', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 700,
                      border: `2px solid ${isRight ? 'var(--green-ok)' : 'var(--hairline)'}`,
                      background: isRight ? 'var(--green-ok)' : 'transparent', color: isRight ? '#fff' : 'var(--muted)' }}>
                    {isRight ? '✓' : LETTERS[oi]}
                  </button>
                  <input value={o.text} placeholder={`Možnost ${LETTERS[oi]}`}
                    onChange={e => setMc({ options: q.options.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) })}
                    style={{ ...input, flex: 1, minWidth: 0, borderColor: isRight ? 'var(--green-ok)' : 'var(--hairline)' }} />
                  <label title="Ob mešanju ostane na tem mestu (npr. »nič od naštetega«)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-sans)', fontSize: '11px', color: o.keepPlace ? 'var(--forest)' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={!!o.keepPlace}
                      onChange={e => setMc({ options: q.options.map(x => x.id === o.id ? { ...x, keepPlace: e.target.checked } : x) })} />
                    ohrani mesto
                  </label>
                  <button title="Odstrani možnost" style={{ ...iconBtn, opacity: q.options.length <= 2 ? 0.35 : 1 }} disabled={q.options.length <= 2}
                    onClick={() => setMc({ options: q.options.filter(x => x.id !== o.id), correct: q.correct === o.id ? null : q.correct })}>×</button>
                </div>
              );
            })}
          </div>
          {q.options.length < MAX_OPTIONS && (
            <button style={{ ...btn(), marginTop: '8px' }}
              onClick={() => setMc({ options: [...q.options, { id: crypto.randomUUID(), text: '' }] })}>+ Možnost</button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '14px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={label}>Pravilna vrednost</span>
            <input value={q.correct} inputMode="decimal" placeholder="npr. 9,81"
              onChange={e => setNum({ correct: e.target.value })}
              style={{ ...input, width: '160px', borderColor: q.correct && parseNumber(q.correct) === null ? '#c0392b' : 'var(--hairline)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={label}>Toleranca ±</span>
            <input type="number" min={0} step="any" value={q.tolerance}
              onChange={e => setNum({ tolerance: Math.max(0, Number(e.target.value) || 0) })}
              style={{ ...input, width: '120px' }} />
          </label>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5, flex: '1 1 220px' }}>
            {(() => {
              const v = parseNumber(q.correct);
              if (v === null) return 'Učenec vpiše število; vejica in pika sta enakovredni.';
              return q.tolerance > 0
                ? `Pravilno od ${formatNumber(v - q.tolerance)} do ${formatNumber(v + q.tolerance)} (vejica ali pika).`
                : `Pravilno le točno ${formatNumber(v)} (vejica ali pika).`;
            })()}
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#b7791f', margin: '12px 0 0' }}>⚠ {problems.join(' · ')}</p>
      )}
    </div>
  );
}

export default function QuizEditor({ quizId }: { quizId: string }) {
  const { user, loading } = useAuth();
  const lib = useQuizLibrary();
  const [draft, setDraft] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Quiz | null>(null);

  // naloži kviz enkrat (nadaljnje urejanje teče prek osnutka)
  useEffect(() => {
    if (!lib.loaded || draft) return;
    const q = lib.quizzes.find(x => x.id === quizId);
    if (q) setDraft(q);
  }, [lib.loaded, lib.quizzes, quizId, draft]);

  const { updateQuiz } = lib;
  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const q = pending.current;
    if (!q) return;
    pending.current = null;
    try {
      updateQuiz(q.id, { title: q.title, folderId: q.folderId, questions: q.questions });
      setStatus('saved'); setError(null);
    } catch (e) {
      setStatus('error');
      setError(e instanceof QuizStorageFullError ? e.message : 'Shranjevanje ni uspelo.');
    }
  }, [updateQuiz]);

  // shrani pri zapustitvi strani
  useEffect(() => {
    const onUnload = () => flush();
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('beforeunload', onUnload); flush(); };
  }, [flush]);

  const update = (next: Quiz) => {
    setDraft(next);
    pending.current = next;
    setStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 500);
  };

  if (loading || !lib.loaded) return null;

  if (!user) {
    return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ fontSize: '14px', color: 'var(--muted)' }}>Za urejanje kvizov se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.</p></div>;
  }
  if (!draft) {
    return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ fontSize: '14px', color: 'var(--muted)' }}>Kviz ne obstaja. <Link href="/kvizi" style={{ color: 'var(--forest)' }}>Nazaj na kvize</Link></p></div>;
  }

  const setQuestions = (questions: Question[]) => update({ ...draft, questions });
  const replaceQ = (i: number, q: Question) => setQuestions(draft.questions.map((x, j) => j === i ? q : x));
  const moveQ = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.questions.length) return;
    const qs = [...draft.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    setQuestions(qs);
  };

  const incomplete = draft.questions.filter(q => questionProblems(q).length > 0).length;
  const maxPoints = draft.questions.reduce((s, q) => s + q.points, 0);
  const path = folderPath(lib.folders, draft.folderId);

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/kvizi" onClick={flush} style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
            ← Kvizi{path.length ? ` / ${path.map(f => f.name).join(' / ')}` : ''}
          </Link>
          <input value={draft.title} placeholder="Naslov kviza"
            onChange={e => update({ ...draft, title: e.target.value })}
            style={{ display: 'block', width: '100%', marginTop: '10px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)', outline: 'none', color: '#fff', fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 300, padding: '2px 0 6px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '12px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>
            <span>{questionsLabel(draft.questions.length)} · {pointsLabel(maxPoints)}</span>
            {incomplete > 0 ? <span style={{ color: '#f6d48a' }}>⚠ nedokončano: {incomplete}</span> : <span style={{ color: '#bfe3c0' }}>✓ pripravljen</span>}
            <span style={{ flex: 1 }} />
            <select value={draft.folderId ?? ''} onChange={e => update({ ...draft, folderId: e.target.value || null })}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 'var(--r-sm)', padding: '4px 6px' }}>
              <option value="" style={{ color: '#222' }}>📁 Vsi kvizi (koren)</option>
              {flatFolders(lib.folders).map(({ f, depth }) => <option key={f.id} value={f.id} style={{ color: '#222' }}>{'  '.repeat(depth)}📁 {f.name}</option>)}
            </select>
            <span style={{ color: status === 'error' ? '#f5b7b1' : 'rgba(255,255,255,0.5)' }}>
              {status === 'saving' ? 'Shranjujem …' : status === 'error' ? 'Ni shranjeno' : 'Shranjeno ✓'}
            </span>
            <button disabled={incomplete > 0 || draft.questions.length === 0}
              title={incomplete > 0 ? 'Najprej dokončaj vsa vprašanja' : 'Zaženi sejo z razredom'}
              onClick={() => { flush(); setStarting(true); }}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, background: '#fff', color: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: incomplete > 0 ? 'not-allowed' : 'pointer', opacity: incomplete > 0 ? 0.5 : 1 }}>
              ▶ Zaženi
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px 80px' }}>
        {error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#c0392b', margin: '0 0 14px' }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {draft.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} total={draft.questions.length}
              onChange={nq => replaceQ(i, nq)}
              onMove={dir => moveQ(i, dir)}
              onDuplicate={() => setQuestions([...draft.questions.slice(0, i + 1), cloneQuestion(q), ...draft.questions.slice(i + 1)])}
              onDelete={() => { if (confirm(`Izbrišem vprašanje ${i + 1}?`)) setQuestions(draft.questions.filter((_, j) => j !== i)); }}
              onError={msg => setError(msg)} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', padding: '14px', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-md)', alignItems: 'center' }}>
          <span style={{ ...label, marginRight: '4px' }}>Dodaj vprašanje</span>
          <button style={btn(true)} onClick={() => setQuestions([...draft.questions, newMcQuestion()])}>+ Izbirno</button>
          <button style={btn()} onClick={() => setQuestions([...draft.questions, newTrueFalseQuestion()])}>+ Drži / ne drži</button>
          <button style={btn()} onClick={() => setQuestions([...draft.questions, newNumericQuestion()])}>+ Številsko</button>
        </div>
      </div>
      {starting && <StartSessionDialog quiz={draft} onClose={() => setStarting(false)} />}
    </div>
  );
}
