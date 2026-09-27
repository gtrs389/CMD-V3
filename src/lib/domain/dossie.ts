import type { Client, Member, TeamTier } from '@/lib/types';
import { genderLabel } from '@/lib/utils/documents';
import { normalizeSearch } from '@/lib/utils/text';
import { recruiterText } from './recruitment';
import { camposFaltantes } from './member-completeness';
import { dadosParaConferir } from './conferencia';
import {
  CERTEZA_ROTULO,
  EVIDENCIA_INFO,
  TIPO_INFO,
  TIPOS,
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

export interface GrupoRepetidoNoDossie {
  nome: string;
  certeza: string;
  evidencias: string[];
  registros: { nome: string; cadastradoPor: string; cadastradoEm: string; primeiro: boolean }[];
  responsaveis: string[];
}

export interface ProblemaNoDossie {
  tipo: TipoDaFicha;
  titulo: string;
  gravidade: 'alta' | 'media' | 'baixa';
  pessoas: { nome: string; detalhe: string; cadastradoPor: string }[];
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
  >,
  members: readonly Member[],
  agora: Date = new Date(),
): Dossie {
  const referencia = municipioDaOperacao({ stateUf: client.stateUf, cities: client.cities });
  const diagnostico = diagnosticar(members, referencia);

  const ts = (m: Member) => new Date(m.createdAt).getTime();
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

  const lideres: LiderNoDossie[] = lideresBrutos
    .map((l) => {
      const equipe = l.userId ? (porResponsavel.get(l.userId) ?? []) : [];
      const ultimo = equipe.reduce<string | null>(
        (maior, m) => (!maior || m.createdAt > maior ? m.createdAt : maior),
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
        incompletos: equipe.filter((m) => camposFaltantes(m).length > 0).length,
        paraConferir: equipe.filter((m) => dadosParaConferir(m).length > 0).length,
        ultimoCadastro: ultimo,
        temAcesso: l.access === 'ACTIVE',
      };
    })
    .sort((a, b) => b.equipe - a.equipe || a.nome.localeCompare(b.nome, 'pt-BR'));

  const lideresAtivos = lideres.filter((l) => l.equipe > 0).length;

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
      repetidos: certos.map((g) => ({
        nome: g.nome,
        certeza: CERTEZA_ROTULO[g.certeza],
        evidencias: g.evidencias.map((e) => EVIDENCIA_INFO[e].rotulo),
        registros: g.registros.map((r) => ({
          nome: r.member.name,
          cadastradoPor: recruiterText(r.member.recruitedBy),
          cadastradoEm: r.member.createdAt,
          primeiro: r.primeiro,
        })),
        responsaveis: g.responsaveis,
      })),
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
  };
}
