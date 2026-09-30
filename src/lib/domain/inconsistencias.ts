import type { Member } from '@/lib/types';
import { normalizeCpf, normalizeVoterId } from '@/lib/utils/documents';
import { normalizePhone } from '@/lib/utils/phone';
import { dadosParaConferir } from './conferencia';
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

/** Do mais forte ao mais fraco: cada nivel so une o que o anterior deixou separado. */
const NIVEIS: Certeza[] = ['certa', 'provavel', 'possivel'];

const maisAntigo = (a: Member, b: Member) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Agrupa os cadastros que parecem ser a mesma pessoa — POR NIVEL DE CERTEZA.
 *
 *   1. "certa": mesmo titulo, mesmo CPF, ou mesmo nome e telefone. A uniao
 *      e transitiva: se A tem o titulo de B, e B tem o nome e o telefone de
 *      C, os tres sao o mesmo grupo.
 *   2. "provavel": mesmo nome e mesma secao, entre cadastros que o nivel 1
 *      deixou separados.
 *   3. "possivel": so o mesmo nome — homonimo existe.
 *
 * Um nivel fraco NUNCA engorda o grupo de um nivel forte. Tres cadastros com
 * o mesmo titulo e um quarto que so tem o mesmo nome (outro titulo, outra
 * secao) nao sao "quatro vezes a mesma pessoa com certeza": sao um grupo
 * certo de tres, e um POSSIVEL repetido a parte — o quarto ao lado do
 * cadastro original do grupo, para comparar os dois.
 *
 * Por isso, num nivel fraco, um grupo ja formado entra pelo seu cadastro
 * mais antigo (o original), e nao com todas as copias de novo.
 */
export function cadastrosRepetidos(members: readonly Member[]): GrupoRepetido[] {
  const conjuntos = new Conjuntos();
  const chaves = new Map<string, Record<Evidencia, string>>();
  for (const member of members) {
    chaves.set(member.id, chavesDe(member));
    conjuntos.achar(member.id);
  }

  const componentes = () => {
    const mapa = new Map<string, Member[]>();
    for (const member of members) {
      const raiz = conjuntos.achar(member.id);
      const lista = mapa.get(raiz) ?? [];
      lista.push(member);
      mapa.set(raiz, lista);
    }
    return mapa;
  };

  const resultado: GrupoRepetido[] = [];

  for (const nivel of NIVEIS) {
    const doNivel = EVIDENCIAS.filter((evidencia) => EVIDENCIA_INFO[evidencia].certeza === nivel);

    // Onde cada cadastro estava ANTES deste nivel: os pedacos que ele une.
    const pedacoAntes = new Map(members.map((member) => [member.id, conjuntos.achar(member.id)]));

    const porChave = new Map<string, string>();
    for (const member of members) {
      for (const evidencia of doNivel) {
        const chave = chaves.get(member.id)![evidencia];
        if (!chave) continue;
        const marcada = `${evidencia}:${chave}`;
        const outro = porChave.get(marcada);
        if (outro) conjuntos.unir(outro, member.id);
        else porChave.set(marcada, member.id);
      }
    }

    for (const membros of componentes().values()) {
      const pedacos = new Map<string, Member[]>();
      for (const member of membros) {
        const pedaco = pedacoAntes.get(member.id)!;
        pedacos.set(pedaco, [...(pedacos.get(pedaco) ?? []), member]);
      }
      if (pedacos.size < 2) continue;

      // As evidencias deste nivel que de fato ligam pedacos DIFERENTES.
      const ligam = doNivel.filter((evidencia) => {
        const ondeAparece = new Map<string, Set<string>>();
        for (const member of membros) {
          const chave = chaves.get(member.id)![evidencia];
          if (!chave) continue;
          const lugares = ondeAparece.get(chave) ?? new Set<string>();
          lugares.add(pedacoAntes.get(member.id)!);
          ondeAparece.set(chave, lugares);
        }
        return [...ondeAparece.values()].some((lugares) => lugares.size > 1);
      });
      if (ligam.length === 0) continue;

      // Cada pedaco entra pelo seu cadastro mais antigo. No nivel "certa"
      // os pedacos sao cadastros soltos, e todos entram.
      const registros = [...pedacos.values()]
        .map((pedaco) => [...pedaco].sort(maisAntigo)[0])
        .sort(maisAntigo);

      // O cartao do grupo certo conta tudo o que os registros repetem entre
      // si ("mesmo titulo · mesmo nome e mesma secao"); nos niveis fracos,
      // so o que liga.
      const evidencias =
        nivel === 'certa'
          ? EVIDENCIAS.filter((evidencia) => {
              const vistos = new Set<string>();
              return registros.some((member) => {
                const chave = chaves.get(member.id)![evidencia];
                if (!chave) return false;
                if (vistos.has(chave)) return true;
                vistos.add(chave);
                return false;
              });
            })
          : ligam;
      // "Mesmo nome" sozinho so diz algo quando e TUDO o que ha. Junto de
      // "mesmo nome e telefone" ou "e secao", repeti-lo e ruido.
      if (evidencias.length > 1 && evidencias.at(-1) === 'nome') {
        const temNome = evidencias.some((e) => e === 'nome-telefone' || e === 'nome-secao');
        if (temNome) evidencias.pop();
      }

      resultado.push({
        id: nivel === 'certa' ? registros[0].id : `${registros[0].id}:${nivel}`,
        nome: registros[0].name,
        certeza: nivel,
        evidencias,
        registros: registros.map((member, indice) => ({ member, primeiro: indice === 0 })),
        responsaveis: [...new Set(registros.map((m) => recruiterText(m.recruitedBy)))],
        divergencias: divergenciasEntre(registros),
      });
    }
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
  // O original de um grupo certo tambem aparece num grupo mais fraco (ao
  // lado do possivel repetido): os dois grupos viram uma pessoa so aqui.
  for (const grupo of repetidos) {
    const alvo =
      grupo.registros.map((registro) => grupoDe.get(registro.member.id)).find(Boolean) ?? grupo.id;
    for (const registro of grupo.registros) {
      if (!grupoDe.has(registro.member.id)) grupoDe.set(registro.member.id, alvo);
    }
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
    titulo: 'Dados para conferir',
    explicacao:
      'Título, CPF ou telefone que entraram do jeito que vieram, mas não podem existir assim: dígito trocado, faltando ou sobrando. A ficha já está com a etiqueta "Conferir".',
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

/** A mesma regra da etiqueta "Conferir" da ficha: uma so, em todo lugar. */
function dadosInvalidos(member: Member): string[] {
  // O telefone repetido tem secoes proprias aqui (telefone compartilhado e
  // Lider sem acesso): contado tambem nesta, a mesma pessoa apareceria duas
  // vezes pelo mesmo motivo.
  return dadosParaConferir({ ...member, access: null });
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

    // Quem veio da planilha do Sheets (052) so tem o que a planilha traz, e
    // e so leitura: acesso, endereco e origem nao se aplicam — cobrar isso
    // seria inconsistencia falsa. O que ela traz errado (titulo, telefone)
    // continua acima, em `dadosInvalidos`.
    if (member.fromSheet) continue;

    const fora = foraDoMunicipio(member, referencia);
    if (fora) problemas.push({ tipo: 'fora-do-municipio', member, detalhe: fora });

    // Lider precisa entrar. Time DEMO nao da acesso a ninguem, de proposito.
    // Desativado pelo ADMIN geral e decisao, e nao falha: aparece como
    // "Desativado" na lista e na ficha, e nao como inconsistencia.
    if (
      member.tier === 'LIDER' &&
      member.access !== 'ACTIVE' &&
      member.access !== 'DEMO_NO_ACCESS' &&
      member.access !== 'DISABLED'
    ) {
      const motivo =
        member.access === 'DUPLICATE_PHONE'
          ? 'telefone repetido no time'
          : member.access === 'NO_PHONE'
            ? 'sem telefone válido'
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
