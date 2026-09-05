'use client';

import { useState, type ReactNode } from 'react';

import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

/**
 * The application frame: a persistent sidebar on large screens, a dismissible
 * drawer below `lg`. Only this frame is a client component; every page it
 * renders is a server component.
 */
export function AppShell({
  user,
  children,
}: {
  user: { displayName: string; email: string; roles: string[] };
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-raised lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-navy-950/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface-raised">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface-raised/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="btn-secondary px-2.5 py-1.5 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <span aria-hidden>☰</span>
          </button>

          <div className="min-w-0 flex-1" />

          <div className="hidden min-w-0 text-right sm:block">
            <div className="truncate text-sm font-medium text-ink">{user.displayName}</div>
            <div className="truncate text-xs text-ink-subtle">{user.email}</div>
          </div>

          <ThemeToggle />

          <form action="/auth/logout" method="post">
            <button type="submit" className="btn-secondary px-3 py-1.5">
              Sign out
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>

        <footer className="border-t border-border px-4 py-3 text-center text-xs text-ink-subtle sm:px-6 lg:px-8">
          BEYU OS · control plane for BEYU FAMILY TRUST · governance ends at the
          Sector LLC boundary
        </footer>
      </div>
    </div>
  );
}
