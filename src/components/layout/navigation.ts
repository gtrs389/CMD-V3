import { LayoutDashboard, Megaphone, UserRound, Users } from 'lucide-react';
import type { SessionUser } from '@/lib/types';
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
    permission: 'client.list',
  },
  {
    href: '/recrutar',
    label: 'Recrutar',
    icon: Megaphone,
    permission: 'client.list',
  },
];

/**
 * Itens visiveis para a sessao atual.
 *
 * O candidato nao tem nenhuma rota global: o menu dele aponta apenas para o
 * proprio cadastro, montado a partir do vinculo da sessao.
 */
export function navItemsFor(
  user: Pick<SessionUser, 'role' | 'candidateId'> | null,
  allowed: (item: NavItem) => boolean,
): NavItem[] {
  if (user?.role === 'CANDIDATE') {
    if (!user.candidateId) return [];
    return [
      {
        href: `/candidatos/${user.candidateId}`,
        label: 'Minha campanha',
        icon: UserRound,
        permission: 'client.view',
      },
    ];
  }

  return NAV_ITEMS.filter(allowed);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
