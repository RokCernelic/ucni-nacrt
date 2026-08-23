'use client';

import SubjectClient from '@/components/SubjectClient';
import { fizika } from '@/data/fizika';

export default function FizikaClient() {
  return <SubjectClient predmet={fizika} gradeTargets={{ 8: 70, 9: 64 }} />;
}
