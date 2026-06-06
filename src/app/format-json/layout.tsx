import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Format JSON Online, Tree Viewer & Analyzer — DiffForge',
  description:
    'Format, minify, clean, and analyze JSON online. Decode escaped JSON strings, extract JSON from logs, inspect collapsible trees, view line numbers, and detect full clickable links locally in your browser.',
  keywords: [
    'format json',
    'json formatter',
    'json tree viewer',
    'json analyzer',
    'json link extractor',
    'cloudwatch json formatter',
    'escaped json formatter',
    'json beautifier',
    'json minifier',
    'json line numbers',
    'collapsible json viewer',
    'Format json online',
    'json format from cloudwatch',
    'json format from escaped string',
    'online json tool',
  ],
};

export default function FormatJsonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
