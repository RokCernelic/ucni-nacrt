export interface Standard {
  id: string;
  text: string;
  /** (S) = skupen standard za vse predmete */
  shared?: boolean;
  /** (M) = minimalni standard znanja (v uradnem UN krepko) */
  minimalni?: boolean;
  /** (I) = izbirni standard, ki izhaja iz izbirnih ciljev (v uradnem UN poševno) */
  izbirni?: boolean;
}

export interface Cilj {
  id: string;
  /** O = osnovni, I = izbirni */
  tip: 'O' | 'I';
  text: string;
}

export interface UcnaEnota {
  id: string;
  naslov: string;
  izbirna?: boolean;
}

export interface Podpoglavje {
  id: string;
  naslov: string;
  /** privzeto število ur za podpoglavje (če ni nastavljeno, velja 1) */
  privzeteUre?: number;
  izbirna?: boolean;
  cilji: Cilj[];
  standardi: Standard[];
  noviPojmi?: string[];
  opomba?: string;
  enote?: UcnaEnota[];
}

export interface Poglavje {
  id: string;
  naslov: string;
  razred?: number;
  opis?: string;
  standardi?: Standard[];
  noviPojmi?: string[];
  podpoglavja: Podpoglavje[];
}

export interface Predmet {
  id: string;
  naslov: string;
  opis: string;
  barva: string;
  poglavja: Poglavje[];
}
