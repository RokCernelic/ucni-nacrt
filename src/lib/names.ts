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

/** Pogosta slovenska imena (za ločevanje dveh imen od dvojnega priimka pri okrajšavah). */
const GIVEN = new Set(`aleksander aleksandra aleš alenka alja alja alen alex aljaž aljoša amadej amalija ana anamarija andraž andrej andreja aneja anej anita anja anže anton antonija april arne bernarda barbara bine blaž blanka bojan bor borut boštjan brina bruno cene ciril črt damjan daniel daniela danijel darja david denis dominik doroteja ema emil emilija enej erik eva filip franc frančiška gaja gal gašper gregor hana helena igor ines ines irena iris iva ivan ivana jaka jakob jan jana janez janja jaša jasmina jasna jernej jerneja jure jurij jošt josip jožef jožica julija julijan kaja karin karmen katarina katja klara klemen kristina kristjan lan lana lara larisa lea leon lev lija lili lina lojze lovro lucija luka maja manca marcel marija marjan marjeta mark marko martin martina maruša matej mateja matevž matic matija matjaž mia miha mihael mihaela mija mila milan miljana mitja monika nace naja nal nastja natalija neja nejc neža nik nika nina noa oskar pavel peter petra pia polona primož rebeka rene rok roman rosana saša sara sebastjan simon simona sonja stanislav suzana svit špela štefan tadej taja tajda tamara tanja teja tilen tim tina tine tinkara tit tjaša tomaž tone urban urh urša valentina vanja vasja vesna vid vida viktor vita vito vlasta zala zarja zoja zoran žan žana žiga živa`.split(/\s+/));

const abbrPart = (words: string[]) => {
  const parts = words.flatMap(w => w.split('-')).filter(Boolean);
  if (parts.length > 1) return `${parts.map(p => p[0].toLocaleUpperCase('sl')).join('')}.`;
  const p = parts[0] ?? '';
  return p ? `${p[0].toLocaleUpperCase('sl')}${p.slice(1, 2).toLocaleLowerCase('sl')}.` : '';
};

/**
 * Okrajšano ime za zakritje identitete (npr. tisk rezultatov): »Iva Novak« → »Iv. No.«, »Janez Lojze Novak« → »JL. No.«,
 * »Ana Novak Kos« → »An. NK.«. Pri treh ali več besedah se kot dodatna imena štejejo le pogosta slovenska imena.
 */
export function initialsName(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length <= 1) return abbrPart(w);
  let g = 1;
  while (g < w.length - 1 && GIVEN.has(w[g].toLocaleLowerCase('sl'))) g++;
  return `${abbrPart(w.slice(0, g))} ${abbrPart(w.slice(g))}`;
}
