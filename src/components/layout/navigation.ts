import { LayoutDashboard, Megaphone, Users } from 'lucide-react';
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
    label: 'Candidatos',
    icon: Users,
    permission: 'client.view',
  },
  {
    href: '/recrutar',
    label: 'Recrutar',
    icon: Megaphone,
    permission: 'invite.view',
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
