'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ucni-nacrt-events';

export type EventType = 'Pisno ocenjevanje' | 'Preverjanje' | 'Ustno ocenjevanje' | 'Utrjevanje';

export interface PlacedEvent {
  id: string;
  type: EventType;
  enotaKey: string;
  slot: number; // 0 = before cilj[0], n = after cilj[n-1]
  checked: boolean;
}

function load(): PlacedEvent[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export function useEvents() {
  const [events, setEvents] = useState<PlacedEvent[]>([]);
  useEffect(() => { setEvents(load()); }, []);

  const addEvent = useCallback((type: EventType, enotaKey: string, slot: number) => {
    setEvents(prev => {
      const next = [...prev, { id: crypto.randomUUID(), type, enotaKey, slot, checked: false }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleEvent = useCallback((id: string) => {
    setEvents(prev => {
      const next = prev.map(e => e.id === id ? { ...e, checked: !e.checked } : e);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeEvent = useCallback((id: string) => {
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const moveEvent = useCallback((id: string, newEnotaKey: string, newSlot: number) => {
    setEvents(prev => {
      const event = prev.find(e => e.id === id);
      if (!event) return prev;
      const next = [...prev.filter(e => e.id !== id), { ...event, enotaKey: newEnotaKey, slot: newSlot }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { events, addEvent, toggleEvent, removeEvent, moveEvent };
}
