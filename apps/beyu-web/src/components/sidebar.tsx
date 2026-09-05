'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BrandLockup } from './brand';
import { NAV_SECTIONS } from '@/lib/navigation';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Link href="/dashboard" className="rounded-lg px-1 py-1" onClick={onNavigate}>
        <BrandLockup />
      </Link>

      <div className="flex flex-col gap-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              {section.title}
            </h2>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        active
                          ? 'bg-accent/15 font-medium text-accent'
                          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                      }`}
                    >
                      <span>{item.label}</span>
                      {/* Marks routes with no backing implementation, so the
                          navigation itself never overstates the product. */}
                      {!item.live ? (
                        <span
                          title="Screen not built"
                          className="rounded border border-border px-1 text-[10px] uppercase tracking-wide text-ink-subtle"
                        >
                          soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
