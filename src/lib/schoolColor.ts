/** Odtenek sedežev po šoli: 0 = prvotna barva, višje = bolj izrazit/bledejši odtenek (le ko ima učitelj več šol). */
export function schoolShade(school: string | undefined, classes: { school?: string }[]): number | undefined {
  const key = (s?: string) => (s ?? '').trim().toLowerCase();
  const all = [...new Set(classes.map(c => key(c.school)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sl'));
  const k = key(school);
  if (all.length < 2 || !k) return undefined;
  return all.indexOf(k);
}

/** Spremeni odtenek roza/modre barve sedeža glede na šolo (spol ostane prepoznaven). */
export function shadeColors<T extends { bg: string; border: string; color: string }>(gs: T, shade: number | undefined): T {
  if (!shade) return gs;
  const mix = (c: string, w: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, ${w})`;
  switch (shade % 4) {
    case 1: return { ...gs, bg: mix(gs.bg, gs.border, 62), border: mix(gs.border, '#000', 82) };   // izrazitejši
    case 2: return { ...gs, bg: mix(gs.bg, '#fff', 40), border: mix(gs.border, '#fff', 65) };       // bledejši
    case 3: return { ...gs, bg: mix(gs.bg, gs.border, 30), border: mix(gs.border, '#000', 60), color: mix(gs.color, '#000', 80) }; // najtemnejši
    default: return gs;
  }
}
