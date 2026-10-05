'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useViewClasses } from '@/hooks/useViewClasses';
import SeatingChart from '@/components/SeatingChart';
import Countdown from '@/components/Countdown';
import { lessonsFor, canonLabel, schoolLetterFrom } from '@/data/timetable';

const printLinkStyle = { fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: 'var(--r-sm)', padding: '5px 12px', textDecoration: 'none' } as const;

export default function SedezniRedSubjectPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { user, loading } = useAuth();
  const { subjects, loaded } = useSubjects();
  const { classes: master } = useMasterClasses();
  const { activeId } = useViewClasses('sedez', id);

  if (loading || !loaded) return null;

  const subject = subjects.find(s => s.id === id);
  const entry = subject ? getCurriculum(subject.curriculum) : null;
  const activeClass = master.find(m => m.id === activeId) ?? null;
  const context = entry && activeClass ? [entry.predmet.naslov, activeClass.school].filter(Boolean).join(' · ') : entry?.predmet.naslov ?? '';
  const lessons = activeClass
    // Ure drugega, poimenovanega predmeta (npr. tehnika na uri fizike) izpusti iz sedežnega reda —
    // neoznačene ure (u: null) ostanejo, ker jim predmeta (še) nismo znali določiti.
    ? lessonsFor(canonLabel(activeClass.name), `${activeClass.name} ${activeClass.school}`)
        .filter(l => l.u === null || l.u === subject?.curriculum)
    : [];
  const grade = activeClass ? Number((activeClass.name.match(/[6-9]/) ?? [])[0]) : NaN;
  const totalHours = entry && Number.isFinite(grade) ? entry.gradeTargets[grade] : undefined;

  // Tisk celega dneva ima smisel le, če imaš SKUPAJ (ne le v pogledu) več kot en razred iste šole,
  // ki mu po učnem načrtu ta predmet sploh pripada (npr. fizika samo za 8. in 9. razred).
  const activeSchoolLetter = activeClass ? schoolLetterFrom(activeClass.school) : null;
  const sameSchoolCount = activeSchoolLetter && entry
    ? master.filter(c => {
        if (schoolLetterFrom(c.school) !== activeSchoolLetter) return false;
        const grade = Number((c.name.match(/[6-9]/) ?? [])[0]);
        return entry.gradeTargets[grade] !== undefined;
      }).length
    : 0;

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '12px 0 6px' }}>
                Sedežni red{subject?.subtitle ? ` · ${subject.subtitle}` : ''}
              </p>
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>
                {entry ? entry.predmet.naslov : 'Sedežni red'}
              </h1>
            </div>
            <Countdown school={subject?.subtitle} />
          </div>
          {user && sameSchoolCount > 0 && activeSchoolLetter && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sameSchoolCount > 1 && (
                <Link
                  href={`/sedezni-red/${id}/dan?school=${activeSchoolLetter}`}
                  title="Natisni sedežni red za vse razrede te šole, ki imajo danes uro"
                  style={printLinkStyle}
                >
                  🖨 Natisni ves dan ({sameSchoolCount} razredov)
                </Link>
              )}
              <Link
                href={`/sedezni-red/${id}/dan?school=${activeSchoolLetter}&range=week`}
                title="Natisni sedežne rede za vse ure tega predmeta na tej šoli v tem tednu"
                style={printLinkStyle}
              >
                🖨 Natisni ves teden
              </Link>
            </div>
          )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {!user ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za sedežni red se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : !subject || !entry ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>Predmet ne obstaja. <Link href="/" style={{ color: 'var(--forest)' }}>Nazaj</Link></p>
        ) : !activeClass ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Dodaj razred z gumbom <b>+</b> zgoraj (razrede ustvariš v meniju <Link href="/ucenci" style={{ color: 'var(--forest)' }}>Učenci</Link>).
          </p>
        ) : (
          <SeatingChart classId={activeId!} className={activeClass.name} contextLabel={context} lessons={lessons} totalHours={totalHours} />
        )}
      </div>
    </div>
  );
}
