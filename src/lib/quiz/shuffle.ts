/**
 * Determinističen vrstni red za učenca (isti vrstni red ob osvežitvi ali menjavi naprave).
 * Elementi z `keepPlace` ostanejo na svojem indeksu, ostali se premešajo med sabo.
 */

function rng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededOrder<T extends { keepPlace?: boolean }>(items: T[], seed: string): T[] {
  const r = rng(seed);
  const movable = items.filter(x => !x.keepPlace);
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [movable[i], movable[j]] = [movable[j], movable[i]];
  }
  let k = 0;
  return items.map(x => (x.keepPlace ? x : movable[k++]));
}
