import type { Member } from '@/lib/types';
import { isValidCpf, isValidVoterId, normalizeCpf, normalizeVoterId } from '@/lib/utils/documents';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';
import { normalizeSearch } from '@/lib/utils/text';
import { camposFaltantes } from './member-completeness';
import { recruiterKey, recruiterText, NO_RECRUITER_KEY } from './recruitment';
import { ENDERECO_FIXO } from './csv-import';

/**
 * Quadro de inconsistencias do time.
 *
 * Responde, de uma vez, a pergunta que ninguem consegue responder olhando a
 * lista: o que esta errado nesta equipe, onde, e por culpa de qual cadastro.
 *
 * Tudo e CALCULADO da lista que a pagina ja recebeu, no navegador — a mesma
 * lista, com o mesmo recorte de hierarquia que o servidor aplicou. Nada e
 * gravado: corrigiu a ficha, a inconsistencia some na hora, sem ninguem
 * precisar lembrar de "dar baixa".
 *
 * Os algoritmos sao por CHAVE, e nunca "cada um contra cada um": um Time
 * DEMO de cinco mil pessoas custaria doze milhoes de comparacoes, e o quadro
 * precisa abrir instantaneo.
 */

/* -------------------------------------------------------------------------
   Cadastros repetidos
   ------------------------------------------------------------------------- */

/**
 * Por que dois cadastros parecem a mesma pessoa, do mais forte ao mais
 * fraco. A ordem importa: o grupo e descrito pela evidencia MAIS forte que
 * une alguem a ele.
 */
export const EVIDENCIAS = ['titulo', 'cpf', 'nome-telefone', 'nome-secao', 'nome'] as const;
export type Evidencia = (typeof EVIDENCIAS)[number];

export type Certeza = 'certa' | 'provavel' | 'possivel';

export const EVIDENCIA_INFO: Record<Evidencia, { rotulo: string; certeza: Certeza }> = {
  titulo: { rotulo: 'Mesmo título de eleitor', certeza: 'certa' },
  cpf: { rotulo: 'Mesmo CPF', certeza: 'certa' },
  'nome-telefone': { rotulo: 'Mesmo nome e telefone', certeza: 'certa' },
  'nome-secao': { rotulo: 'Mesmo nome e mesma seção', certeza: 'provavel' },
  nome: { rotulo: 'Mesmo nome', certeza: 'possivel' },
};

export const CERTEZA_ROTULO: Record<Certeza, string> = {
  certa: 'Repetido com certeza',
  provavel: 'Muito provável',
  possivel: 'Possível repetição',
};

/** Palavras que nao distinguem ninguem: "Maria DA Silva" = "Maria Silva". */
const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/**
 * Nome comparavel: sem acento, sem caixa, sem pontuacao, sem conectivo e
 * sem espaco duplicado. "José  da Silva" e "JOSE SILVA" viram a mesma chave.
 *
 * Um nome so ("Maria") nao vira chave: ha Marias demais para isso ser
 * evidencia de alguma coisa.
 */
export function chaveDoNome(nome: string): string {
  const partes = normalizeSearch(nome)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((parte) => parte && !CONECTIVOS.has(parte));
  return partes.length >= 2 ? partes.join(' ') : '';
}

/** Um registro do grupo, com o que interessa para decidir qual fica. */
export interface RegistroRepetido {
  member: Member;
  /** O mais antigo do grupo: em geral o original. */
  primeiro: boolean;
}

export interface GrupoRepetido {
  /** Estavel entre renderizacoes: o id do registro mais antigo. */
  id: string;
  /** Nome como aparece no registro mais antigo. */
  nome: string;
  certeza: Certeza;
  /** Todas as evidencias que ligam os registros, da mais forte a mais fraca. */
  evidencias: Evidencia[];
  registros: RegistroRepetido[];
  /**
   * Responsaveis diferentes que contam esta pessoa. Mais de um quer dizer
   * que o ranking conta a mesma gente duas vezes — e que dois Lideres
   * acham que trouxeram a mesma pessoa.
   */
  responsaveis: string[];
  /** Campos em que os registros discordam entre si. */
  divergencias: string[];
}

/** Uniao-busca pequena: agrupa por qualquer evidencia em comum. */
class Conjuntos {
  private pai = new Map<string, string>();

  achar(x: string): string {
    let raiz = x;
    while (this.pai.has(raiz) && this.pai.get(raiz) !== raiz) raiz = this.pai.get(raiz)!;
    // Compressao do caminho: a proxima busca e direta.
    let atual = x;
    while (atual !== raiz) {
      const proximo = this.pai.get(atual) ?? raiz;
      this.pai.set(atual, raiz);
      atual = proximo;
    }
    if (!this.pai.has(raiz)) this.pai.set(raiz, raiz);
    return raiz;
  }

  unir(a: string, b: string): void {
    const ra = this.achar(a);
    const rb = this.achar(b);
    if (ra !== rb) this.pai.set(rb, ra);
  }
}

/** As chaves de cada evidencia para um cadastro. Vazia quando nao se aplica. */
function chavesDe(member: Member): Record<Evidencia, string> {
  const nome = chaveDoNome(member.name);
  const titulo = normalizeVoterId(member.voterId ?? '');
  const cpf = normalizeCpf(member.cpf ?? '');
  const telefone = normalizePhone(member.phone ?? '');
  const secao =
    member.zone?.trim() && member.section?.trim() ? `${member.zone.trim()}/${member.section.trim()}` : '';

  return {
    // Numero curto demais nao identifica: "1" repetido nao e a mesma pessoa.
    titulo: titulo.length >= 8 ? titulo : '',
    cpf: cpf.length === 11 ? cpf : '',
    'nome-telefone': nome && telefone.length >= 10 ? `${nome}|${telefone}` : '',
    'nome-secao': nome && secao ? `${nome}|${secao}` : '',
    nome,
  };
}

const CAMPOS_COMPARADOS: { rotulo: string; valor: (m: Member) => string }[] = [
  { rotulo: 'telefone', valor: (m) => normalizePhone(m.phone ?? '') },
  { rotulo: 'título', valor: (m) => normalizeVoterId(m.voterId ?? '') },
  { rotulo: 'zona/seção', valor: (m) => [m.zone, m.section].filter(Boolean).join('/') },
  { rotulo: 'bairro', valor: (m) => normalizeSearch(m.district) },
  { rotulo: 'rua', valor: (m) => normalizeSearch(m.street) },
];

/**
 * Onde os registros discordam. So conta o que esta PREENCHIDO nos dois
 * lados: um registro sem telefone nao "discorda" do outro, so esta
 * incompleto.
 */
function divergenciasEntre(membros: Member[]): string[] {
  return CAMPOS_COMPARADOS.filter(({ valor }) => {
    const preenchidos = new Set(membros.map(valor).filter(Boolean));
    return preenchidos.size > 1;
  }).map(({ rotulo }) => rotulo);
}

/**
 * Agrupa os cadastros que parecem ser a mesma pessoa.
 *
 * Qualquer evidencia em comum une dois cadastros, e a uniao e transitiva: se
 * A tem o titulo de B, e B tem o nome e o telefone de C, os tres sao o mesmo
 * grupo. O grupo recebe a certeza da evidencia MAIS FORTE que ele tem.
 *
 * "Mesmo nome" sozinho entra, como POSSIVEL: homonimo existe, e por isso a
 * tela diz "possivel", e nao "repetido". Esconder isso seria pior — e
 * exatamente o caso em que alguem precisa olhar.
 */
export function cadastrosRepetidos(members: readonly Member[]): GrupoRepetido[] {
  const conjuntos = new Conjuntos();
  const porChave = new Map<string, string>();
  const chaves = new Map<string, Record<Evidencia, string>>();

  for (const member of members) {
    const suas = chavesDe(member);
    chaves.set(member.id, suas);
    conjuntos.achar(member.id);

    for (const evidencia of EVIDENCIAS) {
      const chave = suas[evidencia];
      if (!chave) continue;
      const marcada = `${evidencia}:${chave}`;
      const outro = porChave.get(marcada);
      if (outro) conjuntos.unir(outro, member.id);
      else porChave.set(marcada, member.id);
    }
  }

  const grupos = new Map<string, Member[]>();
  for (const member of members) {
    const raiz = conjuntos.achar(member.id);
    const lista = grupos.get(raiz) ?? [];
    lista.push(member);
    grupos.set(raiz, lista);
  }

  const resultado: GrupoRepetido[] = [];

  for (const membros of grupos.values()) {
    if (membros.length < 2) continue;

    // Quais evidencias de fato se repetem DENTRO do grupo.
    const evidencias = EVIDENCIAS.filter((evidencia) => {
      const vistos = new Set<string>();
      for (const member of membros) {
        const chave = chaves.get(member.id)?.[evidencia];
        if (!chave) continue;
        if (vistos.has(chave)) return true;
        vistos.add(chave);
      }
      return false;
    });
    if (evidencias.length === 0) continue;
    // "Mesmo nome" sozinho so diz algo quando e TUDO o que ha. Junto de
    // "mesmo nome e telefone", repeti-lo e ruido.
    if (evidencias.length > 1 && evidencias.at(-1) === 'nome') {
      const temNome = evidencias.some((e) => e === 'nome-telefone' || e === 'nome-secao');
      if (temNome) evidencias.pop();
    }

    const ordenados = [...membros].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    const responsaveis = [...new Set(ordenados.map((m) => recruiterText(m.recruitedBy)))];

    resultado.push({
      id: ordenados[0].id,
      nome: ordenados[0].name,
      certeza: EVIDENCIA_INFO[evidencias[0]].certeza,
      evidencias,
      registros: ordenados.map((member, indice) => ({ member, primeiro: indice === 0 })),
      responsaveis,
      divergencias: divergenciasEntre(ordenados),
    });
  }

  const pesoDaCerteza: Record<Certeza, number> = { certa: 0, provavel: 1, possivel: 2 };
  return resultado.sort(
    (a, b) =>
      pesoDaCerteza[a.certeza] - pesoDaCerteza[b.certeza] ||
      b.registros.length - a.registros.length ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/* -------------------------------------------------------------------------
   Telefone compartilhado
   ------------------------------------------------------------------------- */

export interface TelefoneCompartilhado {
  telefone: string;
  membros: Member[];
}

/**
 * Pessoas DIFERENTES com o mesmo telefone.
 *
 * Nao e erro por si so — marido e mulher dividem um numero, e a planilha
 * aceita isso de proposito. Mas quem tem o telefone repetido nao ganha
 * acesso ao painel, e um numero em cinco fichas costuma ser o do Lider
 * digitado no lugar do da pessoa. Fica a vista, como aviso leve.
 *
 * Quem ja esta num grupo de repetidos pelo mesmo motivo nao entra aqui: ali
 * o telefone igual e a mesma pessoa, e nao duas.
 */
export function telefonesCompartilhados(
  members: readonly Member[],
  repetidos: readonly GrupoRepetido[] = [],
): TelefoneCompartilhado[] {
  const grupoDe = new Map<string, string>();
  for (const grupo of repetidos) {
    for (const registro of grupo.registros) grupoDe.set(registro.member.id, grupo.id);
  }

  const porTelefone = new Map<string, Member[]>();
  for (const member of members) {
    const telefone = normalizePhone(member.phone ?? '');
    if (telefone.length < 10) continue;
    const lista = porTelefone.get(telefone) ?? [];
    lista.push(member);
    porTelefone.set(telefone, lista);
  }

  const resultado: TelefoneCompartilhado[] = [];
  for (const [telefone, membros] of porTelefone) {
    // Pessoas distintas: cada grupo de repetidos conta como uma so.
    const pessoas = new Set(membros.map((m) => grupoDe.get(m.id) ?? m.id));
    if (pessoas.size < 2) continue;
    resultado.push({ telefone, membros });
  }

  return resultado.sort((a, b) => b.membros.length - a.membros.length);
}

/* -------------------------------------------------------------------------
   Problemas de cada ficha
   ------------------------------------------------------------------------- */

export const TIPOS = [
  'invalido',
  'fora-do-municipio',
  'lider-sem-acesso',
  'terceiro-nivel',
  'responsavel-removido',
  'sem-origem',
] as const;
export type TipoDaFicha = (typeof TIPOS)[number];

export type Gravidade = 'alta' | 'media' | 'baixa';

export const TIPO_INFO: Record<
  TipoDaFicha,
  { titulo: string; explicacao: string; gravidade: Gravidade }
> = {
  invalido: {
    titulo: 'Dados que não fecham',
    explicacao:
      'Título, CPF ou telefone preenchidos, mas que não podem existir do jeito que estão: dígito trocado, faltando ou sobrando.',
    gravidade: 'alta',
  },
  'lider-sem-acesso': {
    titulo: 'Líderes sem acesso ao painel',
    explicacao:
      'Quem é Líder precisa entrar para cadastrar a própria Equipe. Sem telefone válido — ou com o número repetido no time — a porta fica fechada.',
    gravidade: 'alta',
  },
  'fora-do-municipio': {
    titulo: 'Endereço fora do município',
    explicacao: 'O endereço está em outro estado ou município que não o da operação.',
    gravidade: 'media',
  },
  'terceiro-nivel': {
    titulo: 'Cadastrados por quem é da Equipe',
    explicacao:
      'Só o Líder cadastra. Estes vieram de alguém da Equipe, antes da regra existir — o nível abaixo da Equipe não existe.',
    gravidade: 'media',
  },
  'responsavel-removido': {
    titulo: 'Responsável sem acesso',
    explicacao:
      'Quem cadastrou teve o acesso removido. A pessoa continua no time, mas ninguém mais a acompanha: vale passar para outro responsável.',
    gravidade: 'media',
  },
  'sem-origem': {
    titulo: 'Sem origem registrada',
    explicacao:
      'Cadastros de antes do rastreamento: não se sabe quem trouxe. Não entram no ranking de ninguém.',
    gravidade: 'baixa',
  },
};

export interface ProblemaDaFicha {
  tipo: TipoDaFicha;
  member: Member;
  /** O que exatamente, em uma linha: "título com 11 dígitos", "Maceió/AL". */
  detalhe: string;
}

/** Referencia de endereco: os municipios do time, ou o fixo da operacao. */
export interface MunicipioDaOperacao {
  state: string;
  cities: string[];
}

export function municipioDaOperacao(time: {
  stateUf?: string | null;
  cities?: readonly string[] | null;
}): MunicipioDaOperacao {
  const cities = (time.cities ?? []).map((c) => c.trim()).filter(Boolean);
  const state = (time.stateUf ?? '').trim().toUpperCase();
  if (state && cities.length > 0) return { state, cities };
  return { state: ENDERECO_FIXO.state, cities: [ENDERECO_FIXO.city] };
}

function dadosInvalidos(member: Member): string[] {
  const erros: string[] = [];
  const titulo = normalizeVoterId(member.voterId ?? '');
  if (titulo && !isValidVoterId(titulo)) erros.push('título inválido');
  const cpf = normalizeCpf(member.cpf ?? '');
  if (cpf && !isValidCpf(cpf)) erros.push('CPF inválido');
  const telefone = normalizePhone(member.phone ?? '');
  if (telefone && !isValidPhone(telefone)) erros.push(`telefone com ${telefone.length} dígitos`);
  if (member.zone?.trim() && !member.section?.trim()) erros.push('zona sem seção');
  if (member.section?.trim() && !member.zone?.trim()) erros.push('seção sem zona');
  return erros;
}

function foraDoMunicipio(member: Member, referencia: MunicipioDaOperacao): string | null {
  const uf = (member.state ?? '').trim().toUpperCase();
  const cidade = normalizeSearch(member.city);
  const cidades = referencia.cities.map((c) => normalizeSearch(c));

  const outroEstado = uf && uf !== referencia.state;
  const outraCidade = cidade && !cidades.includes(cidade);
  if (!outroEstado && !outraCidade) return null;

  return [member.city?.trim(), uf].filter(Boolean).join('/') || 'outro lugar';
}

/** Todas as fichas com algum problema, cada problema em uma linha. */
export function problemasDasFichas(
  members: readonly Member[],
  referencia: MunicipioDaOperacao,
): ProblemaDaFicha[] {
  const problemas: ProblemaDaFicha[] = [];

  for (const member of members) {
    const invalidos = dadosInvalidos(member);
    if (invalidos.length) {
      problemas.push({ tipo: 'invalido', member, detalhe: invalidos.join(', ') });
    }

    const fora = foraDoMunicipio(member, referencia);
    if (fora) problemas.push({ tipo: 'fora-do-municipio', member, detalhe: fora });

    // Lider precisa entrar. Time DEMO nao da acesso a ninguem, de proposito.
    if (member.tier === 'LIDER' && member.access !== 'ACTIVE' && member.access !== 'DEMO_NO_ACCESS') {
      const motivo =
        member.access === 'DUPLICATE_PHONE'
          ? 'telefone repetido no time'
          : member.access === 'NO_PHONE'
            ? 'sem telefone válido'
            : member.access === 'DISABLED'
              ? 'acesso desativado'
              : 'acesso pendente';
      problemas.push({ tipo: 'lider-sem-acesso', member, detalhe: motivo });
    }

    const recrutador = member.recruitedBy;
    if (!recrutador) {
      problemas.push({ tipo: 'sem-origem', member, detalhe: 'origem desconhecida' });
    } else {
      if (recrutador.tier === 'EQUIPE') {
        problemas.push({
          tipo: 'terceiro-nivel',
          member,
          detalhe: `cadastrado por ${recrutador.name}, da Equipe`,
        });
      }
      if (!recrutador.userId) {
        problemas.push({
          tipo: 'responsavel-removido',
          member,
          detalhe: `${recrutador.name} não tem mais acesso`,
        });
      }
    }
  }

  return problemas;
}

/* -------------------------------------------------------------------------
   Cadastros incompletos
   ------------------------------------------------------------------------- */

export interface FaltaPorCampo {
  campo: string;
  quantidade: number;
}

export interface IncompletosPorResponsavel {
  chave: string;
  responsavel: string;
  total: number;
  incompletos: number;
  /** 0 a 100. */
  percentual: number;
}

export interface Incompletos {
  membros: { member: Member; faltas: string[] }[];
  porCampo: FaltaPorCampo[];
  porResponsavel: IncompletosPorResponsavel[];
}

export function cadastrosIncompletos(members: readonly Member[]): Incompletos {
  const membros: Incompletos['membros'] = [];
  const porCampo = new Map<string, number>();
  const porResponsavel = new Map<string, IncompletosPorResponsavel>();

  for (const member of members) {
    const faltas = camposFaltantes(member);
    const chave = recruiterKey(member);
    const linha = porResponsavel.get(chave) ?? {
      chave,
      responsavel: chave === NO_RECRUITER_KEY ? 'Sem origem' : recruiterText(member.recruitedBy),
      total: 0,
      incompletos: 0,
      percentual: 0,
    };
    linha.total += 1;

    if (faltas.length > 0) {
      membros.push({ member, faltas });
      linha.incompletos += 1;
      for (const campo of faltas) porCampo.set(campo, (porCampo.get(campo) ?? 0) + 1);
    }
    porResponsavel.set(chave, linha);
  }

  for (const linha of porResponsavel.values()) {
    linha.percentual = linha.total ? Math.round((linha.incompletos / linha.total) * 100) : 0;
  }

  return {
    membros: membros.sort((a, b) => b.faltas.length - a.faltas.length),
    porCampo: [...porCampo.entries()]
      .map(([campo, quantidade]) => ({ campo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    porResponsavel: [...porResponsavel.values()]
      .filter((linha) => linha.incompletos > 0)
      .sort((a, b) => b.incompletos - a.incompletos || b.percentual - a.percentual),
  };
}

/* -------------------------------------------------------------------------
   O diagnostico inteiro
   ------------------------------------------------------------------------- */

export interface Diagnostico {
  total: number;
  repetidos: GrupoRepetido[];
  /** Cadastros a mais: em um grupo de 3, sobram 2. So conta certeza e provavel. */
  excedentes: number;
  telefones: TelefoneCompartilhado[];
  incompletos: Incompletos;
  problemas: ProblemaDaFicha[];
  /** Pessoas com pelo menos um problema serio (tudo menos o que e so aviso). */
  pessoasComProblema: number;
  /**
   * Saude do cadastro, de 0 a 100: a fracao da equipe sem nenhum problema
   * serio. "Possivel repeticao" e telefone compartilhado ficam de fora: sao
   * perguntas, e nao erros — contar pergunta como erro faria a nota mentir.
   */
  saude: number;
}

export function diagnosticar(
  members: readonly Member[],
  referencia: MunicipioDaOperacao,
): Diagnostico {
  const repetidos = cadastrosRepetidos(members);
  const telefones = telefonesCompartilhados(members, repetidos);
  const incompletos = cadastrosIncompletos(members);
  const problemas = problemasDasFichas(members, referencia);

  const comProblema = new Set<string>();
  for (const grupo of repetidos) {
    if (grupo.certeza === 'possivel') continue;
    // O primeiro cadastro e o original: o problema sao os que vieram depois.
    for (const registro of grupo.registros) if (!registro.primeiro) comProblema.add(registro.member.id);
  }
  for (const { member } of incompletos.membros) comProblema.add(member.id);
  for (const problema of problemas) {
    if (TIPO_INFO[problema.tipo].gravidade !== 'baixa') comProblema.add(problema.member.id);
  }

  const excedentes = repetidos
    .filter((grupo) => grupo.certeza !== 'possivel')
    .reduce((soma, grupo) => soma + grupo.registros.length - 1, 0);

  const total = members.length;
  return {
    total,
    repetidos,
    excedentes,
    telefones,
    incompletos,
    problemas,
    pessoasComProblema: comProblema.size,
    saude: total === 0 ? 100 : Math.round(((total - comProblema.size) / total) * 100),
  };
}

/**
 * O cadastro e daquele responsavel? Serve ao filtro da tela.
 *
 * O recorte e aplicado ao DIAGNOSTICO, e nao a lista de entrada: filtrar a
 * entrada esconderia justamente o caso mais importante — a mesma pessoa
 * cadastrada por dois Lideres diferentes. Um grupo de repetidos aparece
 * quando QUALQUER registro dele e do responsavel escolhido.
 */
export function doResponsavel(member: Member, chave: string | null): boolean {
  return !chave || recruiterKey(member) === chave;
}
