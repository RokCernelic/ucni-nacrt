import QuizHistory from '@/components/quiz/QuizHistory';

export const metadata = { title: 'Zgodovina kviza — Učni načrt' };

export default async function KvizZgodovinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizHistory quizId={id} />;
}
