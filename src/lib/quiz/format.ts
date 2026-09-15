/** Slovenska dvojina/množina: plural(n, 'vprašanje', 'vprašanji', 'vprašanja', 'vprašanj'). */
export function plural(n: number, one: string, two: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  if (m === 1) return one;
  if (m === 2) return two;
  if (m === 3 || m === 4) return few;
  return many;
}

export const questionsLabel = (n: number) => `${n} ${plural(n, 'vprašanje', 'vprašanji', 'vprašanja', 'vprašanj')}`;
export const pointsLabel = (n: number) => `${formatNumber(n)} ${Number.isInteger(n) ? plural(n, 'točka', 'točki', 'točke', 'točk') : 'točke'}`;

/** Število s slovensko decimalno vejico, brez odvečnih ničel (9.760000001 → »9,76«). */
export function formatNumber(n: number): string {
  return String(+n.toFixed(10)).replace('.', ',');
}
