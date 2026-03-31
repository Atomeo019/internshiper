import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://internshipper.vercel.app'
  ),
  title: 'Internshipper — Brutally Honest Resume Analysis',
  description:
    'Find out exactly why your resume gets filtered out. Internshipper scores your resume against top-25% competitive tech internship standards — ATS first, then recruiter lens. No sugarcoating.',
  openGraph: {
    title: 'Internshipper — Brutally Honest Resume Analysis',
    description:
      'Find out exactly why your resume gets filtered out. Scored against top-25% competitive tech internship standards.',
    url: 'https://internshipper.vercel.app',
    siteName: 'Internshipper',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Internshipper — Brutally Honest Resume Analysis',
    description:
      'Find out exactly why your resume gets filtered out. ATS filter first. Then recruiter lens. No sugarcoating.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
