import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Word Documents Online — DiffForge',
  description:
    'Compare two .docx or .md files side-by-side for free. Instantly see what changed between document versions. No signup, 100% client-side & private.',
  keywords: [
    'compare word documents online',
    'docx diff tool',
    'compare two documents',
    'word file compare',
    'markdown diff',
    'document comparison tool',
    'compare md files',
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
