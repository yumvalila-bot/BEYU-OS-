'use client';

import { useEffect, useState } from 'react';

/**
 * Light/dark switch.
 *
 * The class is applied by an inline script in the document head before paint
 * (see layout.tsx), so this component only has to keep the stored preference
 * and the current class in step. Doing it here alone would flash the wrong
 * theme on every navigation.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem('beyu-theme', next ? 'dark' : 'light');
    } catch {
      // A blocked storage API is not a reason to refuse the toggle; the
      // preference simply will not survive a reload.
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-secondary px-2.5 py-1.5"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span aria-hidden className="text-base leading-none">
        {dark === null ? '◐' : dark ? '☀' : '☾'}
      </span>
    </button>
  );
}
