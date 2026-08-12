import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BEYU HEALTH OS', template: '%s · BEYU HEALTH OS' },
  description: 'BEYU HEALTH OS — Complete healthcare operating system with EHR, ophthalmology, pharmacy, lab, radiology, billing, telemedicine, ambulance, AI.',
  robots: { index: false, follow: false },
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('beyu-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored === null && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen bg-surface font-sans text-ink">{children}</body>
    </html>
  );
}
