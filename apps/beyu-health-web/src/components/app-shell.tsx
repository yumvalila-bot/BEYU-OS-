'use client';
import { Sidebar } from './sidebar';
import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1600px] p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
