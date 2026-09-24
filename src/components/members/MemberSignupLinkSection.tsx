'use client';

import { useState } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/date';
import { useMemberSignupLink } from '@/hooks/use-member-signup-link';
import { CopyField } from '@/components/common/CopyField';
import { Skeleton } from '@/components/ui/Skeleton';

interface MemberSignupLinkSectionProps {
  memberId: string;
}

/**
 * Link de cadastro pelo qual o integrante entrou.
 *
 * Exclusivo do ADMIN: quem chama ja confere `device.view`, e a rota recusa
 * qualquer outro perfil com 403. Comeca fechada, como a secao do aparelho: a
 * consulta so acontece quando ela e aberta.
 */
export function MemberSignupLinkSection({ memberId }: MemberSignupLinkSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-control border border-line">
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
          <Link2 aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
          <span className="min-w-0 flex-1">Link do cadastro</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180"
          />
        </summary>

        {open ? <SignupLink memberId={memberId} /> : null}
      </details>
    </section>
  );
}

function SignupLink({ memberId }: MemberSignupLinkSectionProps) {
  const { data, loading, error } = useMemberSignupLink(memberId);

  if (loading) {
    return (
      <div className="border-t border-line p-3">
        <Skeleton className="h-16 w-full rounded-control" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-line p-3">
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-t border-line p-3">
        <p className="text-sm text-ink-500">
          Nenhum link de cadastro registrado para esta pessoa. Ela pode ter sido cadastrada
          pelo painel ou antes do rastreamento dos links.
        </p>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    ['Dono do link', data.ownerName ?? '—'],
    ['Gerado por', data.generatedByName ?? '—'],
    ['Gerado em', data.generatedAt ? formatDateTime(data.generatedAt) : '—'],
    ['Cadastro enviado em', data.consumedAt ? formatDateTime(data.consumedAt) : '—'],
  ];

  return (
    <div className="space-y-3 border-t border-line p-3">
      {data.url ? (
        <CopyField value={data.url} label="Link usado no cadastro" />
      ) : (
        <p className="text-sm text-ink-500">
          O endereço exato não está mais disponível: o link foi renovado depois deste
          cadastro, e o sistema não guarda endereços antigos.
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-500">{label}</dt>
            <dd className="font-medium break-words text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
