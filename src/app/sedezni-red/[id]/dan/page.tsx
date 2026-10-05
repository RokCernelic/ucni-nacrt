'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import { useMasterClasses, type MasterClass } from '@/hooks/useMasterClasses';
import { useClassDayAssignments } from '@/hooks/useClassDayAssignments';
import { StaticSeatingGrid } from '@/components/SeatingChart';
import { studentsLabel } from '@/lib/quiz/format';
import { lessonsFor, canonLabel, formatLessonDate, schoolLetterFrom, SCHOOL_NAME, type LessonSubject, type Lesson } from '@/data/timetable';

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${m}.`; };
const pagesWord = (n: number) => (n === 1 ? 'stran' : 'strani');
const redWord = (n: number) => { const m = n % 100; return m === 1 ? 'sedežni red' : m === 2 ? 'sedežna reda' : m === 3 || m === 4 ? 'sedežni redi' : 'sedežnih redov'; };

/** En razred: izračuna njegove ure za dani dan in jih izriše (0, 1 ali izjemoma več). */
function ClassDayBlocks({ cls, school, subjectCurriculum, subjectNaslov, targetDate, totalHours }: {
  cls: MasterClass; school: 'B' | 'C'; subjectCurriculum?: string; subjectNaslov: string; targetDate: string; totalHours?: number;
}) {
  const schoolHint = `${cls.name} ${cls.school}`;
  const results = useClassDayAssignments(cls.id, cls.name, schoolHint, targetDate, subjectCurriculum as LessonSubject | undefined);
  const allLessons = lessonsFor(canonLabel(cls.name), schoolHint);

  return (
    <>
      {results.map((r, i) => {
        const idx = allLessons.findIndex(l => l.d === r.lesson.d && l.t === r.lesson.t);
        const metaLine = `${totalHours ? `${idx + 1}/${totalHours}` : `${idx + 1}. ura`} · učilnica ${r.lesson.r} · ${studentsLabel(r.studentById.size)}`;
        return (
          <StaticSeatingGrid
            key={`${cls.id}-${i}`}
            wrapClass="print-seating day-block"
            heading={cls.name}
            contextLabel={`${subjectNaslov} · ${SCHOOL_NAME[school]}`}
            dateISO={r.lesson.d}
            metaLine={metaLine}
            layout={r.layout}
            assign={r.assign}
            studentById={r.studentById}
          />
        );
      })}
    </>
  );
}

export default function SedezniRedDanPage() {
  const params = useParams();
  const search = useSearchParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const schoolParam = (search.get('school') === 'B' || search.get('school') === 'C') ? search.get('school') as 'B' | 'C' : null;
  const { user, loading } = useAuth();
  const { subjects, loaded } = useSubjects();
  const { classes: master } = useMasterClasses();

  if (loading || !loaded) return null;
  if (!user) return <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}><p style={{ color: 'var(--muted)' }}>Za tisk se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p></div>;

  const subject = subjects.find(s => s.id === id);
  const entry = subject ? getCurriculum(subject.curriculum) : null;
  if (!subject || !entry) return <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}><p style={{ color: 'var(--muted)' }}>Predmet ne obstaja. <Link href="/" style={{ color: 'var(--forest)' }}>Nazaj</Link></p></div>;

  // VSI razredi učitelja iz te šole, ki jim po učnem načrtu ta predmet sploh pripada
  // (npr. fizika samo za 8. in 9. razred) — ne le tisti, dodani v pogled na strani sedežnega reda.
  const school = schoolParam ?? (master[0] ? schoolLetterFrom(master[0].school) ?? undefined : undefined);
  const gradeOf = (cls: MasterClass) => Number((cls.name.match(/[6-9]/) ?? [])[0]);
  const classesForSchool = master.filter(c =>
    (!school || schoolLetterFrom(c.school) === school) && entry.gradeTargets[gradeOf(c)] !== undefined
  );
  const today = todayISO();
  const dateParam = search.get('date');
  const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const weekMode = search.get('range') === 'week';

  const matches = (l: Lesson) => l.u === null || l.u === subject.curriculum;
  const lessonsOf = (cls: MasterClass) => lessonsFor(canonLabel(cls.name), `${cls.name} ${cls.school}`).filter(matches);

  // Teden = pon–ned tedna, ki vsebuje ciljni dan; ob sobotah/nedeljah privzeto naslednji teden.
  const dow = (new Date(`${targetDate}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDays(targetDate, dateParam || dow < 5 ? -dow : 7 - dow);
  const candidateDates = weekMode ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [targetDate];

  // Za vsak dan: razredi z uro tisti dan, urejeni po uri začetka.
  const days = candidateDates
    .map(date => ({
      date,
      classes: classesForSchool
        .map(cls => ({ cls, t: lessonsOf(cls).find(l => l.d === date)?.t }))
        .filter((x): x is { cls: MasterClass; t: string } => x.t !== undefined)
        .sort((a, b) => a.t.localeCompare(b.t))
        .map(x => x.cls),
    }))
    .filter(d => d.classes.length > 0);

  const lastCandidate = candidateDates[candidateDates.length - 1];
  const nearestNextDate = days.length === 0
    ? classesForSchool.flatMap(cls => lessonsOf(cls).filter(l => l.d > lastCandidate).map(l => l.d)).sort()[0] ?? null
    : null;

  const gradeTargetFor = (cls: MasterClass) => entry.gradeTargets[gradeOf(cls)];
  const blockCount = days.reduce((n, d) => n + d.classes.length, 0);
  const base = `/sedezni-red/${id}/dan?school=${school}`;
  const linkStyle = { color: 'rgba(255,255,255,0.8)', textDecoration: 'underline' } as const;
  const tabStyle = (active: boolean) => ({
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, textDecoration: 'none',
    padding: '5px 12px', borderRadius: 'var(--r-sm)',
    background: active ? '#fff' : 'transparent', color: active ? 'var(--forest)' : 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.3)',
  });

  return (
    <div>
      <div className="no-print" style={{ background: 'var(--forest)', padding: '24px 32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href={`/sedezni-red/${id}`} style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj na sedežni red</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 300, color: '#fff', lineHeight: 1.1, margin: '10px 0 10px' }}>
            {weekMode ? 'Tisk celega tedna' : 'Tisk celega dneva'}{school ? ` — ${SCHOOL_NAME[school]}` : ''}
          </h1>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <Link href={base} style={tabStyle(!weekMode)}>Dan</Link>
            <Link href={`${base}&range=week`} style={tabStyle(weekMode)}>Teden</Link>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 16px' }}>
            {weekMode ? (
              <>
                <Link href={`${base}&range=week&date=${addDays(weekStart, -7)}`} style={linkStyle}>← prejšnji</Link>
                {' '}· {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))} ·{' '}
                <Link href={`${base}&range=week&date=${addDays(weekStart, 7)}`} style={linkStyle}>naslednji →</Link>
              </>
            ) : (
              <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(targetDate)}</span>
            )}
            {!weekMode && targetDate !== today && (
              <>{' '}· <Link href={base} style={linkStyle}>nazaj na danes</Link></>
            )}
            {blockCount > 0 && <> · {blockCount} {redWord(blockCount)}, {Math.ceil(blockCount / 2)} {pagesWord(Math.ceil(blockCount / 2))}</>}
          </p>
          <button
            onClick={() => window.print()}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, background: '#fff', color: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 18px', cursor: 'pointer' }}
          >
            🖨 Natisni (Ctrl+P)
          </button>
        </div>
      </div>

      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 32px', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)' }}>
        Dva sedežna reda na stran, vsak naslednji par na svoji strani. {weekMode
          ? 'Natisne se sedežni red za vsako uro tega predmeta v tem tednu, po dnevih in urah.'
          : 'Natisne se sedežni red za vsak razred, ki ima danes uro pri tem predmetu.'}
      </div>

      <div className="print-root">
        {classesForSchool.length === 0 ? (
          <p className="no-print" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
            Za to šolo še nimaš dodanih razredov. Dodaš jih v meniju <Link href="/ucenci" style={{ color: 'var(--forest)' }}>Učenci</Link>.
          </p>
        ) : days.length === 0 ? (
          <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px' }}>
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: nearestNextDate ? '12px' : 0 }}>
              {weekMode ? 'Ta teden' : 'Na ta dan'} noben od razredov te šole nima ure pri tem predmetu.
            </p>
            {nearestNextDate && (
              <Link
                href={`${base}${weekMode ? '&range=week' : ''}&date=${nearestNextDate}`}
                style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '9px 18px', textDecoration: 'none' }}
              >
                🖨 {weekMode ? 'Natisni za naslednji teden z urami' : 'Natisni za najbližji naslednji dan'} — <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(nearestNextDate)}</span>
              </Link>
            )}
          </div>
        ) : (
          days.flatMap(({ date, classes }) => classes.map(cls => (
            <ClassDayBlocks
              key={`${date}-${cls.id}`}
              cls={cls}
              school={school!}
              subjectCurriculum={subject.curriculum}
              subjectNaslov={entry.predmet.naslov}
              targetDate={date}
              totalHours={gradeTargetFor(cls)}
            />
          )))
        )}
      </div>
    </div>
  );
}
