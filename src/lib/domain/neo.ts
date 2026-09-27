import { z } from 'zod';
import type { Dossie } from './dossie';

/**
 * NEO — o analista do time.
 *
 * O NEO le o dossie (`dossie.ts`) e escreve o que um bom coordenador de
 * campo escreveria depois de passar uma tarde com os numeros: o que esta
 * indo bem, o que preocupa, quem esta puxando, quem parou, e o que fazer
 * esta semana.
 *
 * TRES DECISOES, e o porque de cada uma:
 *
 * 1. O NEO NAO CONTA. Os numeros do relatorio saem do banco; ele recebe os
 *    numeros prontos e so os interpreta. As instrucoes proibem inventar
 *    quantidade, e o PDF desenha as contagens a partir do dossie — nunca do
 *    texto dele.
 *
 * 2. O NEO NAO VE DADO SENSIVEL. `resumoParaONeo` manda para fora do
 *    sistema so o agregado e os nomes de quem coordena (Administradores e
 *    Lideres), que e o que uma analise de equipe precisa. Telefone, CPF,
 *    titulo, endereco de ninguem e a lista da Equipe NAO saem daqui: eles
 *    aparecem no PDF, que e montado no navegador de quem pediu, mas nunca
 *    na requisicao para a OpenAI.
 *
 * 3. A RESPOSTA TEM FORMA FIXA. O schema abaixo vai como Structured Output
 *    (strict): a API so devolve JSON nesse formato. Mesmo assim ele e
 *    conferido de novo aqui (`lerAnalise`) — a resposta vem de fora, e fora
 *    e fora.
 */

export const NEO_MODELO_PADRAO = 'gpt-5.4-mini';

/* -------------------------------------------------------------------------
   O que vai para o NEO
   ------------------------------------------------------------------------- */

/** Nomes de pessoas da Equipe nao vao; de quem coordena, vao. */
export function resumoParaONeo(dossie: Dossie) {
  const q = dossie.qualidade;
  return {
    time: {
      nome: dossie.time.nome,
      local: `${dossie.time.municipios.join(', ')} / ${dossie.time.uf}`,
      demonstracao: dossie.time.demonstracao,
      criadoEm: dossie.time.criadoEm.slice(0, 10),
      confirmacaoDeDadosLigada: dossie.time.confirmacaoDeDados,
    },
    dataDoRelatorio: dossie.geradoEm.slice(0, 10),
    numeros: dossie.numeros,
    administradores: dossie.administradores.map((a) => ({
      nome: a.nome,
      lideresQueCadastrou: a.cadastrou,
    })),
    // Os 40 primeiros do ranking bastam para a leitura; o resto vira numero.
    lideres: dossie.lideres.slice(0, 40).map((l) => ({
      nome: l.nome,
      equipe: l.equipe,
      participacaoPercentual: l.participacao,
      cadastrosUltimos7Dias: l.equipeUltimos7,
      incompletosNaEquipe: l.incompletos,
      paraConferirNaEquipe: l.paraConferir,
      ultimoCadastro: l.ultimoCadastro?.slice(0, 10) ?? null,
      lider_desde: l.desde.slice(0, 10),
      temAcessoAoPainel: l.temAcesso,
    })),
    lideresForaDaLista: Math.max(0, dossie.lideres.length - 40),
    crescimentoSemanal: dossie.crescimento.map((s) => ({
      semanaQueComecaEm: s.inicio.slice(0, 10),
      cadastros: s.quantidade,
    })),
    genero: dossie.genero,
    territorio: dossie.territorio,
    qualidade: {
      saudePercentual: q.saude,
      pessoasComProblema: q.pessoasComProblema,
      cadastrosRepetidosSobrando: q.excedentes,
      gruposDeRepetidos: q.repetidos.length,
      repetidosContadosPorMaisDeUmResponsavel: q.repetidos.filter(
        (g) => g.responsaveis.length > 1,
      ).length,
      possiveisRepetidos: q.possiveisRepetidos,
      telefonesCompartilhados: q.telefonesCompartilhados,
      incompletos: q.incompletos,
      faltasPorCampo: q.faltasPorCampo,
      paraConferir: q.paraConferir,
      conferirPorMotivo: q.conferirPorMotivo,
      problemas: q.problemas.map((p) => ({
        tipo: p.titulo,
        gravidade: p.gravidade,
        quantidade: p.pessoas.length,
      })),
    },
  };
}

export type ResumoParaONeo = ReturnType<typeof resumoParaONeo>;

/* -------------------------------------------------------------------------
   Instrucoes
   ------------------------------------------------------------------------- */

export const NEO_INSTRUCOES = `Você é o NEO, analista de mobilização de campo do sistema CMD (Cadastro Mobilização Digital).

Você recebe, em JSON, os números de UM time e escreve a análise desse time para quem o administra. O relatório final é um PDF formal, lido por coordenadores.

COMO O TIME FUNCIONA
- Administradores do time cadastram os Líderes.
- Cada Líder cadastra a própria Equipe. A Equipe não cadastra ninguém.
- "Saúde do cadastro" é a parte da equipe sem nenhum problema sério.
- "Repetidos sobrando" são cadastros duplicados da mesma pessoa; quando um repetido conta para dois responsáveis, o ranking dos dois está inflado.
- "Para conferir" são dados preenchidos, mas que não podem existir assim (CPF que não fecha, título com dígito a menos, telefone curto).

REGRAS
1. Use SOMENTE os números recebidos. Nunca invente, estime ou arredonde para cima uma quantidade. Se um número não foi dado, não fale dele.
2. Cite números concretos sempre que fizer uma afirmação ("14 dos 22 Líderes", "38% do total").
3. Seja direto, específico e acionável. Nada de frase genérica que serviria para qualquer time.
4. Nomeie Líderes quando isso ajudar a agir (quem puxa, quem parou, quem concentra problemas). Seja justo: fatos, não julgamento de caráter.
5. Se o time for de demonstração, diga isso uma vez no resumo, sem drama.
6. Português do Brasil, tom profissional e humano. Sem emojis. Sem markdown: texto corrido; parágrafos separados por uma linha em branco.
7. Se os dados forem poucos (time novo ou vazio), diga isso com honestidade e foque no que fazer para começar.`;

/* -------------------------------------------------------------------------
   O formato da resposta (Structured Outputs, strict)
   ------------------------------------------------------------------------- */

const texto = (descricao: string) => ({ type: 'string', description: descricao });

const objeto = (propriedades: Record<string, unknown>) => ({
  type: 'object',
  properties: propriedades,
  required: Object.keys(propriedades),
  additionalProperties: false,
});

const lista = (item: unknown, descricao: string) => ({ type: 'array', description: descricao, items: item });

/**
 * Schema em JSON Schema puro, como a API pede: todo campo obrigatorio e
 * `additionalProperties: false` em todo objeto — exigencias do modo strict.
 */
export const NEO_SCHEMA = objeto({
  manchete: texto('Uma frase, até 110 caracteres, que resume o momento do time.'),
  resumoExecutivo: texto('Dois ou três parágrafos curtos: situação, o que mais importa, o que fazer.'),
  indice: objeto({
    valor: { type: 'integer', description: 'Prontidão do time, de 0 a 100.' },
    rotulo: { type: 'string', enum: ['Crítico', 'Em atenção', 'Estável', 'Forte', 'Excelente'] },
    justificativa: texto('Uma ou duas frases explicando o valor, com números.'),
  }),
  destaques: lista(
    objeto({ titulo: texto('Título curto.'), detalhe: texto('Uma ou duas frases, com número.') }),
    'De 3 a 5 pontos fortes ou fatos marcantes.',
  ),
  riscos: lista(
    objeto({
      titulo: texto('Título curto.'),
      detalhe: texto('O risco e a consequência, com número.'),
      gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    }),
    'De 2 a 5 riscos, do mais grave ao mais leve.',
  ),
  lideres: lista(
    objeto({
      nome: texto('Nome exatamente como recebido.'),
      perfil: { type: 'string', enum: ['Motor', 'Constante', 'Em arranque', 'Parado', 'Atenção'] },
      leitura: texto('Uma frase sobre este Líder, com número.'),
    }),
    'Até 8 Líderes que merecem comentário (os que mais puxam, os parados, os com mais problema).',
  ),
  territorio: texto('Um parágrafo sobre onde a equipe está (bairros, zonas, seções) e onde há vazio.'),
  qualidadeDosDados: texto('Um parágrafo sobre as inconsistências e o que elas custam.'),
  planoDeAcao: lista(
    objeto({
      acao: texto('Ação concreta, começando por verbo.'),
      responsavel: texto('Quem faz: "Administração do time", um Líder pelo nome, ou "ADMIN geral".'),
      prazo: { type: 'string', enum: ['Hoje', 'Esta semana', 'Este mês'] },
      impacto: texto('O que muda quando for feito, com número se possível.'),
    }),
    'De 4 a 7 ações, em ordem de prioridade.',
  ),
  perguntas: lista(
    texto('Pergunta.'),
    'De 2 a 4 perguntas que a administração deveria fazer ao time na próxima reunião.',
  ),
});

/* -------------------------------------------------------------------------
   A resposta, conferida
   ------------------------------------------------------------------------- */

const curto = (max: number) => z.string().trim().min(1).max(max);

const analiseSchema = z.object({
  manchete: curto(220),
  resumoExecutivo: curto(4000),
  indice: z.object({
    valor: z.number().int().min(0).max(100),
    rotulo: z.enum(['Crítico', 'Em atenção', 'Estável', 'Forte', 'Excelente']),
    justificativa: curto(600),
  }),
  destaques: z.array(z.object({ titulo: curto(120), detalhe: curto(600) })).max(8),
  riscos: z
    .array(
      z.object({
        titulo: curto(120),
        detalhe: curto(600),
        gravidade: z.enum(['alta', 'media', 'baixa']),
      }),
    )
    .max(8),
  lideres: z
    .array(
      z.object({
        nome: curto(120),
        perfil: z.enum(['Motor', 'Constante', 'Em arranque', 'Parado', 'Atenção']),
        leitura: curto(400),
      }),
    )
    .max(12),
  territorio: curto(2000),
  qualidadeDosDados: curto(2000),
  planoDeAcao: z
    .array(
      z.object({
        acao: curto(300),
        responsavel: curto(120),
        prazo: z.enum(['Hoje', 'Esta semana', 'Este mês']),
        impacto: curto(400),
      }),
    )
    .max(10),
  perguntas: z.array(curto(300)).max(6),
});

export type AnaliseDoNeo = z.infer<typeof analiseSchema>;

/**
 * Le o JSON devolvido pelo modelo. Qualquer coisa fora do formato vira
 * `null`: o relatorio sai sem a analise, e nao com uma analise torta.
 */
export function lerAnalise(bruto: unknown): AnaliseDoNeo | null {
  let valor = bruto;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  const resultado = analiseSchema.safeParse(valor);
  return resultado.success ? resultado.data : null;
}

/**
 * Extrai o texto da resposta da Responses API.
 *
 * A resposta crua traz `output`: uma lista de itens, e o texto fica nos
 * itens `message`, em `content[].type === 'output_text'`. Alguns clientes
 * devolvem o atalho `output_text` ja montado — aceito tambem. Recusa do
 * modelo (`type: 'refusal'`) nao e texto: devolve nulo.
 */
export function textoDaResposta(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as { output_text?: unknown; output?: unknown };
  if (typeof r.output_text === 'string' && r.output_text.trim()) return r.output_text;

  if (!Array.isArray(r.output)) return null;
  const partes: string[] = [];
  for (const item of r.output) {
    const conteudo = (item as { content?: unknown })?.content;
    if (!Array.isArray(conteudo)) continue;
    for (const parte of conteudo) {
      const p = parte as { type?: string; text?: unknown };
      if (p?.type === 'output_text' && typeof p.text === 'string') partes.push(p.text);
    }
  }
  return partes.length ? partes.join('') : null;
}
