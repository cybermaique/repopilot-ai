import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RepoPilot AI · Evidence workspace',
  description:
    'Explore a synthetic repository with verifiable, revision-pinned evidence. Local Demo provider.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
