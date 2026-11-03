import { Suspense } from 'react';
import QuizStats from '@/components/quiz/QuizStats';

export default function StatistikaPage() {
  return <Suspense fallback={null}><QuizStats /></Suspense>;
}
