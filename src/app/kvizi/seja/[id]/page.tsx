import LiveSession from '@/components/quiz/LiveSession';

export const metadata = { title: 'Seja kviza — Učni načrt' };

export default async function KvizSejaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveSession sessionId={id} />;
}
