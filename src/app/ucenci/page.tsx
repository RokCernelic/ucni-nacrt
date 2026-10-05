'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMasterClasses } from '@/hooks/useMasterClasses';

/** /ucenci → prvi razred (ali obrazec za nov razred, če jih še ni). */
export default function UcenciIndex() {
  const router = useRouter();
  const { classes, loaded } = useMasterClasses();
  useEffect(() => {
    if (loaded) router.replace(`/ucenci/${classes[0]?.id ?? 'nov'}`);
  }, [loaded, classes, router]);
  return null;
}
