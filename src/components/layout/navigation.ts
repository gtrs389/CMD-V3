import { LayoutDashboard, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

/** Itens do menu administrativo, filtrados pela camada de permissoes. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Visão geral',
    icon: LayoutDashboard,
    permission: 'dashboard.view',
  },
  {
    href: '/clientes',
    label: 'Clientes',
    icon: Users,
    permission: 'client.view',
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
