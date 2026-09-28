import type { MemberTag, TeamTier } from '@/lib/types';
import { TEAM_TIER_LABELS } from '@/lib/types';
import { resumoDaTag } from '@/lib/domain/tags';
import { Badge } from '@/components/ui/Badge';
import { TagChip } from './TagChip';

/**
 * Etiqueta do nivel da pessoa no time: Lider ou Equipe.
 *
 * O Lider, que cadastra, ganha a cor; a Equipe fica neutra. Assim a lista do
 * time mostra de relance quem traz gente e quem foi trazido.
 *
 * As tags da pessoa (ex.: Coordenador Delta Operacional) vem logo depois, ao
 * lado do nivel e nunca no lugar dele.
 */
export function TierBadge({
  tier,
  tags,
  className,
}: {
  tier: TeamTier;
  tags?: MemberTag[];
  className?: string;
}) {
  return (
    <>
      <Badge tone={tier === 'LIDER' ? 'info' : 'neutral'} className={className}>
        {TEAM_TIER_LABELS[tier]}
      </Badge>
      <TagsDaPessoa tags={tags} compacto={Boolean(className)} />
    </>
  );
}

/** As tags da pessoa, lado a lado; passar o mouse diz de onde ela veio. */
export function TagsDaPessoa({ tags, compacto = false }: { tags?: MemberTag[]; compacto?: boolean }) {
  return (
    <>
      {(tags ?? []).map((tag) => (
        <TagChip key={tag.id} tag={tag} compacto={compacto} title={`${tag.name} — ${resumoDaTag(tag)}`} />
      ))}
    </>
  );
}
