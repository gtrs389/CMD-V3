'use client';

import { useEffect, useMemo, useState } from 'react';
import { Phone, Search, X } from 'lucide-react';
import type { PlaceMember, PlaceMembersPayload, PollingPlacePin } from '@/lib/domain/map-pin';
import { PlaceSections } from './PlaceSections';
import {
  estimatedVotes,
  voteBreakdown,
  ESTIMATED_VOTES_HINT,
  ESTIMATED_VOTES_LABEL,
} from '@/lib/domain/map-pin';
import { api } from '@/lib/repositories/http/api';
import { formatPhone } from '@/lib/utils/phone';
import { formatNumber, initials } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Pessoas de um local de votacao.
 *
 * Painel lateral no desktop e folha de baixo no celular. A lista so e pedida
 * ao servidor depois do clique em "Ver pessoas", com busca e paginacao la.
 */
export function PlaceMembersPanel({
  place,
  onOpenMember,
  onClose,
}: {
  place: PollingPlacePin;
  /** Abre a ficha da pessoa sobre o mapa, sem sair dele. */
  onOpenMember: (memberId: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);

  /** Guarda a resposta com a consulta a que ela pertence. */
  const [result, setResult] = useState<{
    key: string;
    data: PlaceMembersPayload | null;
    error: boolean;
  } | null>(null);

  const params = new URLSearchParams({ pagina: String(page), tamanho: '20' });
  if (term.trim()) params.set('busca', term.trim());
  const key = `${place.locationId}?${params}#${tick}`;

  useEffect(() => {
    let active = true;

    api<PlaceMembersPayload>(`/api/mapa/locais/${place.locationId}/integrantes?${params}`)
      .then((payload) => {
        if (active) setResult({ key, data: payload, error: false });
      })
      .catch(() => {
        if (active) setResult({ key, data: null, error: true });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ready = result?.key === key;
  const data = ready ? result?.data : null;
  const loading = !ready;
  const error = ready ? Boolean(result?.error) : false;

  const pages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Pessoas em ${place.title ?? 'local de votação'}`}
        className="relative flex h-[85vh] w-full flex-col rounded-t-card bg-surface shadow-overlay sm:h-full sm:max-w-md sm:rounded-none"
      >
        <header className="space-y-2 border-b border-line p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink-900">
                {place.title ?? 'Local de votação'}
              </h3>
              {place.address ? (
                <p className="truncate text-xs text-ink-500">{place.address}</p>
              ) : null}
              <p className="text-xs text-ink-500">
                {[place.city, place.state].filter(Boolean).join('/') || '--'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="tap -mt-1 -mr-1 flex items-center justify-center rounded-control text-ink-500 hover:bg-ink-100"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* O mesmo numero e o mesmo nome do popup do mapa. */}
          <section className="rounded-control border border-brand-100 bg-brand-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.6875rem] font-semibold tracking-wide text-brand-800 uppercase">
                {ESTIMATED_VOTES_LABEL}
              </p>
              <p className="text-2xl leading-none font-semibold text-brand-900">
                {formatNumber(estimatedVotes(place))}
              </p>
            </div>

            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
              {voteBreakdown(place).map((item) => (
                <div key={item.label} className="flex gap-1">
                  <dt>{item.label}:</dt>
                  <dd className="font-semibold text-ink-900">{formatNumber(item.value)}</dd>
                </div>
              ))}
            </dl>

            <PlaceSections place={place} />

            <p className="mt-1 text-[0.6875rem] text-ink-500 italic">{ESTIMATED_VOTES_HINT}</p>
          </section>

          <div className="relative flex items-center">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              type="search"
              value={term}
              aria-label="Buscar pessoa pelo nome"
              placeholder="Buscar por nome"
              onChange={(event) => {
                setPage(1);
                setTerm(event.target.value);
              }}
              className="min-h-11 w-full rounded-control border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </header>

        <div className="scrollbar-slim flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-ink-500">Não foi possível carregar as pessoas.</p>
              <Button variant="secondary" onClick={() => setTick((value) => value + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : (data?.items.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-ink-500">
              {term ? 'Nenhuma pessoa encontrada nesta busca.' : 'Nenhuma pessoa neste local.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data?.items.map((member) => (
                <li key={member.memberId}>
                  <PersonRow member={member} onOpenMember={onOpenMember} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {pages > 1 ? (
          <footer className="flex items-center justify-between gap-2 border-t border-line p-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-ink-500">
              Página {page} de {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
            >
              Próxima
            </Button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

/** Uma pessoa. Sem telefone ou e-mail, a linha simplesmente nao aparece. */
function PersonRow({
  member,
  onOpenMember,
}: {
  member: PlaceMember;
  onOpenMember: (memberId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenMember(member.memberId)}
      // Abre a ficha sobre o mapa. Sair da tela custaria a posicao, o zoom, o
      // filtro e esta propria escola aberta.
      className="flex w-full items-center gap-3 rounded-control border border-line p-2.5 text-left transition-colors hover:bg-ink-50"
    >
      {member.photo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={member.photo}
          alt={`Foto de ${member.name}`}
          className="size-10 shrink-0 rounded-full border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-500"
        >
          {initials(member.name)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{member.name}</p>
        <p className="truncate text-xs text-ink-500">{member.clientName}</p>

        {member.email ? <p className="truncate text-xs text-ink-500">{member.email}</p> : null}
        {member.phone ? (
          <p className="flex items-center gap-1 text-xs text-ink-500">
            <Phone aria-hidden="true" className="size-3" />
            {formatPhone(member.phone)}
          </p>
        ) : null}

        {member.zone || member.section ? (
          <p className="text-xs text-ink-500">
            Zona {member.zone ?? '--'} · Seção {member.section ?? '--'}
          </p>
        ) : null}
      </div>
    </button>
  );
}
