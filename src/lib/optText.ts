/**
 * Besedilo možnosti je navadno besedilo; dovoljene so le oznake za oblikovanje <u>, <b>, <i>, <strong>, <em>, <sub>, <sup>
 * (npr. podčrtana beseda v možnosti). Vse ostalo se prikaže kot besedilo.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const optHtml = (text: string) => esc(text).replace(/&lt;(\/?)(u|b|i|strong|em|sub|sup)&gt;/gi, '<$1$2>');
/** Besedilo možnosti brez oznak (za dolžino, iskanje, izvoz). */
export const optPlain = (text: string) => text.replace(/<\/?(u|b|i|strong|em|sub|sup)>/gi, '');
