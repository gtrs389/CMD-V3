import { LayoutDashboard, Users, Vote } from 'lucide-react';
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
    href: '/candidatos',
    label: 'Times',
    icon: Users,
    permission: 'client.list',
  },
  {
    href: '/apuracao',
    label: 'Sala de Apuração',
    icon: Vote,
    permission: 'map.view',
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
