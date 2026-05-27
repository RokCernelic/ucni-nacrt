'use client';

import { useSupabaseSync } from '@/hooks/useSupabaseSync';

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  useSupabaseSync();
  return <>{children}</>;
}
