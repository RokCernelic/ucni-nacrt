/**
 * Uradni šolski koledar za osnovne šole (vir: https://www.gov.si/teme/solski-koledar-za-osnovne-sole/).
 * Navedeni so le dnevi brez pouka, ki padejo na delovne dni (vikendi ne vplivajo na ure).
 * Zimske počitnice: posavska regija (OŠ Brežice, OŠ Cerklje ob Krki).
 */

export interface CalendarEvent {
  label: string;
  /** YYYY-MM-DD */
  from: string;
  to: string;
  kind: 'pocitnice' | 'praznik' | 'prost';
}

export interface SchoolCalendar {
  start: string;
  /** zadnji dan pouka za 1.–8. razred */
  end: string;
  /** zadnji dan pouka za 9. razred */
  end9: string;
  events: CalendarEvent[];
}

export const SCHOOL_CALENDARS: Record<number, SchoolCalendar> = {
  // ključ = leto začetka šolskega leta
  2026: {
    start: '2026-09-01', end: '2027-06-24', end9: '2027-06-15',
    events: [
      { label: 'Jesenske počitnice', from: '2026-10-26', to: '2026-10-30', kind: 'pocitnice' },
      { label: 'Novoletne počitnice', from: '2026-12-25', to: '2027-01-02', kind: 'pocitnice' },
      { label: 'Prešernov dan', from: '2027-02-08', to: '2027-02-08', kind: 'praznik' },
      { label: 'Zimske počitnice', from: '2027-02-15', to: '2027-02-19', kind: 'pocitnice' },
      { label: 'Velikonočni ponedeljek', from: '2027-03-29', to: '2027-03-29', kind: 'praznik' },
      { label: 'Pouka prost dan', from: '2027-04-26', to: '2027-04-26', kind: 'prost' },
      { label: 'Prvomajske počitnice', from: '2027-04-27', to: '2027-04-30', kind: 'pocitnice' },
    ],
  },
  2025: {
    start: '2025-09-01', end: '2026-06-24', end9: '2026-06-15',
    events: [
      { label: 'Jesenske počitnice', from: '2025-10-27', to: '2025-10-31', kind: 'pocitnice' },
      { label: 'Novoletne počitnice', from: '2025-12-25', to: '2026-01-02', kind: 'pocitnice' },
      { label: 'Zimske počitnice', from: '2026-02-23', to: '2026-02-27', kind: 'pocitnice' },
      { label: 'Velikonočni ponedeljek', from: '2026-04-06', to: '2026-04-06', kind: 'praznik' },
      { label: 'Prvomajske počitnice', from: '2026-04-27', to: '2026-05-01', kind: 'pocitnice' },
    ],
  },
};
