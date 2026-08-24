import HomeSubjects from '@/components/HomeSubjects';

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

      {/* Moji predmeti */}
      <HomeSubjects />
    </>
  );
}
