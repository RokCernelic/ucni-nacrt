'use client';

import { sanitizeRichHtml } from '@/lib/richText';
import { BLOOM, DIFFICULTY, KINDS, ANSWER_KINDS, type Task } from '@/lib/tasks/types';
import { topicLabel, chapterInfo } from '@/lib/tasks/topics';

export const btn = (primary = false): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: primary ? 600 : 500,
  color: primary ? '#fff' : 'var(--forest)', background: primary ? 'var(--forest)' : 'transparent',
  border: primary ? 'none' : '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
});
export const tinyLabel: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap',
};
export const input: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', background: 'var(--canvas)',
  border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 9px', outline: 'none', boxSizing: 'border-box',
};

/** Izbirni gumb (filter / oznaka). */
export function Chip({ active, color = 'var(--forest)', onClick, title, children, square }: {
  active: boolean; color?: string; onClick?: () => void; title?: string; children: React.ReactNode; square?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, lineHeight: 1, cursor: onClick ? 'pointer' : 'default',
        minWidth: square ? '24px' : undefined, height: '24px', padding: square ? 0 : '0 9px', borderRadius: '4px', whiteSpace: 'nowrap',
        background: active ? color : 'transparent', color: active ? '#fff' : 'var(--muted)', border: `1px solid ${active ? color : 'var(--hairline)'}`,
        transition: 'all 0.15s' }}>
      {children}
    </button>
  );
}

/** Prikaz shranjenega HTML (ob prikazu še enkrat očiščen). */
export function Rich({ html, style, className }: { html: string; style?: React.CSSProperties; className?: string }) {
  return <div className={`rich-content${className ? ` ${className}` : ''}`} style={style} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html).html }} />;
}

const badge = (bg: string, color = '#fff'): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color, background: bg, borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap',
});

export function TaskBadges({ task, showTopics = true, hideTopic, hideChapter }: { task: Task; showTopics?: boolean; hideTopic?: string; hideChapter?: string }) {
  const b = BLOOM.find(x => x.level === task.bloom);
  const d = DIFFICULTY.find(x => x.level === task.difficulty);
  const ak = ANSWER_KINDS.find(x => x.id === task.answer_kind);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
      {task.status === 'draft' && <span style={badge('#fdf6e3', '#8a5a00')} title="Osnutek — še ni pregledana">osnutek</span>}
      {d && <span style={badge(d.color)} title="Težavnost">{d.name}</span>}
      {b && <span style={badge(b.color)} title={`${b.name} — ${b.hint}`}>{b.level} · {b.name}</span>}
      {task.kinds.map(k => <span key={k} style={badge('var(--surface)', 'var(--body)')}>{KINDS.find(x => x.id === k)?.name ?? k}</span>)}
      {ak && <span style={badge('transparent', 'var(--muted)')} title={ak.quiz ? 'Uporabno v kvizu (samodejno ocenjevanje)' : 'Le za učne liste'}>{ak.name}{ak.quiz ? ' · kviz' : ''}</span>}
      {showTopics && task.chapters.filter(c => c !== hideChapter).map(c => { const ci = chapterInfo(c); return <span key={c} style={badge('transparent', 'var(--forest)')} title="Poglavje učnega načrta (brez podpoglavja)">↳ {ci ? `${ci.grade ? `${ci.grade}. r · ` : ''}${ci.label}` : c}</span>; })}
      {showTopics && task.topics.filter(t => t !== hideTopic).map(t => <span key={t} style={badge('transparent', 'var(--forest)')} title="Podpoglavje učnega načrta">↳ {topicLabel(t)}</span>)}
    </div>
  );
}

/** Odgovor naloge v berljivi obliki (za seznam in tisk z rešitvami). */
export function TaskAnswer({ task }: { task: Task }) {
  const opt = task.options?.find(o => o.id === task.correct);
  return (
    <>
      {(task.answer_kind === 'mc' || task.answer_kind === 'tf') && opt && <span>{opt.text}</span>}
      {task.answer_kind === 'numeric' && task.correct && (
        <span>{task.correct}{task.tolerance ? ` ± ${String(task.tolerance).replace('.', ',')}` : ''}{task.unit ? ` ${task.unit}` : ''}</span>
      )}
      {task.answer && <Rich html={task.answer} className="rich-inline" />}
    </>
  );
}
