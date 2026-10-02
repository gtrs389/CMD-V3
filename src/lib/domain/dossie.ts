import type { Client, Member, TeamTier } from '@/lib/types';
import { genderLabel, isValidVoterId, normalizeVoterId } from '@/lib/utils/documents';
import { normalizeSearch } from '@/lib/utils/text';
import { recruiterText } from './recruitment';
import { camposFaltantes } from './member-completeness';
import { dadosParaConferir } from './conferencia';
import { seloDoLider, type Selo } from './perfil-do-lider';
import { grupoRepetidoParaPdf, type GrupoRepetidoParaPdf } from './repetidos-pdf';
import {
  TIPO_INFO,
  TIPOS,
  contandoUmaVez,
  diagnosticar,
  municipioDaOperacao,
  type TipoDaFicha,
} from './inconsistencias';

/**
 * O dossie do time: TUDO o que o sistema sabe dele, em numeros.
 *
 * E a base do relatorio do NEO. A divisao de trabalho e deliberada:
 *
 *   os NUMEROS saem daqui, calculados do banco — contagens, ranking, lista
 *   de pessoas, inconsistencias. Nada disso passa pela IA, e por isso nada
 *   disso pode ser inventado;
 *
 *   o NEO recebe um RESUMO destes numeros (`neo.ts`) e escreve a analise:
 *   o que eles querem dizer, o que preocupa, o que fazer.
 *
 * Um relatorio em que a IA contasse as pessoas seria um relatorio que erra a
 * conta de vez em quando — e ninguem saberia quando.
 *
 * Funcao pura: roda igual no servidor e nos testes.
 */

export interface PessoaNoDossie {
  id: string;
  /** Usuario de quem cadastrou: e o que agrupa a pessoa sob o Lider dela. */
  responsavelId: string | null;
  nome: string;
  nivel: TeamTier;
  cadastradoPor: string;
  telefone: string;
  bairro: string;
  rua: string;
  zona: string;
  secao: string;
  cadastradoEm: string;
  viaLink: boolean;
  faltas: string[];
  conferir: string[];
}

export interface LiderNoDossie {
  id: string;
  /** Usuario do Lider: nulo enquanto ele nao tem acesso. */
  usuarioId: string | null;
  nome: string;
  telefone: string;
  cadastradoPor: string;
  desde: string;
  /** Quantas pessoas ele cadastrou (a Equipe dele). */
  equipe: number;
  /** Parte do total de cadastros feitos por Lideres, de 0 a 100. */
  participacao: number;
  equipeUltimos7: number;
  equipeUltimos30: number;
  /** Posicao no ranking, 1 = quem mais trouxe. */
  posicao: number;
  /** Motor, Constante, Esfriando, Parado ou Sem Equipe — a regra do painel. */
  selo: Selo;
  /** Parte da Equipe dele sem falta nem dado para conferir, de 0 a 100. */
  integridade: number;
  incompletos: number;
  paraConferir: number;
  ultimoCadastro: string | null;
  temAcesso: boolean;
}

export interface AdministradorNoDossie {
  nome: string;
  telefone: string;
  /** Lideres que ele cadastrou. */
  cadastrou: number;
}

export interface Contagem {
  rotulo: string;
  quantidade: number;
}

/** No formato do cartao da tela: o PDF mostra o mesmo cartao. */
export type GrupoRepetidoNoDossie = GrupoRepetidoParaPdf;

export interface ProblemaNoDossie {
  tipo: TipoDaFicha;
  titulo: string;
  gravidade: 'alta' | 'media' | 'baixa';
  pessoas: { nome: string; detalhe: string; cadastradoPor: string }[];
}

export interface ComponenteDoIndice {
  rotulo: string;
  /** 0 a 100. */
  valor: number;
  /** Peso na conta, em %. */
  peso: number;
  explicacao: string;
}

export type RotuloDoIndice = 'Crítico' | 'Em atenção' | 'Estável' | 'Forte' | 'Excelente';

/**
 * A leitura estrategica, CALCULADA: o que um dirigente quer saber da rede,
 * em numeros que o sistema garante. O NEO interpreta estes numeros; nao
 * inventa nenhum deles.
 */
export interface Estrategia {
  /** Tudo o que esta no cadastro. */
  baseDeclarada: number;
  /** Cadastros repetidos da mesma pessoa, a mais. */
  duplicados: number;
  /** Pessoas, contadas uma vez so. */
  baseLiquida: number;
  /** Parte dos Lideres que ja trouxe alguem, de 0 a 100. */
  ativacao: number;
  /** Lideres que cadastraram alguem nos ultimos 30 dias. */
  lideresRecentes: number;
  /** Parte dos Lideres que cadastrou nos ultimos 30 dias, de 0 a 100. */
  engajamento: number;
  /** Pessoas trazidas por Lider ativo. */
  multiplicador: number;
  /** Parte da Equipe trazida pelos 3 maiores Lideres, de 0 a 100. */
  concentracaoTop3: number;
  /** Quantos Lideres, juntos, trouxeram 80% da Equipe. */
  lideresPara80: number;
  /** Lideres por tamanho de Equipe. */
  faixas: Contagem[];
  /** Lideres por selo. */
  selos: Contagem[];
  eleitoral: {
    /** Titulo com 12 digitos que fecha o digito verificador. */
    tituloValido: number;
    tituloValidoPct: number;
    /** Zona e secao preenchidas: da para achar o local de votacao. */
    zonaSecao: number;
    zonaSecaoPct: number;
    bairros: number;
    zonas: number;
    secoes: number;
    /** Parte da base nos 3 bairros com mais gente, de 0 a 100. */
    concentracaoTop3Bairros: number;
  };
  /** Mantido o ritmo dos ultimos 30 dias. Nulo sem cadastro recente. */
  projecao: { ritmoDia: number; em30: number; em60: number; em90: number } | null;
  /** Total acumulado no fim de cada uma das 12 semanas. */
  acumulado: number[];
  indice: { valor: number; rotulo: RotuloDoIndice; componentes: ComponenteDoIndice[] };
}

export function rotuloDoIndice(valor: number): RotuloDoIndice {
  if (valor >= 85) return 'Excelente';
  if (valor >= 70) return 'Forte';
  if (valor >= 55) return 'Estável';
  if (valor >= 40) return 'Em atenção';
  return 'Crítico';
}

export interface Dossie {
  geradoEm: string;
  time: {
    nome: string;
    uf: string;
    municipios: string[];
    demonstracao: boolean;
    criadoEm: string;
    confirmacaoDeDados: boolean;
  };
  numeros: {
    total: number;
    administradores: number;
    lideres: number;
    equipe: number;
    viaLink: number;
    viaPainel: number;
    comAcesso: number;
    hoje: number;
    ultimos7: number;
    ultimos30: number;
    /** Cadastros por dia, na media dos ultimos 30. */
    ritmo30: number;
    /** Variacao dos ultimos 7 dias contra os 7 anteriores, em %. */
    variacao7: number;
    /** Lideres que ja cadastraram alguem. */
    lideresAtivos: number;
    /** Tamanho medio da Equipe, entre os Lideres ativos. */
    equipeMedia: number;
  };
  administradores: AdministradorNoDossie[];
  lideres: LiderNoDossie[];
  /** As ultimas 12 semanas, da mais antiga para a mais recente. */
  crescimento: { inicio: string; quantidade: number }[];
  genero: Contagem[];
  territorio: {
    bairros: Contagem[];
    zonas: Contagem[];
    secoes: Contagem[];
    semBairro: number;
    semSecao: number;
  };
  qualidade: {
    saude: number;
    pessoasComProblema: number;
    excedentes: number;
    repetidos: GrupoRepetidoNoDossie[];
    possiveisRepetidos: number;
    telefonesCompartilhados: number;
    incompletos: number;
    faltasPorCampo: Contagem[];
    paraConferir: number;
    conferirPorMotivo: Contagem[];
    problemas: ProblemaNoDossie[];
  };
  pessoas: PessoaNoDossie[];
  estrategia: Estrategia;
}

const DIA = 86_400_000;

function contar(valores: string[], limite = 10): Contagem[] {
  const mapa = new Map<string, { rotulo: string; quantidade: number }>();
  for (const valor of valores) {
    const rotulo = valor.trim();
    if (!rotulo) continue;
    const chave = normalizeSearch(rotulo);
    const atual = mapa.get(chave);
    if (atual) atual.quantidade += 1;
    else mapa.set(chave, { rotulo, quantidade: 1 });
  }
  return [...mapa.values()]
    .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .slice(0, limite);
}

/** "telefone com 9 digitos" e "telefone com 10 digitos" contam juntos. */
function motivo(texto: string): string {
  return texto.replace(/ com \d+ d[ií]gitos?/, ' com dígitos a menos ou a mais');
}

function inicioDaSemana(data: Date): Date {
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const semana = (dia.getDay() + 6) % 7; // segunda-feira = 0
  return new Date(dia.getTime() - semana * DIA);
}

export function montarDossie(
  client: Pick<
    Client,
    'name' | 'stateUf' | 'cities' | 'isDemo' | 'createdAt' | 'verificationEnabled' | 'people'
  > & Partial<Pick<Client, 'inconsistenciasDesligadas'>>,
  todos: readonly Member[],
  agora: Date = new Date(),
): Dossie {
  const referencia = municipioDaOperacao({ stateUf: client.stateUf, cities: client.cities });
  const diagnostico = diagnosticar(todos, referencia, client.inconsistenciasDesligadas ?? []);
  // Para CONTAR: a mesma pessoa cadastrada duas vezes pelo mesmo Lider conta
  // uma vez — no total, na Equipe de cada Lider e no ranking.
  const members = contandoUmaVez(todos);

  // Sem "DATA DE CADASTRO" na planilha nao ha data: fica fora de todo recorte
  // por periodo (conta no total, nunca em "ultimos 7 dias").
  const ts = (m: Member) => (m.semDataDeCadastro ? -Infinity : new Date(m.createdAt).getTime());
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const dentro = (dias: number) => members.filter((m) => ts(m) > agora.getTime() - dias * DIA);
  const ultimos7 = dentro(7).length;
  const anteriores7 = members.filter(
    (m) => ts(m) <= agora.getTime() - 7 * DIA && ts(m) > agora.getTime() - 14 * DIA,
  ).length;
  const ultimos30 = dentro(30).length;

  // Equipe de cada usuario: e o snapshot de origem que diz quem trouxe quem.
  const porResponsavel = new Map<string, Member[]>();
  for (const m of members) {
    const id = m.recruitedBy?.userId;
    if (!id) continue;
    porResponsavel.set(id, [...(porResponsavel.get(id) ?? []), m]);
  }

  const lideresBrutos = members.filter((m) => m.tier === 'LIDER');
  const cadastrosDeLideres = lideresBrutos.reduce(
    (soma, l) => soma + (l.userId ? (porResponsavel.get(l.userId)?.length ?? 0) : 0),
    0,
  );

  const temProblema = (m: Member) => camposFaltantes(m).length > 0 || dadosParaConferir(m).length > 0;

  const lideresSemPosicao = lideresBrutos
    .map((l) => {
      const equipe = l.userId ? (porResponsavel.get(l.userId) ?? []) : [];
      const ultimo = equipe.reduce<string | null>(
        (maior, m) => (m.semDataDeCadastro ? maior : !maior || m.createdAt > maior ? m.createdAt : maior),
        null,
      );
      return {
        id: l.id,
        usuarioId: l.userId,
        nome: l.name,
        telefone: l.phone,
        cadastradoPor: recruiterText(l.recruitedBy),
        desde: l.createdAt,
        equipe: equipe.length,
        participacao: cadastrosDeLideres
          ? Math.round((equipe.length / cadastrosDeLideres) * 1000) / 10
          : 0,
        equipeUltimos7: equipe.filter((m) => ts(m) > agora.getTime() - 7 * DIA).length,
        equipeUltimos30: equipe.filter((m) => ts(m) > agora.getTime() - 30 * DIA).length,
        integridade: equipe.length
          ? Math.round(((equipe.length - equipe.filter(temProblema).length) / equipe.length) * 100)
          : 100,
        incompletos: equipe.filter((m) => camposFaltantes(m).length > 0).length,
        paraConferir: equipe.filter((m) => dadosParaConferir(m).length > 0).length,
        ultimoCadastro: ultimo,
        temAcesso: l.access === 'ACTIVE',
      };
    })
    .sort((a, b) => b.equipe - a.equipe || a.nome.localeCompare(b.nome, 'pt-BR'));

  const lideresAtivos = lideresSemPosicao.filter((l) => l.equipe > 0).length;
  const lideres: LiderNoDossie[] = lideresSemPosicao.map((l, i) => ({
    ...l,
    posicao: i + 1,
    selo: seloDoLider({
      equipe: l.equipe,
      ultimos7: l.equipeUltimos7,
      ultimos30: l.equipeUltimos30,
      posicao: i + 1,
      ativos: lideresAtivos,
    }),
  }));

  // Administradores: quantos Lideres cada um trouxe, pelo nome gravado na
  // origem — a pessoa do time nao tem usuario proprio exposto aqui.
  const administradores: AdministradorNoDossie[] = client.people.map((p) => ({
    nome: p.name,
    telefone: p.phone,
    cadastrou: members.filter(
      (m) =>
        m.recruitedBy?.role === 'CANDIDATE' &&
        normalizeSearch(m.recruitedBy.name) === normalizeSearch(p.name),
    ).length,
  }));

  // Crescimento: 12 semanas, segunda a domingo, a ultima e a atual.
  const semanaAtual = inicioDaSemana(agora).getTime();
  const crescimento = Array.from({ length: 12 }, (_, i) => {
    const inicio = semanaAtual - (11 - i) * 7 * DIA;
    const fim = inicio + 7 * DIA;
    return {
      inicio: new Date(inicio).toISOString(),
      quantidade: members.filter((m) => ts(m) >= inicio && ts(m) < fim).length,
    };
  });

  const pessoas: PessoaNoDossie[] = [...members]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((m) => ({
      id: m.id,
      responsavelId: m.recruitedBy?.userId ?? null,
      nome: m.name,
      nivel: m.tier,
      cadastradoPor: recruiterText(m.recruitedBy),
      telefone: m.phone ?? '',
      bairro: m.district ?? '',
      rua: m.street ?? '',
      zona: m.zone ?? '',
      secao: m.section ?? '',
      cadastradoEm: m.createdAt,
      viaLink: m.source === 'invite',
      faltas: camposFaltantes(m),
      conferir: dadosParaConferir(m),
    }));

  const problemas: ProblemaNoDossie[] = TIPOS.map((tipo) => {
    const itens = diagnostico.problemas.filter((p) => p.tipo === tipo);
    return {
      tipo,
      titulo: TIPO_INFO[tipo].titulo,
      gravidade: TIPO_INFO[tipo].gravidade,
      pessoas: itens.map((p) => ({
        nome: p.member.name,
        detalhe: p.detalhe,
        cadastradoPor: recruiterText(p.member.recruitedBy),
      })),
    };
  }).filter((p) => p.pessoas.length > 0);

  const certos = diagnostico.repetidos.filter((g) => g.certeza !== 'possivel');

  const estrategia = leituraEstrategica({
    members,
    lideres,
    lideresAtivos,
    cadastrosDeLideres,
    excedentes: diagnostico.excedentes,
    saude: diagnostico.saude,
    ultimos30,
    crescimento,
  });

  return {
    geradoEm: agora.toISOString(),
    time: {
      nome: client.name,
      uf: referencia.state,
      municipios: referencia.cities,
      demonstracao: client.isDemo,
      criadoEm: client.createdAt,
      confirmacaoDeDados: client.verificationEnabled !== false,
    },
    numeros: {
      total: members.length,
      administradores: client.people.length,
      lideres: lideresBrutos.length,
      equipe: members.length - lideresBrutos.length,
      viaLink: members.filter((m) => m.source === 'invite').length,
      viaPainel: members.filter((m) => m.source !== 'invite').length,
      comAcesso: members.filter((m) => m.access === 'ACTIVE').length,
      hoje: members.filter((m) => ts(m) >= hoje0).length,
      ultimos7,
      ultimos30,
      ritmo30: Math.round((ultimos30 / 30) * 10) / 10,
      variacao7:
        anteriores7 === 0
          ? ultimos7 > 0
            ? 100
            : 0
          : Math.round(((ultimos7 - anteriores7) / anteriores7) * 100),
      lideresAtivos,
      equipeMedia: lideresAtivos
        ? Math.round((cadastrosDeLideres / lideresAtivos) * 10) / 10
        : 0,
    },
    administradores,
    lideres,
    crescimento,
    genero: contar(members.map((m) => genderLabel(m.gender) ?? 'Não informado')),
    territorio: {
      bairros: contar(members.map((m) => m.district ?? ''), 12),
      zonas: contar(members.map((m) => (m.zone ? `Zona ${m.zone}` : '')), 8),
      secoes: contar(
        members.map((m) => (m.zone && m.section ? `Zona ${m.zone} · Seção ${m.section}` : '')),
        10,
      ),
      semBairro: members.filter((m) => !m.district?.trim()).length,
      semSecao: members.filter((m) => !m.zone?.trim() || !m.section?.trim()).length,
    },
    qualidade: {
      saude: diagnostico.saude,
      pessoasComProblema: diagnostico.pessoasComProblema,
      excedentes: diagnostico.excedentes,
      repetidos: certos.map(grupoRepetidoParaPdf),
      possiveisRepetidos: diagnostico.repetidos.length - certos.length,
      telefonesCompartilhados: diagnostico.telefones.length,
      incompletos: diagnostico.incompletos.membros.length,
      faltasPorCampo: diagnostico.incompletos.porCampo.map((f) => ({
        rotulo: f.campo,
        quantidade: f.quantidade,
      })),
      paraConferir: pessoas.filter((p) => p.conferir.length > 0).length,
      conferirPorMotivo: contar(pessoas.flatMap((p) => p.conferir.map(motivo))),
      problemas,
    },
    pessoas,
    estrategia,
  };
}

const pctDe = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

/** A leitura estrategica: tudo contado, nada estimado — so a projecao, que diz que e. */
function leituraEstrategica(x: {
  members: readonly Member[];
  lideres: LiderNoDossie[];
  lideresAtivos: number;
  cadastrosDeLideres: number;
  excedentes: number;
  saude: number;
  ultimos30: number;
  crescimento: { inicio: string; quantidade: number }[];
}): Estrategia {
  const { members, lideres } = x;
  const total = members.length;
  const baseLiquida = total - x.excedentes;

  const lideresRecentes = lideres.filter((l) => l.equipeUltimos30 > 0).length;
  const ativacao = pctDe(x.lideresAtivos, lideres.length);
  const engajamento = pctDe(lideresRecentes, lideres.length);

  // Concentracao: quanto da Equipe depende de poucos.
  const tamanhos = lideres.map((l) => l.equipe).sort((a, b) => b - a);
  const top3 = tamanhos.slice(0, 3).reduce((soma, v) => soma + v, 0);
  let acumulado80 = 0;
  let lideresPara80 = 0;
  for (const tamanho of tamanhos) {
    if (x.cadastrosDeLideres === 0 || acumulado80 >= x.cadastrosDeLideres * 0.8) break;
    acumulado80 += tamanho;
    lideresPara80 += 1;
  }

  const faixa = (min: number, max: number) => lideres.filter((l) => l.equipe >= min && l.equipe <= max).length;
  const faixas: Contagem[] = [
    { rotulo: 'Sem Equipe ainda', quantidade: faixa(0, 0) },
    { rotulo: '1 a 5 pessoas', quantidade: faixa(1, 5) },
    { rotulo: '6 a 15 pessoas', quantidade: faixa(6, 15) },
    { rotulo: '16 a 30 pessoas', quantidade: faixa(16, 30) },
    { rotulo: 'Mais de 30 pessoas', quantidade: faixa(31, Number.MAX_SAFE_INTEGER) },
  ];
  const selos: Contagem[] = (['Motor', 'Constante', 'Esfriando', 'Parado', 'Sem Equipe'] as const).map((selo) => ({
    rotulo: selo,
    quantidade: lideres.filter((l) => l.selo === selo).length,
  }));

  const tituloValido = members.filter((m) => {
    const t = normalizeVoterId(m.voterId ?? '');
    return t.length === 12 && isValidVoterId(t);
  }).length;
  const zonaSecao = members.filter((m) => m.zone?.trim() && m.section?.trim()).length;
  const distintos = (valores: (string | null | undefined)[]) =>
    new Set(valores.map((v) => normalizeSearch(v ?? '')).filter(Boolean)).size;
  const porBairro = contar(members.map((m) => m.district ?? ''), 3);
  const top3Bairros = porBairro.reduce((soma, b) => soma + b.quantidade, 0);

  const ritmoDia = Math.round((x.ultimos30 / 30) * 10) / 10;
  const projecao =
    x.ultimos30 > 0
      ? {
          ritmoDia,
          em30: baseLiquida + Math.round((x.ultimos30 / 30) * 30),
          em60: baseLiquida + Math.round((x.ultimos30 / 30) * 60),
          em90: baseLiquida + Math.round((x.ultimos30 / 30) * 90),
        }
      : null;

  // Total no fim de cada semana: quem ja estava antes da primeira, mais o
  // que entrou semana a semana.
  const antes = members.filter((m) => new Date(m.createdAt).getTime() < new Date(x.crescimento[0]?.inicio ?? 0).getTime()).length;
  let soma = antes;
  const acumulado = x.crescimento.map((semana) => (soma += semana.quantidade));

  const tituloValidoPct = pctDe(tituloValido, total);
  const componentes: ComponenteDoIndice[] = [
    {
      rotulo: 'Ativação das lideranças',
      valor: ativacao,
      peso: 30,
      explicacao: 'Parte dos Líderes que já trouxe ao menos uma pessoa.',
    },
    {
      rotulo: 'Engajamento recente',
      valor: engajamento,
      peso: 30,
      explicacao: 'Parte dos Líderes que cadastrou alguém nos últimos 30 dias.',
    },
    {
      rotulo: 'Integridade da base',
      valor: x.saude,
      peso: 25,
      explicacao: 'Parte da base sem cadastro repetido, sem dado faltando e sem dado para conferir.',
    },
    {
      rotulo: 'Qualificação eleitoral',
      valor: tituloValidoPct,
      peso: 15,
      explicacao: 'Parte da base com título de eleitor completo e válido.',
    },
  ];
  const valor = total === 0 ? 0 : Math.round(componentes.reduce((s2, c) => s2 + (c.valor * c.peso) / 100, 0));

  return {
    baseDeclarada: total,
    duplicados: x.excedentes,
    baseLiquida,
    ativacao,
    lideresRecentes,
    engajamento,
    multiplicador: x.lideresAtivos ? Math.round((x.cadastrosDeLideres / x.lideresAtivos) * 10) / 10 : 0,
    concentracaoTop3: pctDe(top3, x.cadastrosDeLideres),
    lideresPara80,
    faixas,
    selos,
    eleitoral: {
      tituloValido,
      tituloValidoPct,
      zonaSecao,
      zonaSecaoPct: pctDe(zonaSecao, total),
      bairros: distintos(members.map((m) => m.district)),
      zonas: distintos(members.map((m) => m.zone)),
      secoes: distintos(members.map((m) => (m.zone?.trim() && m.section?.trim() ? `${m.zone}/${m.section}` : ''))),
      concentracaoTop3Bairros: pctDe(top3Bairros, total),
    },
    projecao,
    acumulado,
    indice: { valor, rotulo: rotuloDoIndice(valor), componentes },
  };
}
