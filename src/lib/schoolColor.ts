/** Barvna družina šole: accent (tabla, črta ob naslovu) + svetel sedež z robom in besedilom istega odtenka. */
export interface SchoolTheme { accent: string; bg: string; border: string; text: string }

const THEMES: SchoolTheme[] = [
  { accent: '#3f7d5c', bg: '#e4f1e9', border: '#8fc2a5', text: '#1f4d37' }, // žajbelj
  { accent: '#c2761b', bg: '#fbeccf', border: '#e8b870', text: '#7a4607' }, // jantar
  { accent: '#7a5cc4', bg: '#ece6f8', border: '#b6a2e3', text: '#46308a' }, // sivka
  { accent: '#1b8aa6', bg: '#dff1f6', border: '#84c4d6', text: '#0e5468' }, // morje
  { accent: '#d4563f', bg: '#fbe4de', border: '#eb9c8c', text: '#8a2c1a' }, // korala
  { accent: '#6f7f2a', bg: '#eef0d6', border: '#b9c36f', text: '#434d12' }, // oljka
];

export const themeForAccent = (accent: string): SchoolTheme => THEMES.find(t => t.accent === accent) ?? THEMES[0];

/** Barva šole v sedežnem redu: le ko ima učitelj razrede z več različnimi šolami (sicer undefined = privzeta). */
export function schoolAccent(school: string | undefined, classes: { school?: string }[]): string | undefined {
  const key = (s?: string) => (s ?? '').trim().toLowerCase();
  const all = [...new Set(classes.map(c => key(c.school)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sl'));
  const k = key(school);
  if (all.length < 2 || !k) return undefined;
  return THEMES[all.indexOf(k) % THEMES.length].accent;
}
