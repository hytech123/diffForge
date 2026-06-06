import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JSON Diff Online — Semantic & Text Comparison — DiffForge',
  description:
    'Compare two JSON files or pasted JSON online for free. Semantic tree diff highlights added, removed, and modified paths. Switch to line-by-line or side-by-side text diff. 100% client-side.',
  keywords: [
    'json diff',
    'compare json online',
    'json diff tool',
    'structural json diff',
    'json compare',
    'diff json files',
    'json difference viewer',
    'semantic json diff',
  ],
};

export default function JsonDiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
