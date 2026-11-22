import type { Metadata } from 'next';
import './globals.css';
import GlobalPrintBar from '@/components/tasks/GlobalPrintBar';
import UndoToast from '@/components/UndoToast';
import CalendarSync from '@/components/CalendarSync';
import ImageZoom from '@/components/ImageZoom';
import Nav from '@/components/Nav';
import SyncProvider from '@/components/SyncProvider';

export const metadata: Metadata = {
  title: 'Učni načrt',
  description: 'Interaktivni učni načrt za osnovno šolo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sl">
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <SyncProvider>
          <Nav />
          {children}
          <GlobalPrintBar />
          <UndoToast />
          <CalendarSync />
          <ImageZoom />
        </SyncProvider>
      </body>
    </html>
  );
}
