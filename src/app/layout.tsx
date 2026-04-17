import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'DiffForge — Free Diff & Patch Visualizer Online',
  description:
    'Free online tool to visualize .diff and .patch files as beautiful, interactive HTML. Drag-and-drop or paste your git diff — no signup, no upload, 100% client-side.',
  keywords: [
    'diff viewer',
    'patch viewer',
    'diff to html',
    'git diff visualizer',
    'free diff viewer online',
    'patch file viewer',
    'code diff',
    'code review tool',
    'diff2html',
    'diffforge',
    'visualize changes',
    'side by side diff',
    'unified diff viewer',
  ],
  authors: [{ name: 'DiffForge' }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: 'website',
    title: 'DiffForge — Free Diff & Patch Visualizer',
    description:
      'Visualize your .diff and .patch files instantly. Beautiful dark-themed HTML output — free, private, no signup required.',
    siteName: 'DiffForge',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DiffForge — Free Diff & Patch Visualizer',
    description:
      'Visualize your .diff and .patch files instantly. Beautiful dark-themed HTML output — free, private, no signup.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
