/**
 * Brskalnik ob »Shrani kot PDF« predlaga ime datoteke iz document.title.
 * Med tiskom ga nastavimo na »YYYY MM DD Ime«, po tisku vrnemo prejšnjega.
 * Vrne funkcijo za povrnitev.
 */
export function setPrintTitle(name: string): () => void {
  const prev = document.title;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const clean = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  document.title = `${d.getFullYear()} ${p(d.getMonth() + 1)} ${p(d.getDate())}${clean ? ' ' + clean : ''}`;
  return () => { document.title = prev; };
}
