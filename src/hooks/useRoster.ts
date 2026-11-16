'use client';

import { useState, useEffect, useCallback } from 'react';
import { withPins } from '@/lib/quiz/pins';

export type Gender = 'Ž' | 'M' | '';

export interface Student {
  id: string;
  name: string;
  gender: Gender;
  /** vedno v prvi vrsti (pri tabli) — sedežni red ga premeša samo znotraj prve vrste */
  frontRow?: boolean;
  /** mora vedno sedeti ob fantu (vsaj en vodoravni sosed je fant) */
  nextToBoy?: boolean;
  /** id-ji učencev, ob katerih ne sme sedeti (v isti vrsti vsaj 3 sedeži razmaka, sicer vsaj ena vrsta vmes) */
  apartFrom?: string[];
  /** 4-mestni PIN za prijavo v kviz; dodeli se enkrat in se nikoli ne spremeni */
  pin?: string;
  /** zaporedna številka v razredu (iz dnevnika; ustreza razvrstitvi po priimku), če je podana */
  no?: number;
}

/** Pari učencev, ki ne smeta sedeti skupaj (brez dvojnikov, samo obstoječi učenci). */
export function apartPairs(students: Student[]): [string, string][] {
  const ids = new Set(students.map(s => s.id));
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const s of students)
    for (const o of s.apartFrom ?? []) {
      if (!ids.has(o) || o === s.id) continue;
      const key = [s.id, o].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key); out.push([s.id, o]);
    }
  return out;
}

function normGender(s: string): Gender {
  const g = s.trim().toUpperCase();
  if (g === 'Ž' || g === 'Z') return 'Ž';
  if (g === 'M') return 'M';
  return '';
}

/** Razčleni prilepljeno besedilo: vsaka vrstica = "Ime Priimek, Ž/M" ali "Ime Priimek, Ž/M, 12" (zaporedna številka). */
export function parseRoster(text: string): Student[] {
  return text.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(',').map(p => p.trim());
      let gender: Gender = '';
      let no: number | undefined;
      // z desne: številka in/ali spol (v poljubnem vrstnem redu); ostalo je ime
      while (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^\d{1,3}\.?$/.test(last) && no === undefined) { no = parseInt(last, 10); parts.pop(); continue; }
        if (!gender && normGender(last)) { gender = normGender(last); parts.pop(); continue; }
        if (last === '') { parts.pop(); continue; }
        break;
      }
      const name = parts.join(', ').trim();
      return { id: crypto.randomUUID(), name, gender, ...(no !== undefined ? { no } : {}) };
    })
    .filter(s => s.name.length > 0);
}

/** Pretvori seznam učencev nazaj v besedilo (za urejanje). */
export function rosterToText(students: Student[]): string {
  return students.map(s => [s.name, s.gender || (s.no != null ? '' : null), s.no != null ? String(s.no) : null].filter(x => x !== null).join(', ')).join('\n');
}

export function useRoster(classId?: string) {
  const key = classId ? `ucni-nacrt-roster-${classId}` : undefined;
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (!key) { setStudents([]); return; }
    try { const raw = localStorage.getItem(key); setStudents(raw ? JSON.parse(raw) : []); }
    catch { setStudents([]); }
  }, [key]);

  const save = useCallback((list: Student[]) => {
    // vsak učenec dobi PIN za kvize (obstoječi PIN-i ostanejo nespremenjeni)
    // novi PIN-i se izognejo PIN-u učitelja (skriti udeleženec kvizov)
    let teacherPin: string | null = null;
    try { teacherPin = JSON.parse(localStorage.getItem('ucni-nacrt-teacher-pin') ?? 'null'); } catch { /* ignore */ }
    const next = withPins(list, Math.random, teacherPin ? [teacherPin] : []);
    setStudents(next);
    if (key) {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
    }
  }, [key]);

  return { students, save };
}
