'use client';

import type { ReactNode } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import type { BannerTag, CustomField, PublicInviteOwner } from '@/lib/types';
import { filledCount, type DynamicFormValues } from '@/lib/validation/dynamic-form';
import { cn } from '@/lib/utils/cn';
import { InviteBanner } from './InviteBanner';
import { InviteOwnerAside, InviteOwnerBanner, InviteStateShell } from './InviteChrome';

/**
 * Moldura das telas publicas que pedem preenchimento.
 *
 * E UMA implementacao, usada pelo cadastro e pelo questionario. Os dois
 * fluxos sao diferentes por dentro — um cria integrante, o outro apenas
 * guarda uma resposta — mas a pessoa que abre o link ve a mesma tela: mesmo
 * cabecalho, mesmo banner de celular, mesma largura, mesma barra de avanco,
 * mesmos cartoes, mesmos alvos de toque, mesmo rodape fixo.
 *
 * Por isso nada aqui e copia: corrigir um espacamento, um tamanho de fonte
 * ou o comportamento do rodape neste arquivo corrige nas duas telas ao mesmo
 * tempo.
 *
 * O que muda entre elas entra por propriedade — titulo, subtitulo, rotulo do
 * botao, secoes — e o conteudo de cada secao continua sendo desenhado pelo
 * mesmo `DynamicFieldInput` de sempre.
 */

export const REQUIRED_HINT = 'Campos marcados com * são obrigatórios.';

/** Rolagem sem movimento quando o sistema pede menos animacao. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Leva o foco para o primeiro campo invalido do formulario. */
export function focusFirstInvalid(container: HTMLElement | null) {
  if (!container) return;

  const invalid = container.querySelector<HTMLElement>('[aria-invalid="true"]');
  const target =
    invalid &&
    (invalid.matches('input, select, textarea, button, [tabindex]')
      ? invalid
      : invalid.querySelector<HTMLElement>('input, select, textarea, button'));

  const anchor = target ?? invalid ?? container.querySelector<HTMLElement>('[role="alert"]');
  anchor?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  target?.focus({ preventScroll: true });
}

/* -------------------------------------------------------------------------
   Barra de avanco
   ------------------------------------------------------------------------- */

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-ink-100"
    >
      <span
        className="block h-full rounded-pill bg-success-600 transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
   Secao: um cartao numerado no celular, um bloco simples no desktop
   ------------------------------------------------------------------------- */

interface PublicFormSectionProps {
  id: string;
  index: number;
  title: string;
  description: string;
  fields: CustomField[];
  values: DynamicFormValues;
  children: ReactNode;
}

export function PublicFormSection({
  id,
  index,
  title,
  description,
  fields,
  values,
  children,
}: PublicFormSectionProps) {
  const total = fields.length;
  const preenchidos = filledCount(fields, values);
  const completa = total > 0 && preenchidos === total;

  return (
    <section
      aria-labelledby={`secao-${id}`}
      className="scroll-mt-24 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:scroll-mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold lg:hidden',
            completa ? 'bg-success-50 text-success-600' : 'bg-brand-50 text-brand-700',
          )}
        >
          {completa ? <Check className="size-4" /> : index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <h2 id={`secao-${id}`} className="text-[0.9375rem] font-semibold text-ink-900">
            {title}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-ink-500">{description}</p>
        </div>

        <span className="shrink-0 rounded-pill bg-ink-50 px-2 py-1 text-[0.6875rem] font-semibold text-ink-500 tabular-nums lg:hidden">
          {preenchidos}/{total}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Moldura
   ------------------------------------------------------------------------- */

interface PublicFormShellProps {
  /** Quem enviou o link: apenas nome, foto e perfil. */
  owner: PublicInviteOwner | null;
  /** Nome do time, usado no banner e quando o link nao tem dono. */
  teamName: string;
  /** Estampa do banner do celular, ajustada pelo ADMIN (migration 022). */
  bannerTag?: BannerTag;
  /**
   * Endereco do banner do celular, ja decidido por `inviteBannerSrc`. Nulo
   * cai na faixa de convite comum.
   */
  bannerSrc?: string | null;
  /** Codigo visual daquele link, impresso abaixo do nome do time. */
  linkCode?: string | null;
  title: string;
  subtitle: string;
  introText: string;
  /** Quanto ja foi preenchido, de 0 a 100. */
  percent: number;
  /** Quantos campos obrigatorios ainda faltam. */
  missing: number;
  /** O `<form>` com as secoes. */
  children: ReactNode;
  /**
   * Botao de envio do desktop. Fica FORA do `<form>`, ligado a ele pelo
   * atributo `form`, exatamente como o do rodape do celular.
   */
  desktopAction: ReactNode;
  /** Botao de envio do rodape fixo do celular. */
  mobileAction: ReactNode;
  /** Dialogos da tela, desenhados fora da rolagem. */
  overlays?: ReactNode;
}

export function PublicFormShell({
  owner,
  teamName,
  bannerTag,
  bannerSrc = null,
  linkCode,
  title,
  subtitle,
  introText,
  percent,
  missing,
  children,
  desktopAction,
  mobileAction,
  overlays,
}: PublicFormShellProps) {
  const avanco = <ProgressBar percent={percent} label={`${title}: ${percent}% preenchido`} />;

  return (
    <main className="safe-x min-h-dvh bg-surface-muted lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Desktop: coluna azul-marinho fixa. Nunca rola — so a coluna do
          formulario, ao lado, tem rolagem propria. */}
      <InviteOwnerAside
        owner={owner}
        fallbackName={teamName}
        className="hidden lg:flex lg:h-dvh lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto"
      />

      {/* Unica coluna que rola no desktop; no celular e a pagina inteira. */}
      <div className="lg:h-dvh lg:flex-1 lg:overflow-y-auto">
        {/* Celular (abaixo de 768px): o banner oficial do time, servido como
            arquivo, ocupando a largura inteira. Em tablet e desktop ele nao
            e renderizado. */}
        <div className="safe-top md:hidden">
          <InviteBanner
            src={bannerSrc}
            teamName={teamName}
            tag={bannerTag}
            code={linkCode}
            fallback={<InviteOwnerBanner owner={owner} fallbackName={teamName} />}
          />
        </div>

        {/* Tablet (768px a 1023px): sem banner, a faixa de sempre continua
            dando o contexto de quem enviou. */}
        <div className="safe-top hidden md:block lg:hidden">
          <InviteOwnerBanner owner={owner} fallbackName={teamName} />
        </div>

        {/* Celular: assim que o cartao sai da tela, esta faixa gruda no topo.
            E a unica orientacao necessaria durante a rolagem — onde a pessoa
            esta e quanto ja preencheu — e ela nunca some. */}
        <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="mx-auto w-full max-w-2xl px-4 py-2.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
                Preenchimento
              </p>
              <p className="shrink-0 text-xs font-bold text-success-600 tabular-nums">
                {percent}%
              </p>
            </div>
            <div className="mt-2">{avanco}</div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-36 sm:px-6 lg:px-14 lg:py-12 lg:pb-16">
          <div>
            <h1 className="text-xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.5rem] lg:text-[1.75rem]">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
          </div>

          {/* Desktop: o avanco fica aqui. No celular ele vive na faixa do
              topo, sempre a vista. */}
          <div className="mt-4 hidden border-y border-line py-3 lg:block">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
                Preenchimento
              </p>
              <p className="text-xs font-bold text-success-600 tabular-nums">{percent}%</p>
            </div>
            <div className="mt-2">{avanco}</div>
          </div>

          {introText ? (
            <p className="mt-4 rounded-control border border-line bg-surface p-3 text-sm whitespace-pre-line text-ink-700 shadow-card lg:bg-ink-50 lg:shadow-none">
              {introText}
            </p>
          ) : null}

          {children}

          {/* Desktop: a acao fica abaixo do formulario. No celular ela mora
              no rodape fixo, junto do que ainda falta. */}
          <div className="mt-7 hidden items-center justify-between gap-4 lg:flex">
            <p className="text-xs text-ink-500">{REQUIRED_HINT}</p>
            <div className="flex shrink-0 items-center gap-2">{desktopAction}</div>
          </div>

          <p className="mt-5 text-center text-xs text-ink-500 lg:hidden">{REQUIRED_HINT}</p>
        </div>
      </div>

      {/* Celular: o envio fica fixo no rodape, com area segura, e diz quanto
          falta antes de a pessoa tentar enviar. O conteudo reserva espaco
          equivalente para nunca ficar encoberto. */}
      <div className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 py-3 sm:px-6">
          <p
            aria-live="polite"
            className={cn(
              'text-center text-xs font-medium',
              missing === 0 ? 'text-success-600' : 'text-ink-500',
            )}
          >
            {missing === 0
              ? 'Tudo pronto para enviar.'
              : `Ainda ${missing === 1 ? 'falta' : 'faltam'} ${missing} ${
                  missing === 1 ? 'campo obrigatório' : 'campos obrigatórios'
                }.`}
          </p>

          {mobileAction}
        </div>
      </div>

      {overlays}
    </main>
  );
}

/**
 * Tela final, igual nos dois fluxos.
 *
 * Somente o agradecimento: nenhum link, telefone, credencial, botao de login
 * ou instrucao. Recarregar ou reabrir o mesmo link mostra a tela de link
 * encerrado — ele foi consumido em definitivo.
 */
export function PublicSuccessScreen({ title }: { title: string }) {
  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-14 animate-pop items-center justify-center rounded-full bg-success-50 text-success-600"
      >
        <CheckCircle2 className="size-7" />
      </span>

      <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
    </InviteStateShell>
  );
}
