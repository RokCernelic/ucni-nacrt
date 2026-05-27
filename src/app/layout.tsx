import type { Metadata } from 'next';
import './globals.css';
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
        </SyncProvider>
      </body>
    </html>
  );
}
