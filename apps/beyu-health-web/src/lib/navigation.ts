export interface NavItem { href: string; label: string; live: boolean; roles?: string[]; icon?: string; }
export interface NavSection { title: string; items: NavItem[]; }

export const NAV_SECTIONS: NavSection[] = [
  { title: 'Clinical', items: [
    { href: '/dashboard', label: 'Dashboard', live: true },
    { href: '/patients', label: 'Patients', live: true },
    { href: '/encounters', label: 'Encounters', live: true },
    { href: '/appointments', label: 'Appointments', live: true },
    { href: '/triage', label: 'Triage & Emergency', live: true },
    { href: '/inpatient', label: 'Inpatient / Beds', live: true },
  ]},
  { title: 'Specialized', items: [
    { href: '/ophthalmology', label: 'Ophthalmology', live: true },
    { href: '/pharmacy', label: 'Pharmacy', live: true },
    { href: '/laboratory', label: 'Laboratory', live: true },
    { href: '/radiology', label: 'Radiology & Imaging', live: true },
    { href: '/telemedicine', label: 'Telemedicine', live: true },
    { href: '/ambulance', label: 'Ambulance & Dispatch', live: true },
  ]},
  { title: 'Operations', items: [
    { href: '/billing', label: 'Billing & Claims', live: true },
    { href: '/inventory', label: 'Inventory & Supply', live: true },
    { href: '/workforce', label: 'Workforce', live: true },
    { href: '/documents', label: 'Documents', live: true },
  ]},
  { title: 'Governance', items: [
    { href: '/reports', label: 'Reports & Analytics', live: true },
    { href: '/compliance', label: 'Compliance', live: true },
    { href: '/admin', label: 'Administration', live: true },
    { href: '/noelia', label: 'Noelia AI', live: true },
    { href: '/settings', label: 'Settings', live: true },
  ]},
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);
