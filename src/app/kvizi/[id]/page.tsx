import QuizEditor from '@/components/quiz/QuizEditor';

export const metadata = { title: 'Urejanje kviza — Učni načrt' };

export default async function KvizEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizEditor quizId={id} />;
}
