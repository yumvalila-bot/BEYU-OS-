'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS } from '@/lib/navigation';
import { Brand } from './brand';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-surface-raised">
      <Brand />
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map(section => (
          <div key={section.title} className="mb-6">
            <h4 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">{section.title}</h4>
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${active ? 'bg-navy-900 text-white dark:bg-surface-sunken dark:text-white' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'} ${!item.live ? 'opacity-50' : ''}`}>
                      <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                      {item.label}
                      {!item.live && <span className="ml-auto text-[10px]">Soon</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3 text-[11px] text-ink-subtle">
        <div className="font-medium text-ink-muted">BEYU FAMILY TRUST</div>
        <div>HOLDING - TZ - HEALTH LLC - HEALTH OS</div>
        <div className="mt-1 text-accent">Noelia / HIVE governed</div>
      </div>
    </aside>
  );
}
