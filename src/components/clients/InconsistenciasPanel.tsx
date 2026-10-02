'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileWarning,
  Fingerprint,
  GitBranch,
  KeyRound,
  Link2,
  MapPinOff,
  PencilLine,
  Phone,
  ShieldAlert,
  SlidersHorizontal,
  UserX,
  X,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import {
  CERTEZA_ROTULO,
  TIPO_INFO,
  TIPOS,
  entraNasInconsistencias,
  motivosDosRegistros,
  EVIDENCIA_INFO,
  type Certeza,
  type Diagnostico,
  type Gravidade,
  type GrupoRepetido,
  type ProblemaDaFicha,
  type TipoDaFicha,
} from '@/lib/domain/inconsistencias';
import { resumoDasFaltas } from '@/lib/domain/member-completeness';
import { recruiterOptionsAlfabeticas, recruiterText } from '@/lib/domain/recruitment';
import { contextoDosFiltros } from '@/lib/domain/filtros-de-dados';
import { baixarArquivo } from '@/lib/utils/download';
import { nomeDoPdfDeInconsistencia } from '@/lib/domain/nome-do-pdf';
import { formatPhone } from '@/lib/utils/phone';
import { useToast } from '@/components/ui/Toast';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { TierBadge } from '@/components/members/TierBadge';
import { FiltroDeDadosCard } from './FiltroDeDadosCard';
import { montarPdfDeInconsistencias, recorteDe, semNada } from './pdf-de-inconsistencias';
import { VerificacoesModal } from './VerificacoesModal';

interface InconsistenciasPanelProps {
  /** Nome do time, para o arquivo do relatorio. */
  clientName: string;
  members: Member[];
  diagnostico: Diagnostico;
  /** Abre a ficha da pessoa, onde ela e corrigida. */
  onOpenMember: (memberId: string) => void;
  /** Baixar o relatorio: a mesma regra da planilha da equipe. */
  canExport: boolean;
  clientId: string;
  /** Verificacoes desligadas neste time (053). */
  desligadas: readonly string[];
  /** Ligar e desligar verificacoes: so o ADMIN geral. */
  canConfigure: boolean;
  onConfigChanged: () => void;
}

/* -------------------------------------------------------------------------
   Cores por gravidade e por certeza — o mesmo vocabulario na tela toda
   ------------------------------------------------------------------------- */

const TOM_DA_CERTEZA: Record<Certeza, 'danger' | 'warning' | 'neutral'> = {
  certa: 'danger',
  provavel: 'warning',
  possivel: 'neutral',
};

const TOM_DA_GRAVIDADE: Record<Gravidade, 'danger' | 'warning' | 'neutral'> = {
  alta: 'danger',
  media: 'warning',
  baixa: 'neutral',
};

const ICONE_DO_TIPO: Record<TipoDaFicha, ReactNode> = {
  invalido: <FileWarning className="size-4" />,
  'lider-sem-acesso': <KeyRound className="size-4" />,
  'fora-do-municipio': <MapPinOff className="size-4" />,
  'terceiro-nivel': <GitBranch className="size-4" />,
  'responsavel-removido': <UserX className="size-4" />,
  'sem-origem': <Link2 className="size-4" />,
};

const FUNDO_DO_MOTIVO = {
  danger: 'bg-danger-50/50',
  warning: 'bg-warning-50/50',
  neutral: 'bg-ink-50/40',
} as const;

const CHIP_DO_MOTIVO = {
  danger: 'border-danger-200 bg-surface text-danger-700',
  warning: 'border-warning-600/30 bg-surface text-warning-600',
  neutral: 'border-line-strong bg-surface text-ink-700',
} as const;

const CAIXA_DO_TOM = {
  danger: 'bg-danger-50 text-danger-700',
  warning: 'bg-warning-50 text-warning-600',
  neutral: 'bg-ink-100 text-ink-700',
  success: 'bg-success-50 text-success-700',
} as const;

/**
 * Quadro de inconsistencias do time.
 *
 * Quatro perguntas, na ordem em que custam caro:
 *
 *   1. quem esta cadastrado MAIS DE UMA VEZ — infla o total, conta duas
 *      vezes no ranking e poe dois Lideres disputando a mesma pessoa;
 *   2. o que FALTA — e de quem e o habito de deixar faltar;
 *   3. o que esta ERRADO — numero que nao fecha, endereco em outra cidade,
 *      Lider que nao consegue entrar;
 *   4. o que e so AVISO — telefone de familia, origem perdida.
 *
 * Cada pessoa e um botao que abre a ficha dela, onde a correcao acontece.
 * Nada aqui grava coisa alguma: o quadro e um espelho da equipe, e corrigir
 * a ficha tira a pessoa daqui sozinho.
 */
export function InconsistenciasPanel({
  clientName,
  members: todos,
  diagnostico,
  onOpenMember,
  canExport,
  clientId,
  desligadas,
  canConfigure,
  onConfigChanged,
}: InconsistenciasPanelProps) {
  const [configurando, setConfigurando] = useState(false);
  // O Lider que so e o nome de uma aba nao entra no quadro (nem na base dos
  // percentuais): nao tem cadastro para conferir.
  const members = useMemo(() => todos.filter(entraNasInconsistencias), [todos]);
  // Varios responsaveis de uma vez: a tela mostra a soma deles, e o PDF sai
  // separado, um por responsavel. Nenhum marcado = o time todo.
  const [selecionados, setSelecionados] = useState<string[]>([]);

  // Em ordem alfabetica: e pelo nome que se procura o Lider na lista.
  const responsaveis = useMemo(() => recruiterOptionsAlfabeticas(members), [members]);
  const rotuloDe = (chave: string) => responsaveis.find((opcao) => opcao.key === chave)?.label ?? '';

  // O recorte vale sobre o DIAGNOSTICO: um grupo de repetidos aparece se
  // qualquer registro dele e do responsavel — e assim que se ve a mesma
  // pessoa cadastrada por dois Lideres.
  const visto = useMemo(() => recorteDe(diagnostico, selecionados), [diagnostico, selecionados]);
  const { porTipo } = visto;

  // O filtro por dado olha as mesmas pessoas do recorte acima, e sabe quem
  // esta em um grupo de repetidos (certo ou provavel).
  const doRecorte = useMemo(() => members.filter(visto.filtra), [members, visto]);
  const contexto = useMemo(
    () => contextoDosFiltros(members, diagnostico.repetidos),
    [members, diagnostico.repetidos],
  );
  const rotuloDoResponsavel = selecionados.length
    ? selecionados.map(rotuloDe).filter(Boolean).join(', ')
    : null;

  const cadastrosRepetidos = visto.certos.reduce((soma, grupo) => soma + grupo.registros.length, 0);
  const copiasRepetidas = cadastrosRepetidos - visto.certos.length;

  const graves = TIPOS.filter((tipo) => TIPO_INFO[tipo].gravidade !== 'baixa' && porTipo.has(tipo));
  const avisos = TIPOS.filter((tipo) => TIPO_INFO[tipo].gravidade === 'baixa' && porTipo.has(tipo));

  const nada = semNada(visto);

  const toast = useToast();
  const [baixando, setBaixando] = useState<string | null>(null);

  /** O PDF de um recorte: o time todo, um responsavel, ou a soma de varios. */
  function montarPdf(chaves: string[]): Promise<Blob> {
    return montarPdfDeInconsistencias({ clientName, members, diagnostico, chaves, rotuloDe });
  }

  // inconsistência_vivian.pdf — o primeiro nome do responsável (ou do time),
  // com o sobrenome quando outro tem o mesmo primeiro nome.
  const nomeDoArquivo = (rotulo: string) =>
    nomeDoPdfDeInconsistencia(rotulo, responsaveis.map((opcao) => opcao.label));

  /**
   * O quadro que esta na tela, em PDF. Com varios responsaveis marcados, sai
   * UM PDF POR RESPONSAVEL, cada um so com o que e dele — sem precisar
   * escolher um de cada vez. Quem nao tem nada a corrigir nao gera arquivo.
   */
  async function baixarRelatorio() {
    try {
      if (selecionados.length <= 1) {
        setBaixando('Montando o PDF...');
        const blob = await montarPdf(selecionados);
        baixarArquivo(nomeDoArquivo(rotuloDoResponsavel ?? clientName), blob);
        toast.success('Relatório de inconsistências baixado.');
        return;
      }

      const limpos: string[] = [];
      let baixados = 0;
      for (const [indice, chave] of selecionados.entries()) {
        setBaixando(`Montando ${indice + 1} de ${selecionados.length}...`);
        if (semNada(recorteDe(diagnostico, [chave]))) {
          limpos.push(rotuloDe(chave).split(' · ')[0]);
          continue;
        }
        const blob = await montarPdf([chave]);
        baixarArquivo(nomeDoArquivo(rotuloDe(chave)), blob);
        baixados += 1;
        // Um respiro entre os arquivos: o navegador baixa todos, em ordem.
        await new Promise((pronto) => setTimeout(pronto, 400));
      }
      toast.success(
        `${baixados} ${pluralize(baixados, 'PDF baixado', 'PDFs baixados')}, um por responsável.` +
          (limpos.length ? ` Sem inconsistências: ${limpos.join(', ')}.` : ''),
      );
    } catch {
      toast.error('Não foi possível montar o PDF. Tente de novo.');
    } finally {
      setBaixando(null);
    }
  }

  function alternar(chave: string) {
    if (!chave) return setSelecionados([]);
    setSelecionados((atuais) =>
      atuais.includes(chave) ? atuais.filter((item) => item !== chave) : [...atuais, chave],
    );
  }

  return (
    <div className="space-y-3">
      <Painel
        diagnostico={diagnostico}
        certos={visto.certos.length}
        possiveis={visto.possiveis.length}
        incompletos={visto.incompletos.length}
        graves={graves.reduce((soma, tipo) => soma + (porTipo.get(tipo)?.length ?? 0), 0)}
        avisos={
          visto.telefones.length +
          avisos.reduce((soma, tipo) => soma + (porTipo.get(tipo)?.length ?? 0), 0)
        }
        filtro={
          responsaveis.length > 1 ? (
            <div className="flex min-w-0 flex-col gap-2 sm:max-w-md sm:flex-1">
              <Dropdown
                id="inconsistencias-responsavel"
                aria-label="Ver as inconsistências de um ou mais responsáveis"
                highlighted={selecionados.length > 0}
                className="sm:max-w-72"
                multiple={{
                  selected: selecionados.length ? selecionados : [''],
                  onToggle: alternar,
                  resumo:
                    selecionados.length === 0
                      ? 'Todos os responsáveis'
                      : selecionados.length === 1
                        ? rotuloDe(selecionados[0])
                        : `${selecionados.length} responsáveis selecionados`,
                }}
                options={[
                  { value: '', label: 'Todos os responsáveis' },
                  ...responsaveis.map((opcao) => ({
                    value: opcao.key,
                    label: `${opcao.label} (${opcao.count})`,
                  })),
                ]}
              />
              {selecionados.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selecionados.map((chave) => (
                    <button
                      key={chave}
                      type="button"
                      onClick={() => alternar(chave)}
                      aria-label={`Tirar ${rotuloDe(chave)} da seleção`}
                      className="inline-flex max-w-full items-center gap-1 rounded-pill bg-accent-50 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-100"
                    >
                      <span className="truncate">{rotuloDe(chave).split(' · ')[0]}</span>
                      <X aria-hidden="true" className="size-3.5 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null
        }
        exportar={
          canConfigure || (canExport && !nada) ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
              {canConfigure ? (
                <Button variant="ghost" onClick={() => setConfigurando(true)} className="whitespace-nowrap">
                  <SlidersHorizontal aria-hidden="true" className="size-4" />
                  O que aparece
                  {desligadas.length ? (
                    <span className="rounded-pill bg-warning-50 px-1.5 text-xs font-semibold text-warning-600 tabular-nums">
                      {desligadas.length} {desligadas.length === 1 ? 'desligada' : 'desligadas'}
                    </span>
                  ) : null}
                </Button>
              ) : null}
              {canExport && !nada ? (
            <Button
              variant="secondary"
              onClick={baixarRelatorio}
              loading={baixando !== null}
              className="shrink-0 self-start whitespace-nowrap"
            >
              <Download aria-hidden="true" className="size-4" />
              {baixando ??
                (selecionados.length > 1 ? `Baixar ${selecionados.length} PDFs (um por líder)` : 'Baixar PDF')}
            </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      <FiltroDeDadosCard
        clientName={clientName}
        members={doRecorte}
        responsavel={rotuloDoResponsavel}
        contexto={contexto}
        gruposRepetidos={visto.certos}
        onOpenMember={onOpenMember}
        canExport={canExport}
        desligadas={desligadas}
      />

      {canConfigure ? (
        <VerificacoesModal
          open={configurando}
          onClose={() => setConfigurando(false)}
          clientId={clientId}
          desligadas={desligadas}
          onSaved={onConfigChanged}
        />
      ) : null}

      {nada ? (
        <div className="flex flex-col items-center rounded-card border border-success-600/30 bg-success-50/60 px-5 py-12 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-success-50 text-success-700">
            <CheckCircle2 aria-hidden="true" className="size-6" />
          </span>
          <p className="text-base font-semibold text-ink-900">
            {selecionados.length ? 'Nada fora do lugar nos cadastros selecionados.' : 'Cadastro limpo.'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            Ninguém repetido, nada faltando, nenhum número que não fecha. Quando aparecer
            alguma coisa, ela aparece aqui primeiro.
          </p>
        </div>
      ) : null}

      {visto.certos.length > 0 ? (
        <Secao
          id="repetidos"
          icone={<Copy className="size-4" />}
          tom="danger"
          titulo="Cadastrados mais de uma vez"
          // O numero e de CADASTROS, como no filtro "Cadastrado mais de uma
          // vez": contar pessoas aqui e fichas la dava 7 num e 15 no outro.
          quantidade={cadastrosRepetidos}
          descricao={`${formatNumber(cadastrosRepetidos)} ${pluralize(cadastrosRepetidos, 'cadastro', 'cadastros')} de ${formatNumber(
            visto.certos.length,
          )} ${pluralize(visto.certos.length, 'pessoa', 'pessoas')}: o primeiro de cada uma costuma ser o original, e ${
            copiasRepetidas === 1 ? 'o outro é cópia' : `os outros ${formatNumber(copiasRepetidas)} são cópias`
          }.`}
        >
          <ListaQueCresce
            itens={visto.certos}
            inicial={6}
            chave={(grupo) => grupo.id}
            render={(grupo) => <CartaoRepetido grupo={grupo} onOpenMember={onOpenMember} />}
            rotulo="grupos"
          />
        </Secao>
      ) : null}

      {visto.incompletos.length > 0 ? (
        <Secao
          id="incompletos"
          icone={<PencilLine className="size-4" />}
          tom="warning"
          titulo="Cadastros incompletos"
          quantidade={visto.incompletos.length}
          descricao="Entraram com buraco — quase sempre de uma lista importada ou de um cadastro às pressas. A etiqueta some da ficha assim que o dado é preenchido."
        >
          <Incompletos
            diagnostico={diagnostico}
            itens={visto.incompletos}
            filtrado={selecionados.length > 0}
            onOpenMember={onOpenMember}
          />
        </Secao>
      ) : null}

      {graves.map((tipo) => (
        <SecaoDoTipo key={tipo} tipo={tipo} itens={porTipo.get(tipo) ?? []} onOpenMember={onOpenMember} />
      ))}

      {visto.possiveis.length > 0 ? (
        <Secao
          id="possiveis"
          icone={<ShieldAlert className="size-4" />}
          tom="neutral"
          titulo="Pode ser a mesma pessoa"
          quantidade={visto.possiveis.length}
          descricao="Mesmo nome, e nada mais em comum. Pode ser homônimo — ou a mesma pessoa cadastrada sem título e com outro telefone. Vale uma olhada."
          recolhida
        >
          <ListaQueCresce
            itens={visto.possiveis}
            inicial={6}
            chave={(grupo) => grupo.id}
            render={(grupo) => <CartaoRepetido grupo={grupo} onOpenMember={onOpenMember} />}
            rotulo="grupos"
          />
        </Secao>
      ) : null}

      {visto.telefones.length > 0 ? (
        <Secao
          id="telefones"
          icone={<Phone className="size-4" />}
          tom="neutral"
          titulo="Telefone compartilhado"
          quantidade={visto.telefones.length}
          descricao="Pessoas diferentes com o mesmo número. Às vezes é família; às vezes é o telefone do Líder digitado no lugar do da pessoa. Quem divide o número não consegue entrar no painel."
          recolhida
        >
          <ListaQueCresce
            itens={visto.telefones}
            inicial={8}
            chave={(item) => item.telefone}
            rotulo="números"
            render={(item) => (
              <div className="rounded-control border border-line p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-900 tabular-nums">
                  <Phone aria-hidden="true" className="size-3.5 text-ink-400" />
                  {formatPhone(item.telefone)}
                  <span className="text-xs font-normal text-ink-500">
                    · {item.membros.length} pessoas
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.membros.map((member) => (
                    <PessoaChip key={member.id} member={member} onOpenMember={onOpenMember} />
                  ))}
                </div>
              </div>
            )}
          />
        </Secao>
      ) : null}

      {avisos.map((tipo) => (
        <SecaoDoTipo
          key={tipo}
          tipo={tipo}
          itens={porTipo.get(tipo) ?? []}
          onOpenMember={onOpenMember}
          recolhida
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Painel de cima: a nota e o resumo
   ------------------------------------------------------------------------- */

function Painel({
  diagnostico,
  certos,
  possiveis,
  incompletos,
  graves,
  avisos,
  filtro,
  exportar,
}: {
  diagnostico: Diagnostico;
  certos: number;
  possiveis: number;
  incompletos: number;
  graves: number;
  avisos: number;
  filtro: ReactNode;
  exportar: ReactNode;
}) {
  const { saude, total, pessoasComProblema } = diagnostico;
  const tom = saude >= 90 ? 'success' : saude >= 70 ? 'warning' : 'danger';

  const frase =
    total === 0
      ? 'Ninguém cadastrado ainda.'
      : pessoasComProblema === 0
        ? 'Todo mundo com o cadastro em ordem.'
        : `${formatNumber(pessoasComProblema)} de ${formatNumber(total)} ${
            pessoasComProblema === 1 ? 'pessoa precisa' : 'pessoas precisam'
          } de atenção.`;

  const indicadores: { id: string; rotulo: string; valor: number; tom: keyof typeof CAIXA_DO_TOM }[] = [
    { id: 'repetidos', rotulo: 'repetidos', valor: certos, tom: 'danger' },
    { id: 'incompletos', rotulo: 'incompletos', valor: incompletos, tom: 'warning' },
    { id: 'graves', rotulo: 'com dado errado', valor: graves, tom: 'warning' },
    { id: 'possiveis', rotulo: 'possíveis repetidos', valor: possiveis, tom: 'neutral' },
    { id: 'avisos', rotulo: 'avisos', valor: avisos, tom: 'neutral' },
  ];

  return (
    <section
      aria-labelledby="saude-do-cadastro"
      className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Anel percentual={saude} tom={tom} />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Saúde do cadastro
          </p>
          <h2 id="saude-do-cadastro" className="mt-1 text-lg font-bold text-ink-900 sm:text-xl">
            {frase}
          </h2>

          <ul className="mt-3 flex flex-wrap gap-2">
            {indicadores.map((item) => (
              <li key={item.id}>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium',
                    item.valor > 0 ? CAIXA_DO_TOM[item.tom] : 'bg-ink-50 text-ink-400',
                  )}
                >
                  <strong className="tabular-nums">{formatNumber(item.valor)}</strong>
                  {item.rotulo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {filtro || exportar ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          {filtro ?? <span />}
          {exportar}
        </div>
      ) : null}
    </section>
  );
}

/** Anel da nota: cheio de verde quando o cadastro esta limpo. */
function Anel({ percentual, tom }: { percentual: number; tom: 'success' | 'warning' | 'danger' }) {
  const raio = 40;
  const circunferencia = 2 * Math.PI * raio;
  const cor = { success: 'text-success-600', warning: 'text-warning-600', danger: 'text-danger-600' }[tom];

  return (
    <div className="relative size-28 shrink-0 self-center sm:self-auto">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={raio} fill="none" strokeWidth="10" className="stroke-ink-100" />
        <circle
          cx="50"
          cy="50"
          r={raio}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          className={cn(cor, 'transition-[stroke-dashoffset] duration-700')}
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - percentual / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-bold tabular-nums', cor)}>{percentual}%</span>
        <span className="text-[0.625rem] font-medium text-ink-500">em ordem</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Secao recolhivel
   ------------------------------------------------------------------------- */

function Secao({
  id,
  icone,
  tom,
  titulo,
  quantidade,
  descricao,
  recolhida = false,
  children,
}: {
  id: string;
  icone: ReactNode;
  tom: 'danger' | 'warning' | 'neutral';
  titulo: string;
  quantidade: number;
  descricao: string;
  recolhida?: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(!recolhida);

  return (
    <section
      id={`inconsistencia-${id}`}
      aria-labelledby={`inconsistencia-${id}-titulo`}
      className="rounded-card border border-line bg-surface shadow-card"
    >
      <button
        type="button"
        onClick={() => setAberta((valor) => !valor)}
        aria-expanded={aberta}
        className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span
          aria-hidden="true"
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-control', CAIXA_DO_TOM[tom])}
        >
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span id={`inconsistencia-${id}-titulo`} className="text-base font-semibold text-ink-900">
              {titulo}
            </span>
            <span className={cn('rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums', CAIXA_DO_TOM[tom])}>
              {formatNumber(quantidade)}
            </span>
          </span>
          <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-500">{descricao}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('mt-2 size-4 shrink-0 text-ink-400 transition-transform', aberta && 'rotate-180')}
        />
      </button>

      {aberta ? <div className="border-t border-line px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

function SecaoDoTipo({
  tipo,
  itens,
  onOpenMember,
  recolhida = false,
}: {
  tipo: TipoDaFicha;
  itens: ProblemaDaFicha[];
  onOpenMember: (id: string) => void;
  recolhida?: boolean;
}) {
  const info = TIPO_INFO[tipo];
  return (
    <Secao
      id={tipo}
      icone={ICONE_DO_TIPO[tipo]}
      tom={TOM_DA_GRAVIDADE[info.gravidade]}
      titulo={info.titulo}
      quantidade={itens.length}
      descricao={info.explicacao}
      recolhida={recolhida}
    >
      <ListaQueCresce
        itens={itens}
        inicial={10}
        chave={(item) => `${item.tipo}-${item.member.id}`}
        rotulo="pessoas"
        compacta
        render={(item) => (
          <LinhaDaPessoa member={item.member} onOpenMember={onOpenMember}>
            <span className="text-danger-700">{item.detalhe}</span>
          </LinhaDaPessoa>
        )}
      />
    </Secao>
  );
}

/* -------------------------------------------------------------------------
   Um grupo de cadastros repetidos
   ------------------------------------------------------------------------- */

function CartaoRepetido({
  grupo,
  onOpenMember,
}: {
  grupo: GrupoRepetido;
  onOpenMember: (id: string) => void;
}) {
  const tom = TOM_DA_CERTEZA[grupo.certeza];
  const motivos = motivosDosRegistros(grupo);
  // A mesma pessoa repetida pelo MESMO responsavel conta uma vez (so no
  // grupo certo): o cartao diz isso, para ninguem achar que o ranking inflou.
  const mesmoResponsavel =
    grupo.certeza === 'certa'
      ? (() => {
          const vezes = new Map<string, number>();
          for (const { member } of grupo.registros) {
            const quem = recruiterText(member.recruitedBy);
            vezes.set(quem, (vezes.get(quem) ?? 0) + 1);
          }
          return [...vezes.entries()].filter(([, n]) => n > 1).map(([quem]) => quem).join(' e ');
        })()
      : '';

  return (
    <article className="rounded-control border border-line">
      <header className="flex items-start gap-2 border-b border-line bg-ink-50/60 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-[0.6875rem] font-semibold text-ink-500 ring-1 ring-line"
        >
          {initials(grupo.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words text-ink-900">{grupo.nome}</p>
          <p className="text-xs text-ink-500">{grupo.registros.length} registros</p>
        </div>
        <Badge tone={tom} className="shrink-0">
          {CERTEZA_ROTULO[grupo.certeza]}
        </Badge>
      </header>

      {/* POR QUE e a mesma pessoa, em destaque (sem mostrar o dado): e a primeira
          coisa que se le no cartao, e nao uma linha miuda abaixo do nome. */}
      <div className={cn('flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5', FUNDO_DO_MOTIVO[tom])}>
        <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-500 uppercase">
          Por que é a mesma pessoa
        </span>
        {grupo.evidencias.map((evidencia) => (
          <span
            key={evidencia}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-control border px-2.5 py-1 text-sm font-semibold',
              CHIP_DO_MOTIVO[tom],
            )}
          >
            <Fingerprint aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">
              {EVIDENCIA_INFO[evidencia].rotulo}
            </span>
          </span>
        ))}
      </div>

      {grupo.responsaveis.length > 1 || mesmoResponsavel ? (
        <div className="space-y-1 border-b border-line px-3 py-2 text-xs">
          {mesmoResponsavel ? (
            <p className="text-ink-700">
              Cadastrado mais de uma vez por{' '}
              <strong className="font-semibold text-ink-900">{mesmoResponsavel}</strong>:{' '}
              <strong className="font-semibold text-ink-900">conta uma vez só</strong> para ele.
            </p>
          ) : null}
          {grupo.responsaveis.length > 1 ? (
            <p className="flex items-start gap-1.5 text-warning-600">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Conta para {grupo.responsaveis.length} responsáveis no ranking:{' '}
                <strong className="font-semibold">{grupo.responsaveis.join(' e ')}</strong>.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Linha do tempo: do primeiro cadastro para o ultimo. */}
      <ol className="relative px-3 py-2">
        {grupo.registros.map(({ member, primeiro }, indice) => (
          <li key={member.id} className="relative flex gap-3 py-2">
            <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center">
              {indice < grupo.registros.length - 1 ? (
                <span className="absolute top-4 bottom-[-1rem] w-px bg-line" />
              ) : null}
              <span
                className={cn(
                  'relative mt-1 size-2.5 rounded-full ring-4 ring-surface',
                  primeiro ? 'bg-success-600' : 'bg-danger-600',
                )}
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenMember(member.id)}
                  className="truncate text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  {member.name}
                </button>
                {primeiro ? (
                  <Badge tone="success">1º cadastro</Badge>
                ) : (
                  <Badge tone="danger">{indice + 1}º cadastro</Badge>
                )}
                <TierBadge tier={member.tier} />
                <LiderDesativado member={member} />
                {/* O motivo DESTE registro: o que ele repete de outro do grupo. */}
                {(motivos.get(member.id) ?? []).map((evidencia) => (
                  <span
                    key={evidencia}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[0.6875rem] font-semibold',
                      CHIP_DO_MOTIVO[tom],
                    )}
                  >
                    <Fingerprint aria-hidden="true" className="size-3 shrink-0" />
                    {EVIDENCIA_INFO[evidencia].rotulo}
                  </span>
                ))}
              </div>

              {/* So o que serve para decidir qual fica: quem cadastrou, o
                  telefone e onde vota. */}
              <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-ink-500 sm:grid-cols-3">
                <Dado rotulo="Por">{recruiterText(member.recruitedBy)}</Dado>
                <Dado rotulo="Telefone">{member.phone ? formatPhone(member.phone) : '—'}</Dado>
                <Dado rotulo="Vota em">
                  {member.zone || member.section
                    ? `Zona ${member.zone || '?'} · Seção ${member.section || '?'}`
                    : '—'}
                </Dado>
              </dl>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="shrink-0 text-ink-400">{rotulo}:</dt>
      <dd className="truncate text-ink-700">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Cadastros incompletos
   ------------------------------------------------------------------------- */

function Incompletos({
  diagnostico,
  itens,
  filtrado,
  onOpenMember,
}: {
  diagnostico: Diagnostico;
  itens: { member: Member; faltas: string[] }[];
  filtrado: boolean;
  onOpenMember: (id: string) => void;
}) {
  // As contagens seguem o recorte: com um responsavel escolhido, o "o que
  // mais falta" e o DELE.
  const porCampo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of itens) for (const campo of item.faltas) mapa.set(campo, (mapa.get(campo) ?? 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);
  const maior = porCampo[0]?.[1] ?? 0;

  return (
    <div className="space-y-5">
      <div className={cn('grid gap-5', !filtrado && 'lg:grid-cols-2')}>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            O que mais falta
          </p>
          <ul className="space-y-2">
            {porCampo.map(([campo, quantidade]) => (
              <li key={campo} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate text-ink-700 first-letter:uppercase">{campo}</span>
                <span className="h-2 overflow-hidden rounded-pill bg-ink-100">
                  <span
                    className="block h-full rounded-pill bg-warning-600"
                    style={{ width: `${maior ? Math.max(4, (quantidade / maior) * 100) : 0}%` }}
                  />
                </span>
                <span className="text-right font-semibold text-ink-900 tabular-nums">
                  {formatNumber(quantidade)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!filtrado && diagnostico.incompletos.porResponsavel.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              De quem são
            </p>
            <ul className="divide-y divide-line">
              {diagnostico.incompletos.porResponsavel.slice(0, 6).map((linha) => (
                <li key={linha.chave} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-700">{linha.responsavel}</span>
                  <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                    {formatNumber(linha.incompletos)} de {formatNumber(linha.total)}
                  </span>
                  <span
                    className={cn(
                      'w-12 shrink-0 rounded-pill px-2 py-0.5 text-center text-xs font-semibold tabular-nums',
                      linha.percentual >= 50 ? CAIXA_DO_TOM.danger : CAIXA_DO_TOM.warning,
                    )}
                  >
                    {linha.percentual}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Quem completar</p>
        <ListaQueCresce
          itens={itens}
          inicial={10}
          chave={(item) => item.member.id}
          rotulo="pessoas"
          compacta
          render={(item) => (
            <LinhaDaPessoa member={item.member} onOpenMember={onOpenMember}>
              <span className="text-warning-600">falta {resumoDasFaltas(item.faltas, 3)}</span>
            </LinhaDaPessoa>
          )}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Pecas pequenas
   ------------------------------------------------------------------------- */

function LinhaDaPessoa({
  member,
  onOpenMember,
  children,
}: {
  member: Member;
  onOpenMember: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenMember(member.id)}
      className="group flex w-full items-center gap-3 py-2.5 text-left"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500"
      >
        {initials(member.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
            {member.name}
          </span>
          <TierBadge tier={member.tier} className="px-1.5 py-0 text-[0.625rem]" />
          <LiderDesativado member={member} className="px-1.5 py-0 text-[0.625rem]" />
        </span>
        <span className="block truncate text-xs">
          {children}
          <span className="text-ink-400"> · {recruiterText(member.recruitedBy)}</span>
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
      />
    </button>
  );
}

function PessoaChip({ member, onOpenMember }: { member: Member; onOpenMember: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenMember(member.id)}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-brand-700 hover:text-brand-700"
    >
      {member.name}
      <span className="text-ink-400">· {recruiterText(member.recruitedBy).split(' · ')[0]}</span>
    </button>
  );
}

/** Lista longa aparece aos poucos: o quadro abre leve mesmo com mil linhas. */
function ListaQueCresce<T>({
  itens,
  inicial,
  chave,
  render,
  rotulo,
  compacta = false,
}: {
  itens: T[];
  inicial: number;
  chave: (item: T) => string;
  render: (item: T) => ReactNode;
  rotulo: string;
  compacta?: boolean;
}) {
  const [limite, setLimite] = useState(inicial);
  const visiveis = itens.slice(0, limite);
  const restam = itens.length - visiveis.length;

  return (
    <div>
      <ul className={compacta ? 'divide-y divide-line' : 'space-y-3'}>
        {visiveis.map((item) => (
          <li key={chave(item)}>{render(item)}</li>
        ))}
      </ul>
      {restam > 0 ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimite((valor) => valor + inicial * 3)}>
            <ChevronDown aria-hidden="true" className="size-4" />
            Mostrar mais {formatNumber(Math.min(restam, inicial * 3))} de {formatNumber(restam)} {rotulo}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Lider desativado pelo ADMIN geral. A pessoa continua aparecendo aqui — o
 * cadastro dela segue valendo para as contas —, mas com a etiqueta, para
 * ninguem confundir com um Lider ativo. So em Lider: na Equipe nao existe
 * "desativado".
 */
function LiderDesativado({ member, className }: { member: Member; className?: string }) {
  if (member.tier !== 'LIDER' || member.access !== 'DISABLED') return null;
  return (
    <Badge tone="danger" className={cn('whitespace-nowrap', className)}>
      Líder desativado
    </Badge>
  );
}
