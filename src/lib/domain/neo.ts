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
  const e = dossie.estrategia;
  return {
    operacao: {
      nome: dossie.time.nome,
      local: `${dossie.time.municipios.join(', ')} / ${dossie.time.uf}`,
      ambienteDeDemonstracao: dossie.time.demonstracao,
      inicioDaOperacao: dossie.time.criadoEm.slice(0, 10),
    },
    dataDoRelatorio: dossie.geradoEm.slice(0, 10),
    indiceDeMobilizacao: {
      valor: e.indice.valor,
      faixa: e.indice.rotulo,
      componentes: e.indice.componentes.map((c) => ({ componente: c.rotulo, valor: c.valor, pesoPercentual: c.peso })),
    },
    base: {
      declarada: e.baseDeclarada,
      duplicados: e.duplicados,
      liquida: e.baseLiquida,
      coordenadores: dossie.numeros.administradores,
      liderancas: dossie.numeros.lideres,
      baseTrazidaPelasLiderancas: dossie.numeros.equipe,
    },
    ritmo: {
      hoje: dossie.numeros.hoje,
      ultimos7Dias: dossie.numeros.ultimos7,
      variacaoSobreASemanaAnteriorPercentual: dossie.numeros.variacao7,
      ultimos30Dias: dossie.numeros.ultimos30,
      mediaPorDia30: dossie.numeros.ritmo30,
      semanas: dossie.crescimento.map((s, i) => ({
        semanaQueComecaEm: s.inicio.slice(0, 10),
        novos: s.quantidade,
        totalAcumulado: e.acumulado[i],
      })),
      projecaoMantidoORitmo: e.projecao
        ? { em30Dias: e.projecao.em30, em60Dias: e.projecao.em60, em90Dias: e.projecao.em90 }
        : null,
    },
    rede: {
      ativacaoDasLiderancasPercentual: e.ativacao,
      liderancasQueJaTrouxeramAlguem: dossie.numeros.lideresAtivos,
      liderancasQueCadastraramNosUltimos30Dias: e.lideresRecentes,
      engajamentoRecentePercentual: e.engajamento,
      pessoasPorLiderancaAtiva: e.multiplicador,
      parteDaBaseNas3MaioresLiderancasPercentual: e.concentracaoTop3,
      liderancasQueSomam80PorCentoDaBase: e.lideresPara80,
      liderancasPorTamanho: e.faixas,
      liderancasPorSelo: e.selos,
    },
    coordenadores: dossie.administradores.map((a) => ({
      nome: a.nome,
      liderancasQueCadastrou: a.cadastrou,
    })),
    // Os 40 primeiros do ranking bastam para a leitura; o resto vira numero.
    liderancas: dossie.lideres.slice(0, 40).map((l) => ({
      posicao: l.posicao,
      nome: l.nome,
      selo: l.selo,
      base: l.equipe,
      participacaoPercentual: l.participacao,
      novosUltimos7Dias: l.equipeUltimos7,
      novosUltimos30Dias: l.equipeUltimos30,
      integridadeDaBasePercentual: l.integridade,
      ultimoCadastro: l.ultimoCadastro?.slice(0, 10) ?? null,
      liderancaDesde: l.desde.slice(0, 10),
    })),
    liderancasForaDaLista: Math.max(0, dossie.lideres.length - 40),
    territorio: {
      bairrosAlcancados: e.eleitoral.bairros,
      zonasEleitorais: e.eleitoral.zonas,
      secoesEleitorais: e.eleitoral.secoes,
      parteDaBaseNos3MaioresBairrosPercentual: e.eleitoral.concentracaoTop3Bairros,
      bairros: dossie.territorio.bairros,
      zonas: dossie.territorio.zonas,
      secoes: dossie.territorio.secoes,
      semBairro: dossie.territorio.semBairro,
    },
    qualificacaoEleitoral: {
      comTituloValido: e.eleitoral.tituloValido,
      comTituloValidoPercentual: e.eleitoral.tituloValidoPct,
      comZonaESecao: e.eleitoral.zonaSecao,
      comZonaESecaoPercentual: e.eleitoral.zonaSecaoPct,
    },
    integridade: {
      integridadePercentual: q.saude,
      pessoasComPendencia: q.pessoasComProblema,
      duplicados: q.excedentes,
      pessoasCadastradasMaisDeUmaVez: q.repetidos.length,
      duplicadosContadosPorMaisDeUmaLideranca: q.repetidos.filter((g) => g.responsaveis.length > 1).length,
      possiveisHomonimos: q.possiveisRepetidos,
      telefonesDivididosEntrePessoas: q.telefonesCompartilhados,
      cadastrosComDadoFaltando: q.incompletos,
      oQueMaisFalta: q.faltasPorCampo,
      cadastrosComDadoInconsistente: q.paraConferir,
      inconsistenciasPorMotivo: q.conferirPorMotivo,
      pendencias: q.problemas.map((p) => ({ tipo: p.titulo, gravidade: p.gravidade, quantidade: p.pessoas.length })),
    },
  };
}

export type ResumoParaONeo = ReturnType<typeof resumoParaONeo>;

/* -------------------------------------------------------------------------
   Instrucoes
   ------------------------------------------------------------------------- */

export const NEO_INSTRUCOES = `Você é o NEO, o núcleo de inteligência de mobilização que assina este relatório.

QUEM LÊ
O relatório é entregue à direção de um partido político — o presidente do partido e a coordenação política. É gente experiente, com pouco tempo, que decide com base no que lê aqui. Escreva como uma consultoria estratégica de primeira linha escreveria para um cliente desse porte: firme, preciso, elegante, sem rodeio e sem bajulação.

A OPERAÇÃO
- Coordenadores (os administradores do time) recrutam as lideranças.
- Cada liderança mobiliza a própria base de apoiadores. A base não recruta ninguém.
- "Base declarada" é tudo o que está cadastrado; "base líquida" conta cada pessoa uma vez só (sem duplicados). Fale da base líquida quando falar do tamanho real da rede.
- O Índice de Mobilização (0 a 100) já vem CALCULADO, com seus componentes e pesos. Você não recalcula nem dá outra nota: você explica o que o índice diz e o que o puxa para cima ou para baixo.
- O selo de cada liderança já vem calculado: Motor (cadastrou nos últimos 7 dias e está no terço de cima do ranking), Constante (cadastrou nos últimos 7 dias), Esfriando (cadastrou nos últimos 30 dias, mas não nesta semana), Parado (tem base, mas não cadastra há mais de 30 dias), Sem Equipe (ainda não trouxe ninguém).
- A projeção de 30/60/90 dias é apenas a continuação do ritmo dos últimos 30 dias. Trate-a como cenário, nunca como promessa.
- CPF não é exigido da base: nunca trate falta de CPF como problema.

REGRAS DE OURO
1. Use SOMENTE os números recebidos. Não invente, não estime, não arredonde para cima e não faça contas novas: prefira os percentuais e totais que já vêm prontos. Se um número não veio, não fale dele.
2. Toda afirmação importante carrega um número concreto ("14 das 22 lideranças", "38% da base").
3. Nada de frase genérica que serviria para qualquer operação. Cada parágrafo precisa dizer algo que só vale para esta.
4. Nomeie lideranças quando isso ajudar a decidir: quem sustenta a rede, quem esfriou, quem concentra pendências. Fatos, nunca julgamento pessoal.
5. Não fale em votos, intenção de voto ou resultado eleitoral: o relatório mede mobilização e organização da base, não voto.
6. Vocabulário: diga "coordenação", "lideranças", "base mobilizada", "rede", "apoiadores". Nunca use jargão de sistema: nada de "painel", "link", "cadastro pelo link", "sistema", "planilha", "saúde do cadastro", "Time DEMO", "etiqueta". Chame inconsistências de "pendências de integridade".
7. Se a operação estiver em ambiente de demonstração, registre isso uma única vez, no primeiro parágrafo da carta, com naturalidade.
8. Se os dados forem poucos (operação nova ou vazia), diga isso com honestidade e foque em como estruturar a rede.
9. Português do Brasil impecável. Sem emojis, sem markdown, sem listas dentro dos textos. Parágrafos separados por uma linha em branco. Frases de no máximo 30 palavras.`;

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

export const PRAZOS = ['Imediato', 'Até 7 dias', 'Até 30 dias', 'Até 90 dias'] as const;
export const NATUREZAS = ['forca', 'atencao', 'oportunidade'] as const;

/**
 * Schema em JSON Schema puro, como a API pede: todo campo obrigatorio e
 * `additionalProperties: false` em todo objeto — exigencias do modo strict.
 */
export const NEO_SCHEMA = objeto({
  manchete: texto('A frase-título da capa: afirmativa, com um número, até 120 caracteres.'),
  carta: texto(
    'Carta executiva à direção, em 3 ou 4 parágrafos: onde a rede está, o que a sustenta, o que a ameaça e a decisão mais importante agora.',
  ),
  leituraDoIndice: texto('Duas frases: o que o Índice de Mobilização diz e qual componente mais o puxa para baixo.'),
  conclusoes: lista(
    objeto({
      titulo: texto('Título curto, até 60 caracteres.'),
      texto: texto('Uma ou duas frases, com número.'),
      natureza: { type: 'string', enum: [...NATUREZAS] },
    }),
    'De 4 a 6 conclusões-chave: forças, pontos de atenção e oportunidades.',
  ),
  forcaDaRede: texto('Um ou dois parágrafos sobre a estrutura: ativação, engajamento, multiplicador e concentração.'),
  cenario: texto('Um parágrafo sobre a trajetória das 12 semanas e o cenário de 30/60/90 dias, em linguagem condicional.'),
  liderancas: lista(
    objeto({
      nome: texto('Nome exatamente como recebido.'),
      leitura: texto('Uma frase sobre esta liderança, com número.'),
      proximoPasso: texto('O que a coordenação deve fazer com ela, começando por verbo.'),
    }),
    'De 4 a 8 lideranças que merecem comentário: as que sustentam a rede, as que esfriaram e as com mais pendências.',
  ),
  territorio: texto('Um ou dois parágrafos sobre a presença territorial: bairros, zonas e seções, concentração e vazios.'),
  integridade: texto('Um parágrafo sobre as pendências de integridade e o que elas custam à leitura da rede.'),
  recomendacoes: lista(
    objeto({
      titulo: texto('Título curto da recomendação.'),
      acao: texto('A ação concreta, começando por verbo.'),
      responsavel: texto('Quem executa: "Coordenação", uma liderança pelo nome, ou "Direção".'),
      prazo: { type: 'string', enum: [...PRAZOS] },
      resultadoEsperado: texto('O que muda quando for feito, com número quando possível.'),
    }),
    'De 4 a 6 recomendações, em ordem de prioridade.',
  ),
  decisoesDaDirecao: lista(
    texto('Uma decisão ou pergunta estratégica.'),
    'De 2 a 4 decisões que cabem à direção do partido, não à coordenação.',
  ),
  fechamento: texto('Um parágrafo curto de encerramento: a mensagem que a direção deve levar.'),
});

/* -------------------------------------------------------------------------
   A resposta, conferida
   ------------------------------------------------------------------------- */

const curto = (max: number) => z.string().trim().min(1).max(max);

const analiseSchema = z.object({
  manchete: curto(220),
  carta: curto(5000),
  leituraDoIndice: curto(800),
  conclusoes: z
    .array(z.object({ titulo: curto(120), texto: curto(600), natureza: z.enum(NATUREZAS) }))
    .max(8),
  forcaDaRede: curto(2500),
  cenario: curto(1500),
  liderancas: z
    .array(z.object({ nome: curto(120), leitura: curto(400), proximoPasso: curto(300) }))
    .max(12),
  territorio: curto(2500),
  integridade: curto(2000),
  recomendacoes: z
    .array(
      z.object({
        titulo: curto(140),
        acao: curto(400),
        responsavel: curto(120),
        prazo: z.enum(PRAZOS),
        resultadoEsperado: curto(400),
      }),
    )
    .max(8),
  decisoesDaDirecao: z.array(curto(400)).max(6),
  fechamento: curto(1500),
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
