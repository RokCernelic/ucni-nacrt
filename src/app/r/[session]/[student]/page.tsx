import type { Metadata } from 'next';
import PaperResult from '@/components/quiz/PaperResult';

export const metadata: Metadata = { title: 'Rezultat kviza' };

/** Stran, ki jo učenec odpre s QR kodo na natisnjenem listu: njegov rezultat (ko učitelj kviz zaključi). */
export default async function RezultatPage({ params }: { params: Promise<{ session: string; student: string }> }) {
  const { session, student } = await params;
  return <PaperResult sessionId={session.toLowerCase()} studentId={decodeURIComponent(student).toLowerCase()} />;
}
