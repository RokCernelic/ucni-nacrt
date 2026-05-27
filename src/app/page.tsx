import SubjectCard from '@/components/SubjectCard';
import { fizika } from '@/data/fizika';

const allFizikaPodpoglavja = fizika.poglavja.flatMap((p, pi) =>
  p.podpoglavja.map((pp, ppi) => ({ number: `${pi + 1}.${ppi + 1}`, naslov: pp.naslov }))
);

const subjects = [
  {
    href: '/fizika',
    naslov: 'Fizika',
    opis: 'Prenovljeni učni načrt za fiziko — osnovna šola',
    enote: allFizikaPodpoglavja,
    disabled: false,
  },
  {
    href: '/tehnika',
    naslov: 'Tehnika',
    opis: 'Prenovljeni učni načrt za tehniko — osnovna šola',
    enote: [] as { number: string; naslov: string }[],
    disabled: true,
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <div style={{ background: 'var(--forest)', padding: '72px 32px 64px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>
            Osnovna šola · Slovenija
          </p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(48px,6vw,80px)', fontWeight: 300, color: '#fff', lineHeight: 1, marginBottom: '16px', letterSpacing: '-0.01em' }}>
            Učni načrt
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 300, color: 'rgba(255,255,255,0.6)', maxWidth: '480px', lineHeight: 1.65 }}>
            Interaktivni pregled prenovljenega učnega načrta. Navigirajte po poglavjih, enotah, ciljih in standardih. Beležite opravljene enote.
          </p>
        </div>
      </div>

      {/* Subject cards */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 80px' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '20px' }}>
          Predmeti
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {subjects.map((s) => (
            <SubjectCard
              key={s.href}
              href={s.href}
              naslov={s.naslov}
              opis={s.opis}
              enote={s.enote}
              disabled={s.disabled}
            />
          ))}
        </div>
      </div>
    </>
  );
}
