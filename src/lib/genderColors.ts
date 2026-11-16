/** Barve učencev po spolu (sedežni red, seznam učencev): vijolična = Ž, zelena = M. */
export function genderStyle(g: string | null | undefined) {
  if (g === 'Ž') return { bg: '#efe7f8', border: '#b79ce0', color: '#5b3a9b' };
  if (g === 'M') return { bg: '#e2f3ee', border: '#82c4b0', color: '#17695a' };
  return { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--ink)' };
}
