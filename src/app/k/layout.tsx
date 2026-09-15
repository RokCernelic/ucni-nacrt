import type { Metadata, Viewport } from 'next';

// Naprave učencev (iPadi): brez povečave/pomanjšave s prsti in prekrivanje roba
// zaslona (viewportFit: cover) — skupaj z useAutoFullscreen (celozaslonski API ob
// prvem dotiku) daje čim bolj "kiosk" videz. Če stran kdo doda na domači zaslon,
// appleWebApp jo zažene brez Safarijeve vrstice naslovov.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a2e0e',
};

export const metadata: Metadata = {
  title: 'Kviz',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Kviz' },
  // Next tu izriše le sodobno "mobile-web-app-capable"; starejši iPadOS (pred v17)
  // za celozaslonski zagon z domačega zaslona še vedno preverja Applov predpono.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export default function KvizNapraveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
