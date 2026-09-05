/**
 * The route map.
 *
 * `live` marks routes backed by real endpoints. The rest render an explicit
 * "not built" screen, and the sidebar labels them so nobody clicks expecting
 * a working feature. Honesty in the navigation is cheaper than honesty in a
 * status document nobody reads.
 */

export interface NavItem {
  href: string;
  label: string;
  live: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', live: true }],
  },
  {
    title: 'Structure',
    items: [
      { href: '/organization', label: 'Organization', live: true },
      { href: '/ownership', label: 'Ownership', live: false },
      { href: '/governance', label: 'Governance', live: false },
      { href: '/countries', label: 'Countries', live: false },
      { href: '/sectors', label: 'Sectors', live: false },
      { href: '/tenants', label: 'Tenants', live: false },
    ],
  },
  {
    title: 'Direction',
    items: [
      { href: '/strategy', label: 'Strategy', live: false },
      { href: '/capital', label: 'Capital', live: false },
      { href: '/waterfall', label: 'Waterfall', live: false },
    ],
  },
  {
    title: 'Control',
    items: [
      { href: '/risks', label: 'Risks', live: false },
      { href: '/compliance', label: 'Compliance', live: false },
      { href: '/audit', label: 'Audit', live: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/documents', label: 'Documents', live: false },
      { href: '/workflows', label: 'Workflows', live: false },
      { href: '/reports', label: 'Reports', live: false },
      { href: '/notifications', label: 'Notifications', live: false },
    ],
  },
  {
    title: 'Intelligence & Federation',
    items: [
      { href: '/noelia', label: 'Noelia', live: false },
      { href: '/integrations', label: 'Integrations', live: true },
      { href: '/settings', label: 'Settings', live: true },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);
