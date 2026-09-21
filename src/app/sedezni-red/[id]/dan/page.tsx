'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import { useMasterClasses, type MasterClass } from '@/hooks/useMasterClasses';
import { useClassDayAssignments } from '@/hooks/useClassDayAssignments';
import { StaticSeatingGrid } from '@/components/SeatingChart';
import { lessonsFor, canonLabel, formatLessonDate, schoolLetterFrom, SCHOOL_NAME, type LessonSubject } from '@/data/timetable';

const todayISO = () => new Date().toISOString().slice(0, 10);

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
        const metaLine = `${totalHours ? `${idx + 1}/${totalHours}` : `${idx + 1}. ura`} · učilnica ${r.lesson.r}`;
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

  const matchingLessonDates = (date: string) => classesForSchool.some(cls =>
    lessonsFor(canonLabel(cls.name), `${cls.name} ${cls.school}`)
      .some(l => l.d === date && (l.u === null || l.u === subject.curriculum)));
  const anyLessonToday = matchingLessonDates(targetDate);

  // Ni ur na ciljni dan (npr. sredo, ko ta šola nima pouka) — poišči najbližji naslednji dan z uro.
  const nearestNextDate = !anyLessonToday
    ? classesForSchool
        .flatMap(cls => lessonsFor(canonLabel(cls.name), `${cls.name} ${cls.school}`)
          .filter(l => l.d > targetDate && (l.u === null || l.u === subject.curriculum))
          .map(l => l.d))
        .sort()[0] ?? null
    : null;

  const gradeTargetFor = (cls: MasterClass) => entry.gradeTargets[gradeOf(cls)];

  return (
    <div>
      <div className="no-print" style={{ background: 'var(--forest)', padding: '24px 32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href={`/sedezni-red/${id}`} style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj na sedežni red</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 300, color: '#fff', lineHeight: 1.1, margin: '10px 0 4px' }}>
            Tisk celega dneva{school ? ` — ${SCHOOL_NAME[school]}` : ''}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 16px', textTransform: 'capitalize' }}>
            {formatLessonDate(targetDate)}
            {targetDate !== today && (
              <>
                {' '}· <Link href={`/sedezni-red/${id}/dan?school=${school}`} style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'underline' }}>nazaj na danes</Link>
              </>
            )}
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
        Dva razreda na stran, vsak naslednji par na svoji strani. Natisne se sedežni red za vsak razred, ki ima danes uro pri tem predmetu.
      </div>

      <div className="print-root">
        {classesForSchool.length === 0 ? (
          <p className="no-print" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
            Za to šolo še nimaš dodanih razredov. Dodaš jih v <Link href="/nastavitve" style={{ color: 'var(--forest)' }}>Nastavitve → Razredi</Link>.
          </p>
        ) : !anyLessonToday ? (
          <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px' }}>
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: nearestNextDate ? '12px' : 0 }}>
              Na ta dan noben od razredov te šole nima ure pri tem predmetu.
            </p>
            {nearestNextDate && (
              <Link
                href={`/sedezni-red/${id}/dan?school=${school}&date=${nearestNextDate}`}
                style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '9px 18px', textDecoration: 'none' }}
              >
                🖨 Natisni za najbližji naslednji dan — <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(nearestNextDate)}</span>
              </Link>
            )}
          </div>
        ) : (
          classesForSchool.map(cls => (
            <ClassDayBlocks
              key={cls.id}
              cls={cls}
              school={school!}
              subjectCurriculum={subject.curriculum}
              subjectNaslov={entry.predmet.naslov}
              targetDate={targetDate}
              totalHours={gradeTargetFor(cls)}
            />
          ))
        )}
      </div>
    </div>
  );
}
