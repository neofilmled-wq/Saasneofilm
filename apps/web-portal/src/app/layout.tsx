import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'NeoFilm \u2014 Plateforme d\u2019affichage digital',
  description:
    'NeoFilm connecte annonceurs et partenaires pour diffuser des campagnes publicitaires sur un r\u00e9seau d\u2019\u00e9crans en cin\u00e9mas et h\u00f4tels.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className={`${inter.className} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
