/**
 * Razvrščanje učencev po priimku (imena so zapisana kot »Ime Priimek«;
 * vse za prvo besedo šteje za priimek, npr. »Lucija Vršič Družkovič« → »Vršič Družkovič«).
 */
export function lastName(name: string): string {
  const w = name.trim().split(/\s+/);
  return w.length > 1 ? w.slice(1).join(' ') : w[0] ?? '';
}

export function compareByLastName(a: string, b: string): number {
  return lastName(a).localeCompare(lastName(b), 'sl', { sensitivity: 'base' }) || a.localeCompare(b, 'sl');
}

/** Nova tabela, razvrščena po priimku (izvirnik ostane nespremenjen). */
export function sortByLastName<T extends { name: string }>(list: readonly T[]): T[] {
  return [...list].sort((x, y) => compareByLastName(x.name, y.name));
}
