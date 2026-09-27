'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Copy,
  Filter,
  IdCard,
  MapPin,
  PencilLine,
  Search,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import { ACCESS_STATUS_LABELS } from '@/lib/types';
import { cadastrosRepetidos } from '@/lib/domain/inconsistencias';
import { perfilDoLider, SELO_EXPLICACAO, type Selo } from '@/lib/domain/perfil-do-lider';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';
import { camposFaltantes } from '@/lib/domain/member-completeness';
import { dadosParaConferir } from '@/lib/domain/conferencia';
import { recruiterText } from '@/lib/domain/recruitment';
import { formatDate, formatLongDate } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { formatNumber, pluralize } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const TOM_DO_SELO: Record<Selo, string> = {
  Motor: 'bg-success-50 text-success-700',
  Constante: 'bg-accent-50 text-accent-700',
  Esfriando: 'bg-warning-50 text-warning-600',
  Parado: 'bg-danger-50 text-danger-700',
  'Sem Equipe': 'bg-ink-100 text-ink-700',
};

/**
 * O painel de um Lider: quanto trouxe, em que ritmo, onde, e em que estado
 * esta a Equipe dele.
 *
 * Abre quando se clica em um Lider — na lista do time ou no ranking. Tudo
 * sai da lista que a pagina ja tem: nenhuma consulta a mais. Cada pessoa da
 * Equipe abre a propria ficha, e "Ver na lista" filtra a lista do time pela
 * Equipe dele.
 */
export function LiderPanel({
  lider,
  members,
  onClose,
  onOpenMember,
  onFiltrarEquipe,
  onBack,
  backLabel,
  inactive,
}: {
  lider: Member;
  members: Member[];
  onClose: () => void;
  onOpenMember: (member: Member) => void;
  /** Filtra a lista do time pela Equipe deste Lider. */
  onFiltrarEquipe?: () => void;
  /** Pilha de janelas (ver `NavegadorDePessoas`). */
  onBack?: () => void;
  backLabel?: string;
  inactive?: boolean;
}) {
  const repetidos = useMemo(() => cadastrosRepetidos(members), [members]);
  const p = useMemo(() => perfilDoLider(lider, members, repetidos), [lider, members, repetidos]);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'todos' | 'conferir' | 'incompletos' | 'repetidos'>('todos');

  const idsConferir = useMemo(() => new Set(p.paraConferir.map((x) => x.member.id)), [p]);
  const idsIncompletos = useMemo(() => new Set(p.incompletos.map((x) => x.member.id)), [p]);
  const idsRepetidos = useMemo(() => new Set(p.repetidos.map((x) => x.member.id)), [p]);

  const equipeVisivel = useMemo(
    () =>
      p.equipe.filter((m) => {
        if (aba === 'conferir' && !idsConferir.has(m.id)) return false;
        if (aba === 'incompletos' && !idsIncompletos.has(m.id)) return false;
        if (aba === 'repetidos' && !idsRepetidos.has(m.id)) return false;
        return buscarPessoa(m, busca).achou;
      }),
    [p, aba, busca, idsConferir, idsIncompletos, idsRepetidos],
  );

  const maiorSemana = Math.max(1, ...p.semanas.map((s) => s.quantidade));
  const acimaDaMedia = p.total - p.mediaDoTime;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Líder · ${lider.name}`}
      description="Tudo o que este Líder trouxe para o time."
      size="lg"
      onBack={onBack}
      backLabel={backLabel}
      inactive={inactive}
    >
      <div className="space-y-5">
        {/* Quem e */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={lider.name} src={lider.photo} size="xl" className="rounded-card" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold text-ink-900">{lider.name}</h3>
              <span className={cn('rounded-pill px-2.5 py-1 text-xs font-semibold', TOM_DO_SELO[p.selo])} title={SELO_EXPLICACAO[p.selo]}>
                {p.selo}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {lider.phone ? formatPhone(lider.phone) : 'Sem telefone'} · Líder desde {formatLongDate(lider.createdAt)}
            </p>
            <p className="text-xs text-ink-500">
              Trazido por {recruiterText(lider.recruitedBy)} ·{' '}
              <span className={lider.access === 'ACTIVE' ? 'text-success-700' : 'text-danger-600'}>
                {ACCESS_STATUS_LABELS[lider.access]}
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-400">{SELO_EXPLICACAO[p.selo]}</p>
          </div>
        </header>

        {/* Os numeros */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero
            icone={<Users className="size-4" />}
            valor={formatNumber(p.total)}
            rotulo={pluralize(p.total, 'pessoa na Equipe', 'pessoas na Equipe')}
            nota={
              p.mediaDoTime
                ? `${acimaDaMedia >= 0 ? '+' : ''}${formatNumber(Math.round(acimaDaMedia * 10) / 10)} da média do time (${formatNumber(p.mediaDoTime)})`
                : undefined
            }
            destaque
          />
          <Numero
            icone={<Trophy className="size-4" />}
            valor={p.total ? `${p.posicao}º` : '—'}
            rotulo={`de ${formatNumber(p.totalDeLideres)} Líderes`}
            nota={p.total ? `${formatNumber(p.participacao)}% dos cadastros de Líderes` : undefined}
          />
          <Numero
            icone={p.variacao7 >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            valor={formatNumber(p.ultimos7)}
            rotulo="nos últimos 7 dias"
            nota={`${p.variacao7 >= 0 ? '+' : ''}${p.variacao7}% sobre a semana anterior · ${formatNumber(p.ultimos30)} em 30 dias`}
          />
          <Numero
            icone={<CalendarClock className="size-4" />}
            valor={p.diasSemCadastrar === null ? '—' : p.diasSemCadastrar === 0 ? 'Hoje' : `${p.diasSemCadastrar}d`}
            rotulo={p.diasSemCadastrar === null ? 'nenhum cadastro ainda' : 'desde o último cadastro'}
            nota={p.ultimoCadastro ? formatDate(p.ultimoCadastro) : undefined}
          />
        </div>

        {/* Ritmo */}
        <section>
          <Titulo>Ritmo — últimas 12 semanas</Titulo>
          <div className="flex h-24 items-end gap-1.5">
            {p.semanas.map((s, i) => (
              <div key={s.inicio} className="flex flex-1 flex-col items-center gap-1" title={`Semana de ${formatDate(s.inicio)}: ${s.quantidade}`}>
                <span className="text-[0.625rem] font-semibold text-ink-700 tabular-nums">{s.quantidade || ''}</span>
                <span
                  className={cn('w-full rounded-t-[3px]', i === p.semanas.length - 1 ? 'bg-accent-600' : 'bg-navy-700')}
                  style={{ height: `${Math.max(s.quantidade ? 6 : 2, (s.quantidade / maiorSemana) * 64)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[0.625rem] text-ink-400">
            <span>{formatDate(p.semanas[0]?.inicio)}</span>
            <span>esta semana</span>
          </div>
        </section>

        {/* Qualidade da Equipe */}
        <section className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-3 rounded-card bg-ink-50 p-3 sm:flex-col sm:justify-center sm:px-5">
            <span
              className={cn(
                'text-3xl font-bold tabular-nums',
                p.saude >= 90 ? 'text-success-700' : p.saude >= 70 ? 'text-warning-600' : 'text-danger-600',
              )}
            >
              {p.saude}%
            </span>
            <span className="text-xs text-ink-500 sm:text-center">da Equipe<br className="hidden sm:block" /> em ordem</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Contador icone={<AlertTriangle className="size-4" />} tom="danger" valor={p.paraConferir.length} rotulo="para conferir" ativo={aba === 'conferir'} onClick={() => setAba(aba === 'conferir' ? 'todos' : 'conferir')} />
            <Contador icone={<PencilLine className="size-4" />} tom="warning" valor={p.incompletos.length} rotulo="incompletos" ativo={aba === 'incompletos'} onClick={() => setAba(aba === 'incompletos' ? 'todos' : 'incompletos')} />
            <Contador icone={<Copy className="size-4" />} tom="danger" valor={p.repetidos.length} rotulo="repetidos" ativo={aba === 'repetidos'} onClick={() => setAba(aba === 'repetidos' ? 'todos' : 'repetidos')} />
          </div>
        </section>

        {p.faltasPorCampo.length || p.bairros.length ? (
          <section className="grid gap-4 sm:grid-cols-2">
            {p.faltasPorCampo.length ? (
              <div>
                <Titulo>O que mais falta na Equipe</Titulo>
                <Barras itens={p.faltasPorCampo} cor="bg-warning-600" />
              </div>
            ) : null}
            {p.bairros.length ? (
              <div>
                <Titulo>
                  <MapPin aria-hidden="true" className="mr-1 inline size-3.5" />
                  Onde a Equipe mora
                </Titulo>
                <Barras itens={p.bairros} cor="bg-accent-600" />
              </div>
            ) : null}
          </section>
        ) : null}

        {p.repetidos.some((r) => r.outrosResponsaveis.length) ? (
          <p className="flex items-start gap-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-600">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {p.repetidos
                .filter((r) => r.outrosResponsaveis.length)
                .slice(0, 3)
                .map((r) => `${r.member.name} também foi cadastrado por ${r.outrosResponsaveis.join(' e ')}`)
                .join('; ')}
              . O ranking conta essas pessoas duas vezes.
            </span>
          </p>
        ) : null}

        {/* A Equipe */}
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Titulo semMargem>
              {aba === 'todos'
                ? `A Equipe (${formatNumber(p.total)})`
                : aba === 'conferir'
                  ? 'Para conferir'
                  : aba === 'incompletos'
                    ? 'Incompletos'
                    : 'Repetidos'}
              {aba !== 'todos' ? (
                <button type="button" onClick={() => setAba('todos')} className="ml-2 text-xs font-medium text-brand-700 hover:underline">
                  ver todos
                </button>
              ) : null}
            </Titulo>
            {p.total > 6 ? (
              <label className="relative w-full sm:w-64">
                <span className="sr-only">Buscar na Equipe</span>
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, telefone, CPF..."
                  className="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-sm text-ink-900 outline-none focus:border-accent-600"
                />
              </label>
            ) : null}
          </div>

          {p.total === 0 ? (
            <p className="rounded-control border border-dashed border-line px-4 py-6 text-center text-sm text-ink-500">
              {lider.name} ainda não cadastrou ninguém.
            </p>
          ) : equipeVisivel.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-500">Ninguém aqui.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line">
              {equipeVisivel.map((m) => {
                const conferir = dadosParaConferir(m);
                const faltas = camposFaltantes(m);
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => onOpenMember(m)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-50">
                      <Avatar name={m.name} src={m.photo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">{m.name}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {m.phone ? formatPhone(m.phone) : 'sem telefone'} · {formatDate(m.createdAt)}
                          {m.district ? ` · ${m.district}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {idsRepetidos.has(m.id) ? <Badge tone="danger">Repetido</Badge> : null}
                        {conferir.length ? (
                          <Badge tone="danger" title={conferir.join(', ')}>
                            Conferir
                          </Badge>
                        ) : null}
                        {faltas.length ? (
                          <Badge tone="warning" title={`Falta ${faltas.join(', ')}`}>
                            Incompleto
                          </Badge>
                        ) : null}
                        {!conferir.length && !faltas.length && !idsRepetidos.has(m.id) ? <Badge tone="success">Em ordem</Badge> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          {onFiltrarEquipe && p.total > 0 ? (
            <Button variant="secondary" onClick={onFiltrarEquipe}>
              <Filter aria-hidden="true" className="size-4" />
              Ver a Equipe na lista
            </Button>
          ) : null}
          <Button onClick={() => onOpenMember(lider)}>
            <IdCard aria-hidden="true" className="size-4" />
            Ficha do Líder
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Titulo({ children, semMargem = false }: { children: ReactNode; semMargem?: boolean }) {
  return (
    <p className={cn('flex items-center text-xs font-semibold tracking-wide text-ink-500 uppercase', !semMargem && 'mb-2')}>
      {children}
    </p>
  );
}

function Numero({
  icone,
  valor,
  rotulo,
  nota,
  destaque = false,
}: {
  icone: ReactNode;
  valor: string;
  rotulo: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn('rounded-card p-3', destaque ? 'bg-navy-900 text-white' : 'bg-ink-50')}>
      <span className={cn('flex items-center gap-1.5 text-xs', destaque ? 'text-navy-300' : 'text-ink-500')}>
        {icone}
        {rotulo}
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums">{valor}</span>
      {nota ? <span className={cn('mt-0.5 block text-[0.6875rem]', destaque ? 'text-navy-300' : 'text-ink-400')}>{nota}</span> : null}
    </div>
  );
}

function Contador({
  icone,
  tom,
  valor,
  rotulo,
  ativo,
  onClick,
}: {
  icone: ReactNode;
  tom: 'danger' | 'warning';
  valor: number;
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
}) {
  const cores = tom === 'danger' ? 'text-danger-700 bg-danger-50' : 'text-warning-600 bg-warning-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={valor === 0}
      aria-pressed={ativo}
      className={cn(
        'rounded-card border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-60',
        ativo ? 'border-accent-600 ring-2 ring-accent-600/20' : 'border-line hover:border-accent-600',
      )}
    >
      <span className={cn('inline-flex size-7 items-center justify-center rounded-control', valor ? cores : 'bg-ink-100 text-ink-400')}>{icone}</span>
      <span className="mt-1 block text-xl font-bold text-ink-900 tabular-nums">{formatNumber(valor)}</span>
      <span className="block text-xs text-ink-500">{rotulo}</span>
    </button>
  );
}

function Barras({ itens, cor }: { itens: { rotulo: string; quantidade: number }[]; cor: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.quantidade));
  return (
    <ul className="space-y-1.5">
      {itens.map((item) => (
        <li key={item.rotulo} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate text-ink-700 first-letter:uppercase">{item.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-pill bg-ink-100">
            <span className={cn('block h-full rounded-pill', cor)} style={{ width: `${Math.max(4, (item.quantidade / maior) * 100)}%` }} />
          </span>
          <span className="text-right font-semibold text-ink-900 tabular-nums">{item.quantidade}</span>
        </li>
      ))}
    </ul>
  );
}
