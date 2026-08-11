import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BEYU OS', template: '%s · BEYU OS' },
  description:
    'Organizational, governance, strategic, capital-allocation, risk and compliance control plane for BEYU FAMILY TRUST.',
  robots: { index: false, follow: false },
};

/**
 * Applied before first paint so the correct theme is present in the very
 * first frame. Reading the preference in an effect instead would render the
 * light theme and then repaint dark on every single navigation.
 */
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-surface font-sans text-ink">{children}</body>
    </html>
  );
}
