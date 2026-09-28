'use client';

import { useMemo } from 'react';
import { Tags } from 'lucide-react';
import type { Member } from '@/lib/types';
import { TEAM_TIER_LABELS } from '@/lib/types';
import { tagsDoTime } from '@/lib/domain/tags';
import { Avatar } from '@/components/ui/Avatar';
import { TagChip } from '@/components/members/TagChip';
import { useNavegador } from '@/components/members/navegador-contexto';

/**
 * "Funções no time": cada tag com as pessoas que a carregam, na visão geral.
 *
 * Quem abre o time ve de cara quem e Coordenador Delta Operacional (e de
 * onde cada um veio) — e um clique abre a pessoa por cima, pela pilha.
 */
export function QuadroDeTags({ members }: { members: Member[] }) {
  const navegador = useNavegador();
  const grupos = useMemo(() => {
    return tagsDoTime(members).map(({ tag }) => ({
      tag,
      pessoas: members
        .filter((m) => m.tags?.some((t) => t.id === tag.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }));
  }, [members]);

  if (grupos.length === 0) return null;

  return (
    <section aria-labelledby="funcoes-no-time" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 id="funcoes-no-time" className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900">
        <Tags aria-hidden="true" className="size-4 text-accent-600" />
        Funções no time
      </h2>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {grupos.map(({ tag, pessoas }) => (
          <div key={tag.id} className="min-w-0 rounded-control border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <TagChip tag={tag} />
              <span className="shrink-0 text-xs font-semibold text-ink-500 tabular-nums">
                {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </div>
            <ul className="mt-2 space-y-0.5">
              {pessoas.map((m) => {
                const naTag = m.tags?.find((t) => t.id === tag.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!navegador}
                      onClick={() => navegador?.abrirPessoa(m.id)}
                      className="group flex min-h-10 w-full items-center gap-2.5 rounded-control px-1.5 text-left hover:bg-ink-50 disabled:cursor-default"
                    >
                      <Avatar name={m.name} src={m.photo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                          {m.name}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {naTag ? `Era ${TEAM_TIER_LABELS[naTag.fromTier]}` : TEAM_TIER_LABELS[m.tier]}
                          {naTag ? ` · desde ${new Date(naTag.since).toLocaleDateString('pt-BR')}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
