'use client';

import { ExternalLink, Link2, ShieldCheck } from 'lucide-react';
import { invitePath } from '@/lib/utils/url';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTeamOverview } from '@/hooks/use-team';
import { PersonalLinkCard } from './PersonalLinkCard';
import { TeamHeader } from './TeamHeader';

/**
 * Recrutar: o link pessoal do integrante.
 *
 * Ele copia e compartilha o proprio link. Ativar, desativar, renovar e
 * editar o formulario continuam sendo de quem administra a candidatura, e as
 * rotas correspondentes recusam o perfil EQUIPE no servidor.
 */
export function TeamRecruitView() {
  const { data: overview, loading, error, reload } = useTeamOverview();

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
      >
        <p>{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const path = overview.invite.token ? invitePath(overview.invite.token) : null;

  return (
    <div className="space-y-3">
      <TeamHeader overview={overview} />

      <PersonalLinkCard invite={overview.invite} />

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Como funciona</CardTitle>
            <CardDescription>
              O link é só seu e não muda: continua valendo depois de sair, entrar de novo, trocar de
              aparelho ou recarregar a página.
            </CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-3">
          <p className="flex items-start gap-2 rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-700">
            <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
            <span className="min-w-0">
              Quem se cadastrar por ele aparece na sua equipe e recebe o próprio acesso ao sistema,
              com um link pessoal.
            </span>
          </p>

          <p className="flex items-start gap-2 rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-700">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
            <span className="min-w-0">
              O formulário é o mesmo de toda a candidatura e é configurado por{' '}
              {overview.candidateName}.
            </span>
          </p>

          {path ? (
            <a
              href={path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              Abrir prévia em nova aba
            </a>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
