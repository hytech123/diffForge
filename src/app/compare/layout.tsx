import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Word, Markdown, JSON & Text Files Online — DiffForge',
  description:
    'Compare two .docx, .md, .txt, or .json files side by side for free. Extract Word document text, normalize JSON, and see precise changes locally in your browser.',
  keywords: [
    'compare word documents online',
    'docx diff tool',
    'compare two documents',
    'word file compare',
    'markdown diff',
    'json diff tool',
    'text file compare',
    'document comparison tool',
    'compare md files',
    'compare json files',
    'online document diff',
  ],
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
