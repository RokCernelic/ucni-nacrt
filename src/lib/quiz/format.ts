/** Slovenska dvojina/množina: plural(n, 'vprašanje', 'vprašanji', 'vprašanja', 'vprašanj'). */
export function plural(n: number, one: string, two: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  if (m === 1) return one;
  if (m === 2) return two;
  if (m === 3 || m === 4) return few;
  return many;
}

export const questionsLabel = (n: number) => `${n} ${plural(n, 'vprašanje', 'vprašanji', 'vprašanja', 'vprašanj')}`;
export const studentsLabel = (n: number) => `${n} ${plural(n, 'učenec', 'učenca', 'učenci', 'učencev')}`;
/** »nima / nimata / nimajo / nima« — glagol v skladu s številom */
export const hasNotVerb = (n: number) => plural(n, 'nima', 'nimata', 'nimajo', 'nima');
export const pointsLabel = (n: number) => `${formatNumber(n)} ${Number.isInteger(n) ? plural(n, 'točka', 'točki', 'točke', 'točk') : 'točke'}`;

/** Število s slovensko decimalno vejico, brez odvečnih ničel (9.760000001 → »9,76«). */
export function formatNumber(n: number): string {
  return String(+n.toFixed(10)).replace('.', ',');
}

/** Odstotek, zaokrožen navzgor na celo število (70,1 → 71). Toleranca odpravi napake plavajoče vejice (7/10·100 = 70,000…01). */
export function ceilPct(x: number): number {
  return Math.max(0, Math.ceil(x - 1e-9));
}

/**
 * Barva odstotka po ocenjevalnih mejah: 90–100 odl (5) zelena, 78–89 pd (4) rumenozelena,
 * 64–77 db (3) rumena, 45–63 zd (2) oranžna, pod 45 nzd (1) rdeča.
 */
export function gradeColor(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return 'var(--muted)';
  if (p >= 90) return '#2e8b3e';
  if (p >= 78) return '#7aa82a';
  if (p >= 64) return '#cf9e00';
  if (p >= 45) return '#e06a1b';
  return '#c0392b';
}

/** Ocena po istih mejah (1–5). */
export function gradeOf(p: number): number {
  return p >= 90 ? 5 : p >= 78 ? 4 : p >= 64 ? 3 : p >= 45 ? 2 : 1;
}
