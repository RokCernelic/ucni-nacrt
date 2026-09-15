import PresenterView from '@/components/quiz/PresenterView';

export const metadata = { title: 'Predavatelj — Učni načrt' };

export default async function PredavateljPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PresenterView sessionId={id} />;
}
