'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

function readAllKeys(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('ucni-nacrt-')) {
      try { data[k] = JSON.parse(localStorage.getItem(k)!); }
      catch { data[k] = localStorage.getItem(k); }
    }
  }
  return data;
}

function restoreFromBlob(blob: Record<string, unknown>) {
  for (const [key, value] of Object.entries(blob)) {
    if (key.startsWith('ucni-nacrt-')) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
  // Dispatch StorageEvents so hooks re-read their state
  for (const [key, value] of Object.entries(blob)) {
    if (key.startsWith('ucni-nacrt-')) {
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: JSON.stringify(value),
        storageArea: localStorage,
      }));
    }
  }
}

export function useSupabaseSync() {
  const { user } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  // On login: restore cloud blob → localStorage
  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    isSyncingRef.current = true;

    void (async () => {
      const result = await supabase
        .from('user_data')
        .select('data')
        .eq('user_id', user.id)
        .single();
      if (!result.error && result.data?.data && typeof result.data.data === 'object') {
        restoreFromBlob(result.data.data as Record<string, unknown>);
      }
      isSyncingRef.current = false;
    })();
  }, [user?.id]);

  // On any localStorage change: debounce → upsert blob to Supabase
  useEffect(() => {
    if (!user) return;

    const handleStorage = () => {
      if (isSyncingRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const blob = readAllKeys();
        const supabase = getSupabaseBrowserClient();
        await supabase
          .from('user_data')
          .upsert({ user_id: user.id, data: blob }, { onConflict: 'user_id' });
      }, 1000);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('ucni-nacrt-changed', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('ucni-nacrt-changed', handleStorage);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [user?.id]);
}
