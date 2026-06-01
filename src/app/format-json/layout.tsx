import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Format JSON Online — DiffForge',
  description:
    'Format, minify, and clean JSON copied from CloudWatch logs or raw files. Handles escaped JSON strings, comments, and log lines locally in your browser.',
  keywords: [
    'format json',
    'json formatter',
    'cloudwatch json formatter',
    'escaped json formatter',
    'json beautifier',
    'json minifier',
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
