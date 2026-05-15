import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Učni načrt',
  description: 'Interaktivni učni načrt za osnovno šolo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sl">
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </body>
    </html>
  );
}
