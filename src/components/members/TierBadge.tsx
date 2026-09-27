import type { TeamTier } from '@/lib/types';
import { TEAM_TIER_LABELS } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

/**
 * Etiqueta do nivel da pessoa no time: Lider ou Equipe.
 *
 * O Lider, que cadastra, ganha a cor; a Equipe fica neutra. Assim a lista do
 * time mostra de relance quem traz gente e quem foi trazido.
 */
export function TierBadge({ tier, className }: { tier: TeamTier; className?: string }) {
  return (
    <Badge tone={tier === 'LIDER' ? 'info' : 'neutral'} className={className}>
      {TEAM_TIER_LABELS[tier]}
    </Badge>
  );
}
