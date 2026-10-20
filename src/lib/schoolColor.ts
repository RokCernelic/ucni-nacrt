/** Odtenek sedežev po šoli: 0 = prvotna barva, višje = bolj izrazit/bledejši odtenek (le ko ima učitelj več šol). */
export function schoolShade(school: string | undefined, classes: { school?: string }[]): number | undefined {
  const key = (s?: string) => (s ?? '').trim().toLowerCase();
  const all = [...new Set(classes.map(c => key(c.school)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sl'));
  const k = key(school);
  if (all.length < 2 || !k) return undefined;
  return all.indexOf(k);
}

type Col = { bg: string; border: string; color: string };
/** Vsaka šola ima svoj par barv (Ž, M), da se šole jasno razlikujejo; indeks 0 = privzeta barva. */
const PAIRS: { Z: Col; M: Col }[] = [
  { Z: { bg: '#efe7f8', border: '#b79ce0', color: '#5b3a9b' }, M: { bg: '#e2f3ee', border: '#82c4b0', color: '#17695a' } }, // vijolična / zelena
  { Z: { bg: '#fde8d6', border: '#f0a469', color: '#9a4a0e' }, M: { bg: '#dfeafa', border: '#86b0e6', color: '#1f4f8a' } }, // oranžna / modra
  { Z: { bg: '#fbe7ef', border: '#e589ac', color: '#a61e4d' }, M: { bg: '#f3f0cd', border: '#cfc255', color: '#675d08' } }, // roza / rumena
  { Z: { bg: '#e0f3f6', border: '#78c3d1', color: '#0e5d6d' }, M: { bg: '#f6e3e1', border: '#df9a93', color: '#8c2d24' } }, // turkizna / korala
];

/** Barve sedeža po spolu in šoli; brez `shade` (ena šola) velja prva družina. */
export function seatColors(gender: string, shade: number | undefined): Col | undefined {
  if (gender !== 'Ž' && gender !== 'M') return undefined;
  const p = PAIRS[(shade ?? 0) % PAIRS.length];
  return gender === 'Ž' ? p.Z : p.M;
}
