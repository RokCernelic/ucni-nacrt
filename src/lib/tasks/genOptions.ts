/** Možnosti generiranja nove naloge iz obstoječe (okno ✨ Generiraj). Skupine so izključujoče (največ ena izbira na skupino). */
export interface GenOption { id: string; label: string; instruction: string }
export interface GenGroup { id: string; label: string; options: GenOption[] }

export const GEN_GROUPS: GenGroup[] = [
  { id: 'tezavnost', label: 'Težavnost', options: [
    { id: 'tezja', label: 'težja', instruction: 'Nova naloga naj bo TEŽJA od originala (zahtevnejše sklepanje, več korakov ali manj očiten postopek); ustrezno popravi težavnost.' },
    { id: 'lazja', label: 'lažja', instruction: 'Nova naloga naj bo LAŽJA od originala (manj korakov, enostavnejši podatki, več opore v besedilu); ustrezno popravi težavnost.' },
  ] },
  { id: 'bloom', label: 'Taksonomska stopnja', options: [
    { id: 'bloom_gor', label: 'višja stopnja', instruction: 'Nova naloga naj preverja VIŠJO Bloomovo stopnjo (npr. analiza, vrednotenje) kot original, ne le težji račun; ustrezno popravi bloom.' },
    { id: 'bloom_dol', label: 'nižja stopnja', instruction: 'Nova naloga naj preverja NIŽJO Bloomovo stopnjo (pomnjenje, razumevanje) kot original; ustrezno popravi bloom.' },
  ] },
  { id: 'dolzina', label: 'Dolžina', options: [
    { id: 'daljsa', label: 'daljša', instruction: 'Nova naloga naj bo DALJŠA (bogatejši opis situacije, več podatkov, nekaj nepotrebnih podatkov).' },
    { id: 'krajsa', label: 'krajša', instruction: 'Nova naloga naj bo KRAJŠA in bolj jedrnata (brez nepotrebnih podrobnosti).' },
  ] },
  { id: 'podvprasanja', label: 'Podvprašanja', options: [
    { id: 'vec_podvprasanj', label: 'več podvprašanj', instruction: 'Dodaj VEČ podvprašanj (a, b, c …), ki nadgradijo drugo na drugo; rešitev naj zajema vsa.' },
    { id: 'manj_podvprasanj', label: 'manj podvprašanj', instruction: 'Zmanjšaj število podvprašanj (npr. samo eno vprašanje).' },
  ] },
  { id: 'oblika', label: 'Oblika odgovora', options: [
    { id: 'abcd', label: 'ABCD', instruction: 'Spremeni v IZBIRNO nalogo (answer_kind mc) z 4 možnostmi in eno pravilno; napačne možnosti naj bodo verjetne in temeljijo na pogostih napakah učencev (napačna enota, zamenjana formula …).' },
    { id: 'multi', label: 'več možnosti', instruction: 'Spremeni v nalogo z VEČ MOŽNOSTMI (answer_kind multi): 4–6 trditev ali možnosti, pravilnih je lahko več (vsaj ena); podaj correct_indices.' },
    { id: 'tf', label: 'drži / ne drži', instruction: 'Spremeni v nalogo tipa DRŽI / NE DRŽI (answer_kind tf): ena jasna trditev, ki je strokovno nedvoumno pravilna ali napačna.' },
    { id: 'stevilo', label: 'številski odgovor', instruction: 'Spremeni v nalogo s ENIM številskim odgovorom (answer_kind numeric) z enoto; nastavi smiselno toleranco.' },
    { id: 'odprta', label: 'odprta / opisna', instruction: 'Spremeni v ODPRTO nalogo (answer_kind open), kjer učenec odgovor utemelji z lastnimi besedami.' },
  ] },
  { id: 'drugo', label: 'Še', options: [
    { id: 'kontekst', label: 'drug kontekst', instruction: 'Postavi nalogo v POPOLNOMA drug življenjski kontekst (drug predmet, situacija, osebe), a z istim naravoslovnim jedrom.' },
    { id: 'preprost_jezik', label: 'preprostejši jezik', instruction: 'Uporabi kratke, preproste stavke in manj strokovnih izrazov (za učence z učnimi težavami ali tujce), brez zniževanja vsebinske zahtevnosti.' },
    { id: 'odvecni', label: 'odvečni podatki', instruction: 'Dodaj en ali dva ODVEČNA podatka, da mora učenec presoditi, kaj je potrebno.' },
    { id: 'besedilna', label: 'iz računske v besedilno', instruction: 'Naloga naj bo bolj opisna: učenec razloži, napove ali utemelji, računanje je kvečjemu pomožno.' },
  ] },
];

const ALL = GEN_GROUPS.flatMap(g => g.options);
export const genInstruction = (id: string) => ALL.find(o => o.id === id)?.instruction ?? null;
