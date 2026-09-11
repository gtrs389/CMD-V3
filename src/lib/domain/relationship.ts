import { createElement, type ReactElement } from 'react';
import { Handshake, Heart, HeartHandshake, Home, Smile, Star, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FieldOption } from '@/lib/types';

/**
 * Catalogo de icones e cores do campo "Vinculo".
 *
 * O ADMIN escolhe entre estas opcoes; nada vem de servico externo. O
 * identificador de cada opcao e estavel, entao renomear nao quebra cadastro
 * ja salvo.
 */

export const RELATIONSHIP_ICONS = [
  'heart',
  'smile',
  'handshake',
  'star',
  'home',
  'people',
  'care',
] as const;
export type RelationshipIcon = (typeof RELATIONSHIP_ICONS)[number];

const ICON_COMPONENTS: Record<RelationshipIcon, LucideIcon> = {
  heart: Heart,
  smile: Smile,
  handshake: Handshake,
  star: Star,
  home: Home,
  people: UsersRound,
  care: HeartHandshake,
};

export const RELATIONSHIP_ICON_LABELS: Record<RelationshipIcon, string> = {
  heart: 'Coração',
  smile: 'Sorriso',
  handshake: 'Aperto de mãos',
  star: 'Estrela',
  home: 'Casa',
  people: 'Pessoas',
  care: 'Cuidado',
};

export const RELATIONSHIP_COLORS = [
  'rose',
  'green',
  'orange',
  'blue',
  'violet',
  'amber',
] as const;
export type RelationshipColor = (typeof RELATIONSHIP_COLORS)[number];

export const RELATIONSHIP_COLOR_LABELS: Record<RelationshipColor, string> = {
  rose: 'Rosa',
  green: 'Verde',
  orange: 'Laranja',
  blue: 'Azul',
  violet: 'Roxo',
  amber: 'Âmbar',
};

/** Classes do circulo do icone, uma por cor do catalogo. */
export const RELATIONSHIP_COLOR_CLASSES: Record<RelationshipColor, string> = {
  rose: 'bg-rose-50 text-rose-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
};

export function isRelationshipIcon(value: string): value is RelationshipIcon {
  return (RELATIONSHIP_ICONS as readonly string[]).includes(value);
}

export function isRelationshipColor(value: string): value is RelationshipColor {
  return (RELATIONSHIP_COLORS as readonly string[]).includes(value);
}

/** Icone da opcao, com reserva quando o valor guardado nao for reconhecido. */
export function relationshipIcon(option: FieldOption): LucideIcon {
  const nome = option.icon ?? '';
  return isRelationshipIcon(nome) ? ICON_COMPONENTS[nome] : Heart;
}

/** Icone ja pronto para renderizar, sem criar componente durante o render. */
export function relationshipIconElement(option: FieldOption, className = 'size-5'): ReactElement {
  return createElement(relationshipIcon(option), { className, 'aria-hidden': true });
}

export function relationshipColor(option: FieldOption): RelationshipColor {
  const cor = option.color ?? '';
  return isRelationshipColor(cor) ? cor : 'rose';
}

/** Opcoes iniciais, iguais as gravadas pela migration 005. */
export function defaultRelationshipOptions(): FieldOption[] {
  return [
    { id: 'familia', label: 'Família', icon: 'heart', color: 'rose' },
    { id: 'amigo', label: 'Amigo(a)', icon: 'smile', color: 'green' },
    { id: 'conhecido', label: 'Conhecido', icon: 'handshake', color: 'orange' },
  ];
}

/**
 * Nome que aparece na tela.
 *
 * Enquanto a opcao existir, vale o nome atual: renomear se reflete em todos
 * os cadastros. Se a opcao tiver sido excluida, fica o nome registrado no
 * momento do cadastro.
 */
export function relationshipLabel(
  options: readonly FieldOption[],
  optionId: string | null,
  savedLabel: string | null,
): string | null {
  if (!optionId) return null;
  return options.find((option) => option.id === optionId)?.label ?? savedLabel ?? optionId;
}
