import type { Dossie, LiderNoDossie } from './dossie';
import type { AnaliseDoNeo } from './neo';

/**
 * A leitura do relatorio quando o NEO nao pode escrever (sem chave, fora do
 * ar, resposta torta).
 *
 * Antes, cada trecho do PDF virava uma caixa "analise indisponivel" — um
 * documento que ninguem apresenta. Agora o relatorio sai com a MESMA
 * estrutura, e os textos sao montados aqui, direto dos numeros: mais secos
 * que os do NEO, mas corretos e apresentaveis. A capa diz qual das duas
 * leituras o documento traz.
 *
 * Funcao pura, sem aleatoriedade: o mesmo time gera o mesmo texto.
 */

const n = (valor: number) => valor.toLocaleString('pt-BR');
const pessoas = (valor: number) => `${n(valor)} ${valor === 1 ? 'pessoa' : 'pessoas'}`;
const liderancas = (valor: number) => `${n(valor)} ${valor === 1 ? 'liderança' : 'lideranças'}`;

function lista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export function analiseAutomatica(dossie: Dossie): AnaliseDoNeo {
  const e = dossie.estrategia;
  const q = dossie.qualidade;
  const num = dossie.numeros;
  const t = dossie.territorio;
  const lideres = dossie.lideres;
  const ativos = lideres.filter((l) => l.equipe > 0);
  const top = ativos.slice(0, 3);
  const parados = lideres.filter((l) => l.selo === 'Parado' || l.selo === 'Esfriando');
  const semEquipe = lideres.filter((l) => l.selo === 'Sem Equipe');
  const piorComponente = [...e.indice.componentes].sort((a, b) => a.valor - b.valor)[0];
  const bairroLider = t.bairros[0];

  const vazia = e.baseDeclarada === 0;

  const carta = vazia
    ? [
        `A operação ${dossie.time.nome} ainda não tem apoiadores cadastrados. Este relatório registra o ponto de partida e o que é preciso para a rede começar a crescer.`,
        `O primeiro passo é recrutar as lideranças e garantir que cada uma traga a própria base, com título de eleitor, zona e seção desde o primeiro cadastro.`,
      ]
    : [
        `${dossie.time.demonstracao ? 'Este é um ambiente de demonstração, com dados fictícios. ' : ''}A operação ${dossie.time.nome} reúne ${pessoas(e.baseLiquida)} na base líquida, organizadas por ${liderancas(num.lideres)} e ${n(num.administradores)} ${num.administradores === 1 ? 'coordenador' : 'coordenadores'}. O Índice de Mobilização está em ${e.indice.valor}, na faixa "${e.indice.rotulo}".`,
        top.length
          ? `A rede se apoia principalmente em ${lista(top.map((l) => l.nome))}, que somam ${e.concentracaoTop3}% da base trazida pelas lideranças.${e.lideresPara80 ? ` ${liderancas(e.lideresPara80)} respondem por 80% dessa base.` : ''}`
          : 'Nenhuma liderança trouxe apoiadores ainda: a rede depende, por enquanto, só da coordenação.',
        `Nos últimos 30 dias entraram ${pessoas(num.ultimos30)}, uma média de ${num.ritmo30.toLocaleString('pt-BR')} por dia; ${liderancas(e.lideresRecentes)} de ${n(num.lideres)} cadastraram no período (${e.engajamento}%).`,
        `O ponto que mais pesa contra o índice é ${piorComponente.rotulo.toLowerCase()}, em ${piorComponente.valor}%. ${q.excedentes ? `Há ainda ${pessoas(q.excedentes)} contadas mais de uma vez, que precisam sair da conta.` : 'Não há cadastro repetido na base.'}`,
      ];

  const conclusoes: AnaliseDoNeo['conclusoes'] = [];
  if (top[0]) {
    conclusoes.push({
      titulo: `${top[0].nome} lidera a rede`,
      texto: `${pessoas(top[0].equipe)} trazidas, ${top[0].participacao.toLocaleString('pt-BR')}% da base das lideranças.`,
      natureza: 'forca',
    });
  }
  if (num.ultimos30 > 0) {
    conclusoes.push({
      titulo: 'Rede em movimento',
      texto: `${pessoas(num.ultimos30)} entraram nos últimos 30 dias; na última semana, ${n(num.ultimos7)} (${num.variacao7 >= 0 ? '+' : ''}${num.variacao7}% sobre a anterior).`,
      natureza: 'forca',
    });
  }
  if (e.concentracaoTop3 >= 50 && ativos.length > 3) {
    conclusoes.push({
      titulo: 'Base concentrada em poucas lideranças',
      texto: `As 3 maiores lideranças somam ${e.concentracaoTop3}% da base: a saída de uma delas pesa na rede inteira.`,
      natureza: 'atencao',
    });
  }
  if (parados.length || semEquipe.length) {
    conclusoes.push({
      titulo: 'Lideranças a reativar',
      texto: `${liderancas(parados.length)} esfriaram ou pararam, e ${n(semEquipe.length)} ainda não trouxeram ninguém.`,
      natureza: 'oportunidade',
    });
  }
  if (q.pessoasComProblema > 0) {
    conclusoes.push({
      titulo: 'Pendências de integridade',
      texto: `${pessoas(q.pessoasComProblema)} têm alguma pendência; a integridade da base está em ${q.saude}%.`,
      natureza: 'atencao',
    });
  }
  if (e.eleitoral.tituloValidoPct < 100 && e.baseDeclarada > 0) {
    conclusoes.push({
      titulo: 'Qualificação eleitoral',
      texto: `${e.eleitoral.tituloValidoPct}% da base tem título de eleitor válido e ${e.eleitoral.zonaSecaoPct}% tem zona e seção.`,
      natureza: 'oportunidade',
    });
  }

  const destaqueDe = (l: LiderNoDossie) =>
    l.selo === 'Motor' || l.selo === 'Constante'
      ? `Mantém o ritmo: ${pessoas(l.equipe)} na base, ${n(l.equipeUltimos30)} nos últimos 30 dias.`
      : l.selo === 'Sem Equipe'
        ? 'Ainda não trouxe apoiadores.'
        : `${pessoas(l.equipe)} na base, mas sem cadastro recente${l.ultimoCadastro ? ` desde ${new Date(l.ultimoCadastro).toLocaleDateString('pt-BR')}` : ''}.`;
  const proximoDe = (l: LiderNoDossie) =>
    l.selo === 'Motor' || l.selo === 'Constante'
      ? 'Reconhecer o resultado e pedir indicação de novas lideranças na base dela.'
      : l.selo === 'Sem Equipe'
        ? 'Acompanhar os primeiros cadastros junto com a liderança.'
        : 'Reunir-se com a liderança para entender a parada e combinar uma meta curta.';
  const comentadas = [...new Set([...top, ...parados.slice(0, 3), ...semEquipe.slice(0, 2)])].slice(0, 8);

  const bairrosTexto = t.bairros.length
    ? `O bairro com mais apoiadores é ${bairroLider.rotulo}, com ${pessoas(bairroLider.quantidade)}. Os 3 maiores bairros concentram ${e.eleitoral.concentracaoTop3Bairros}% da base.`
    : 'A base ainda não tem bairro informado.';

  return {
    manchete: vazia
      ? `${dossie.time.nome}: a rede está pronta para começar`
      : `${dossie.time.nome}: ${pessoas(e.baseLiquida)} mobilizadas e Índice de Mobilização em ${e.indice.valor}`,
    carta: carta.filter(Boolean).join('\n\n'),
    leituraDoIndice: `O índice está em ${e.indice.valor} (${e.indice.rotulo}). O componente mais baixo é ${piorComponente.rotulo.toLowerCase()}, em ${piorComponente.valor}%.`,
    conclusoes: conclusoes.slice(0, 6),
    forcaDaRede: vazia
      ? 'A rede ainda não tem lideranças com base própria.'
      : `${liderancas(num.lideresAtivos)} de ${n(num.lideres)} já trouxeram apoiadores (${e.ativacao}%), com média de ${e.multiplicador.toLocaleString('pt-BR')} ${e.multiplicador === 1 ? 'pessoa' : 'pessoas'} por liderança ativa. ${liderancas(e.lideresRecentes)} cadastraram nos últimos 30 dias (${e.engajamento}%).`,
    cenario: e.projecao
      ? `Mantido o ritmo dos últimos 30 dias, de ${e.projecao.ritmoDia.toLocaleString('pt-BR')} por dia, a base líquida chegaria a ${n(e.projecao.em30)} em 30 dias, ${n(e.projecao.em60)} em 60 e ${n(e.projecao.em90)} em 90. É um cenário, não uma meta: depende de as lideranças manterem o passo.`
      : 'Não houve cadastro nos últimos 30 dias: sem ritmo recente, não há cenário de crescimento a projetar.',
    liderancas: comentadas.map((l) => ({ nome: l.nome, leitura: destaqueDe(l), proximoPasso: proximoDe(l) })),
    territorio: `A base alcança ${n(e.eleitoral.bairros)} ${e.eleitoral.bairros === 1 ? 'bairro' : 'bairros'}, ${n(e.eleitoral.zonas)} ${e.eleitoral.zonas === 1 ? 'zona eleitoral' : 'zonas eleitorais'} e ${n(e.eleitoral.secoes)} ${e.eleitoral.secoes === 1 ? 'seção' : 'seções'}. ${bairrosTexto}`,
    integridade: q.pessoasComProblema
      ? [
          `A integridade da base está em ${q.saude}%: ${pessoas(q.pessoasComProblema)} têm alguma pendência.`,
          q.excedentes ? `${pessoas(q.excedentes)} aparecem mais de uma vez e inflam a contagem.` : '',
          q.incompletos ? `${pessoas(q.incompletos)} estão com dado faltando.` : '',
          'O detalhamento nominal está no Anexo A.',
        ]
          .filter(Boolean)
          .join(' ')
      : 'A base está íntegra: nenhum cadastro repetido, faltando dado ou com dado inconsistente.',
    recomendacoes: [
      ...(q.excedentes
        ? [{
            titulo: 'Limpar os duplicados',
            acao: 'Remover os cadastros repetidos listados no Anexo A.',
            responsavel: 'Coordenação',
            prazo: 'Imediato' as const,
            resultadoEsperado: `A contagem passa a refletir ${pessoas(e.baseLiquida)} reais.`,
          }]
        : []),
      ...(parados.length
        ? [{
            titulo: 'Reativar lideranças paradas',
            acao: `Conversar com ${lista(parados.slice(0, 3).map((l) => l.nome))}.`,
            responsavel: 'Coordenação',
            prazo: 'Até 7 dias' as const,
            resultadoEsperado: `${liderancas(parados.length)} de volta ao ritmo da rede.`,
          }]
        : []),
      ...(e.eleitoral.tituloValidoPct < 90 && e.baseDeclarada > 0
        ? [{
            titulo: 'Completar a qualificação eleitoral',
            acao: 'Completar título, zona e seção de quem ainda não tem.',
            responsavel: 'Coordenação',
            prazo: 'Até 30 dias' as const,
            resultadoEsperado: `Hoje ${e.eleitoral.tituloValidoPct}% da base tem título válido.`,
          }]
        : []),
      {
        titulo: 'Ampliar a rede de lideranças',
        acao: 'Pedir às lideranças mais ativas a indicação de novas lideranças nos bairros com menos presença.',
        responsavel: 'Direção',
        prazo: 'Até 30 dias',
        resultadoEsperado: 'Menos dependência das maiores lideranças e presença em novos bairros.',
      },
    ],
    decisoesDaDirecao: [
      'Qual meta de base líquida a rede deve atingir nos próximos 90 dias?',
      'Quais bairros e zonas são prioridade para novas lideranças?',
    ],
    fechamento: vazia
      ? 'A estrutura está pronta; o próximo relatório já poderá medir o crescimento da rede.'
      : `A rede tem ${pessoas(e.baseLiquida)} e Índice de Mobilização em ${e.indice.valor}. O caminho para subir o índice passa por ${piorComponente.rotulo.toLowerCase()}.`,
  };
}
