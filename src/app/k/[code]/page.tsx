import StudentQuiz from '@/components/quiz/StudentQuiz';

export const metadata = { title: 'Kviz' };

export default async function KvizStudentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StudentQuiz code={code} />;
}
