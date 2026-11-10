import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SidPrep — Competitive Exam Learning Platform (SSC, RRB, WBPSC, IBPS)',
    template: '%s | SidPrep 2.0',
  },
  description:
    'Focused, lightweight, verified competitive exam preparation platform for SSC CGL, RRB NTPC, WBPSC Clerkship, and IBPS PO. Real exam patterns, daily current affairs, and offline-reliable mocks.',
  metadataBase: new URL('https://sidprep.in'),
  keywords: [
    'SSC CGL preparation',
    'RRB NTPC mock test',
    'WBPSC clerkship syllabus',
    'IBPS PO previous year questions',
    'daily current affairs quiz',
  ],
  authors: [{ name: 'SidPrep Editorial Team' }],
  openGraph: {
    title: 'SidPrep — Competitive Exam Preparation (SSC, RRB, WBPSC, IBPS)',
    description: 'Master government exams with official exam patterns, daily curated news, and verified mock tests.',
    url: 'https://sidprep.in',
    siteName: 'SidPrep',
    locale: 'en_IN',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
