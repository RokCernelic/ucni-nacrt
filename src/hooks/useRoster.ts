'use client';

import { useState, useEffect, useCallback } from 'react';

export type Gender = 'Ž' | 'M' | '';

export interface Student {
  id: string;
  name: string;
  gender: Gender;
}

function normGender(s: string): Gender {
  const g = s.trim().toUpperCase();
  if (g === 'Ž' || g === 'Z') return 'Ž';
  if (g === 'M') return 'M';
  return '';
}

/** Razčleni prilepljeno besedilo: vsaka vrstica = "Ime Priimek, Ž/M". */
export function parseRoster(text: string): Student[] {
  return text.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const ci = line.lastIndexOf(',');
      let name = line, gender: Gender = '';
      if (ci >= 0) {
        name = line.slice(0, ci).trim();
        gender = normGender(line.slice(ci + 1));
      }
      return { id: crypto.randomUUID(), name, gender };
    })
    .filter(s => s.name.length > 0);
}

/** Pretvori seznam učencev nazaj v besedilo (za urejanje). */
export function rosterToText(students: Student[]): string {
  return students.map(s => s.gender ? `${s.name}, ${s.gender}` : s.name).join('\n');
}

export function useRoster(classId?: string) {
  const key = classId ? `ucni-nacrt-roster-${classId}` : undefined;
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (!key) { setStudents([]); return; }
    try { const raw = localStorage.getItem(key); setStudents(raw ? JSON.parse(raw) : []); }
    catch { setStudents([]); }
  }, [key]);

  const save = useCallback((next: Student[]) => {
    setStudents(next);
    if (key) {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
    }
  }, [key]);

  return { students, save };
}
