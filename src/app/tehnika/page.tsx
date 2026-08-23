import SubjectClient from '@/components/SubjectClient';
import { tehnika } from '@/data/tehnika';

export const metadata = { title: 'Tehnika in tehnologija — Učni načrt' };

export default function TehnikaPage() {
  return <SubjectClient predmet={tehnika} gradeTargets={{ 6: 70, 7: 70, 8: 35 }} />;
}
