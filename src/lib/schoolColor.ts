const PALETTE = ['#1f5c3a', '#8a3b12', '#4b3b8f', '#0f5f7a', '#8f2d56', '#6b5a12'];

/** Barva šole v sedežnem redu: le ko ima učitelj razrede z več različnimi šolami (sicer undefined = privzeta). */
export function schoolAccent(school: string | undefined, classes: { school?: string }[]): string | undefined {
  const key = (s?: string) => (s ?? '').trim().toLowerCase();
  const all = [...new Set(classes.map(c => key(c.school)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sl'));
  const k = key(school);
  if (all.length < 2 || !k) return undefined;
  return PALETTE[all.indexOf(k) % PALETTE.length];
}
