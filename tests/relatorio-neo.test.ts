import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import type { Client, Member, Recruiter } from '@/lib/types';
import { montarDossie } from '@/lib/domain/dossie';
import { isValidVoterId } from '@/lib/utils/documents';
import {
  NEO_SCHEMA,
  lerAnalise,
  resumoParaONeo,
  textoDaResposta,
  type AnaliseDoNeo,
} from '@/lib/domain/neo';
import { RelatorioDoTime, nomeDoPdf } from '@/components/neo/RelatorioPdf';
import { analiseAutomatica } from '@/lib/domain/leitura-automatica';

/**
 * O relatorio do time pelo NEO.
 *
 * O que estes testes protegem:
 *
 *   - os numeros do relatorio saem do CADASTRO (o dossie), nao da IA;
 *   - o que vai para a OpenAI nao carrega telefone, CPF, titulo nem nome de
 *     quem e da Equipe;
 *   - a resposta do modelo e conferida, e qualquer coisa torta vira "sem
 *     analise", nunca um relatorio quebrado;
 *   - o PDF sai inteiro — com e sem o NEO.
 */

const MARINA: Recruiter = { userId: 'u-marina', name: 'Marina Alves', role: 'CANDIDATE', photo: null };

let n = 0;

/** Titulo que fecha o digito verificador, diferente para cada pessoa. */
let base = 100000000000;
function tituloValido(): string {
  for (;;) {
    base += 7;
    if (isValidVoterId(String(base))) return String(base);
  }
}

function pessoa(partes: Partial<Member>): Member {
  n += 1;
  return {
    id: `m${n}`,
    clientId: 'c1',
    name: `Pessoa ${n} Souza`,
    phone: `829999${String(n).padStart(5, '0')}`,
    email: null,
    photo: null,
    gender: n % 2 ? 'MULHER' : 'HOMEM',
    // CPF so no primeiro: repetido em todos, todos seriam a mesma pessoa.
    cpf: n === 1 ? '52998224725' : null,
    voterId: tituloValido(),
    zone: '10',
    section: String(100 + (n % 7)),
    state: 'AL',
    city: 'Palmeira dos Índios',
    district: ['Centro', 'Xucurus', 'Jardim Brasil', 'São Cristóvão'][n % 4],
    street: 'Rua Brasil Novo',
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
    source: n % 3 ? 'invite' : 'admin',
    recruitedBy: MARINA,
    tier: 'LIDER',
    recruiterChange: null,
    access: 'ACTIVE',
    userId: null,
    createdAt: new Date(Date.UTC(2026, 8, 27) - (n % 60) * 86_400_000).toISOString(),
    updatedAt: '2026-09-01T00:00:00Z',
    ...partes,
  };
}

function time(): { client: Parameters<typeof montarDossie>[0]; members: Member[] } {
  n = 0;
  const lideres = ['João Silva', 'Bruna Costa', 'Carla Nunes', 'Diego Prado', 'Elisa Ramos'].map((nome, i) =>
    pessoa({ name: nome, userId: `u-l${i}`, tier: 'LIDER', recruitedBy: MARINA }),
  );
  const equipe: Member[] = [];
  lideres.forEach((l, i) => {
    const r: Recruiter = { userId: l.userId, name: l.name, role: 'EQUIPE', tier: 'LIDER', photo: null };
    for (let k = 0; k < [18, 12, 7, 2, 0][i]; k += 1) {
      equipe.push(pessoa({ tier: 'EQUIPE', recruitedBy: r, access: 'NO_PHONE', voterId: k % 5 ? tituloValido() : k % 2 ? null : `10000000${String(n).padStart(2, '0')}` }));
    }
  });
  // Um repetido contado por dois Lideres, um sem origem.
  equipe.push(pessoa({ name: 'Ana Lima', phone: '82911110000', tier: 'EQUIPE', recruitedBy: { ...MARINA, userId: 'u-l0', name: 'João Silva', role: 'EQUIPE', tier: 'LIDER' } }));
  equipe.push(pessoa({ name: 'Ana Lima', phone: '82911110000', tier: 'EQUIPE', recruitedBy: { ...MARINA, userId: 'u-l1', name: 'Bruna Costa', role: 'EQUIPE', tier: 'LIDER' } }));
  equipe.push(pessoa({ name: 'Irene Campos', recruitedBy: null, tier: 'LIDER', access: 'NO_PHONE' }));

  const client: Parameters<typeof montarDossie>[0] = {
    name: 'Time Palmeira',
    stateUf: 'AL',
    cities: ['Palmeira dos Índios'],
    isDemo: false,
    createdAt: '2026-06-01T00:00:00Z',
    verificationEnabled: true,
    people: [{ id: 'p1', name: 'Marina Alves', phone: '82988887777', photo: null }] as Client['people'],
  };
  return { client, members: [...lideres, ...equipe] };
}

const ANALISE: AnaliseDoNeo = {
  manchete: 'Rede de 46 apoiadores cresce, mas 95% da base depende de três lideranças',
  carta:
    'A operação Time Palmeira chega a 46 apoiadores na base líquida, organizados por 6 lideranças e 1 coordenadora. O Índice de Mobilização está em 60, na faixa Estável: a rede funciona, mas ainda não tem fôlego próprio.\n\n' +
    'O que sustenta a rede hoje é João Silva. Sozinho, ele responde por 46,3% da base trazida pelas lideranças e foi o único a manter o ritmo nesta semana. Com Bruna Costa e Carla Nunes, as três maiores lideranças concentram 95% da base.\n\n' +
    'Essa concentração é o principal risco estratégico. Apenas 2 das 6 lideranças cadastraram nos últimos 30 dias, e o engajamento recente, em 33%, é o componente que mais segura o índice.\n\n' +
    'A decisão mais importante agora é ampliar a rede de lideranças antes de ampliar a base: cada nova liderança ativa, no padrão atual, traz em média 10,3 apoiadores.',
  leituraDoIndice:
    'O índice de 60 reflete uma rede com boa qualificação eleitoral, 79% com título válido. O que mais o puxa para baixo é o engajamento recente, em 33%.',
  conclusoes: [
    { titulo: 'Uma liderança puxa a rede', texto: 'João Silva trouxe 19 apoiadores, 18 deles nos últimos 30 dias.', natureza: 'forca' },
    { titulo: 'Base qualificada para o mapa eleitoral', texto: 'Todos os 47 cadastros têm zona e seção, e 79% têm título válido.', natureza: 'forca' },
    { titulo: 'Concentração elevada', texto: 'As 3 maiores lideranças somam 95% da base; a saída de uma delas pesa na rede inteira.', natureza: 'atencao' },
    { titulo: 'Engajamento em queda', texto: 'Só 2 das 6 lideranças cadastraram nos últimos 30 dias; a última semana caiu 14%.', natureza: 'atencao' },
    { titulo: 'Lideranças prontas para ativar', texto: 'Elisa Ramos e Irene Campos ainda não trouxeram apoiadores.', natureza: 'oportunidade' },
  ],
  forcaDaRede:
    'A ativação das lideranças está em 67%: 4 das 6 já trouxeram apoiadores, com média de 10,3 por liderança ativa. O número é sólido para uma rede nesta fase.\n\n' +
    'O desenho, porém, é estreito. Três lideranças somam 80% da base, e duas ainda não começaram. A rede cresce na velocidade de poucas pessoas.',
  cenario:
    'A base saiu de zero para 47 cadastros em sete semanas. Mantido o ritmo dos últimos 30 dias, a base líquida chegaria a 75 apoiadores em 30 dias, 104 em 60 e 133 em 90. Esse cenário depende de João Silva manter o passo; com mais lideranças ativas, ele se torna conservador.',
  liderancas: [
    { nome: 'João Silva', leitura: 'Maior base da rede, com 19 apoiadores e 18 novos em 30 dias.', proximoPasso: 'Reconhecer o resultado e pedir a indicação de duas novas lideranças.' },
    { nome: 'Bruna Costa', leitura: '13 apoiadores, mas nenhum cadastro nesta semana.', proximoPasso: 'Combinar uma meta curta para os próximos 7 dias.' },
    { nome: 'Carla Nunes', leitura: '7 apoiadores e nenhum novo cadastro há mais de 30 dias.', proximoPasso: 'Reunir-se para entender a parada.' },
    { nome: 'Elisa Ramos', leitura: 'Ainda não trouxe apoiadores.', proximoPasso: 'Acompanhar os primeiros cadastros junto com ela.' },
  ],
  territorio:
    'A base está distribuída de forma equilibrada entre quatro bairros, com Jardim Brasil, São Cristóvão e Xucurus em 12 apoiadores cada. Toda a rede está na Zona 10, espalhada por 7 seções.\n\n' +
    'A presença em uma única zona é o limite territorial mais claro: novas lideranças devem vir de outras zonas do município.',
  integridade:
    'A integridade da base está em 74%. Há 1 pessoa cadastrada duas vezes, por duas lideranças diferentes, o que infla o ranking das duas. Outros 6 cadastros têm título com dígitos a menos ou a mais.',
  recomendacoes: [
    { titulo: 'Corrigir o duplicado', acao: 'Remover a cópia de Ana Lima e manter o primeiro cadastro.', responsavel: 'Coordenação', prazo: 'Imediato', resultadoEsperado: 'O ranking volta a contar certo para as duas lideranças.' },
    { titulo: 'Reativar lideranças paradas', acao: 'Conversar com Carla Nunes e Diego Prado.', responsavel: 'Coordenação', prazo: 'Até 7 dias', resultadoEsperado: 'Engajamento recente acima de 50%.' },
    { titulo: 'Abrir novas frentes', acao: 'Recrutar lideranças em outras zonas eleitorais.', responsavel: 'Direção', prazo: 'Até 30 dias', resultadoEsperado: 'Menor dependência das 3 maiores lideranças.' },
    { titulo: 'Completar os títulos', acao: 'Corrigir os 6 títulos inconsistentes e completar os 4 que faltam.', responsavel: 'Coordenação', prazo: 'Até 30 dias', resultadoEsperado: 'Qualificação eleitoral acima de 95%.' },
  ],
  decisoesDaDirecao: [
    'Qual meta de base líquida a rede deve atingir em 90 dias?',
    'Em quais zonas a direção quer presença antes do fim do trimestre?',
  ],
  fechamento:
    'A rede tem base qualificada e uma liderança de alto desempenho. O próximo salto não depende de mais cadastros, mas de mais lideranças ativas.',
};

describe('dossie do time', () => {
  it('conta estrutura, Líderes e Equipe a partir do cadastro', () => {
    const { client, members } = time();
    const d = montarDossie(client, members, new Date('2026-09-27T12:00:00Z'));

    expect(d.numeros.total).toBe(members.length);
    expect(d.numeros.lideres).toBe(6);
    expect(d.numeros.administradores).toBe(1);
    expect(d.lideres[0]).toMatchObject({ nome: 'João Silva', equipe: 19 });
    expect(d.numeros.lideresAtivos).toBe(4);
    // Marina cadastrou os 5 Lideres (o sexto nao tem origem).
    expect(d.administradores[0]).toMatchObject({ nome: 'Marina Alves', cadastrou: 5 });
    expect(d.crescimento).toHaveLength(12);
    const ana = d.qualidade.repetidos.find((g) => g.nome === 'Ana Lima');
    expect(ana?.responsaveis).toHaveLength(2);
    expect(d.qualidade.repetidos).toHaveLength(1);
    expect(d.pessoas).toHaveLength(members.length);
  });

  it('calcula a leitura estratégica: base líquida, índice, selos e cenário', () => {
    const { client, members } = time();
    const d = montarDossie(client, members, new Date('2026-09-27T12:00:00Z'));
    const e = d.estrategia;

    // Ana Lima, cadastrada duas vezes, sai da base líquida.
    expect(e.baseDeclarada).toBe(members.length);
    expect(e.baseLiquida).toBe(members.length - 1);
    expect(e.ativacao).toBe(67);
    expect(e.indice.componentes.map((c) => c.peso).reduce((a, b) => a + b)).toBe(100);
    expect(e.indice.valor).toBeGreaterThan(0);
    expect(d.lideres[0]).toMatchObject({ nome: 'João Silva', posicao: 1, selo: 'Motor' });
    expect(d.lideres.find((l) => l.nome === 'Elisa Ramos')?.selo).toBe('Sem Equipe');
    expect(e.selos.reduce((soma, x) => soma + x.quantidade, 0)).toBe(d.lideres.length);
    expect(e.projecao?.em90).toBeGreaterThan(e.baseLiquida);
    expect(e.acumulado.at(-1)).toBe(members.length);
  });

  it('a leitura automática sai no formato do NEO, sem jargão de sistema', () => {
    const { client, members } = time();
    const automatica = analiseAutomatica(montarDossie(client, members));
    expect(lerAnalise(automatica)).toEqual(automatica);
    const texto = JSON.stringify(automatica);
    expect(texto).not.toMatch(/painel|Time DEMO|saúde do cadastro|planilha/i);

    const vazia = analiseAutomatica(montarDossie(client, []));
    expect(lerAnalise(vazia)).not.toBeNull();
  });
});

describe('o que vai para a OpenAI', () => {
  it('não leva telefone, CPF, título nem o nome de quem é da Equipe', () => {
    const { client, members } = time();
    const resumo = JSON.stringify(resumoParaONeo(montarDossie(client, members)));

    expect(resumo).not.toContain('52998224725');
    expect(resumo).not.toMatch(/10000000\d{2}/);
    expect(resumo).not.toMatch(/829\d{8}/);
    expect(resumo).not.toContain('Pessoa 10 Souza');
    // Quem coordena, sim: a analise fala deles.
    expect(resumo).toContain('João Silva');
    expect(resumo).toContain('Marina Alves');
  });
});

describe('a resposta do NEO', () => {
  it('schema strict: todo objeto fechado e com todos os campos obrigatórios', () => {
    const conferir = (no: unknown): void => {
      if (!no || typeof no !== 'object') return;
      const o = no as { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; items?: unknown };
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
      }
      Object.values(o.properties ?? {}).forEach(conferir);
      conferir(o.items);
    };
    conferir(NEO_SCHEMA);
  });

  it('lê o texto da Responses API e confere o formato', () => {
    const bruta = {
      output: [
        { type: 'reasoning', content: [] },
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(ANALISE) }] },
      ],
    };
    expect(lerAnalise(textoDaResposta(bruta))).toEqual(ANALISE);
  });

  it('recusa, texto torto ou campo faltando viram "sem análise"', () => {
    expect(textoDaResposta({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'não' }] }] })).toBeNull();
    expect(lerAnalise('isto não é json')).toBeNull();
    expect(lerAnalise({ ...ANALISE, recomendacoes: [{ ...ANALISE.recomendacoes[0], prazo: 'Amanhã' }] })).toBeNull();
  });

  it('o serviço manda o schema strict, sem guardar a conversa, e trata a falha', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste');
    const { analisarComONeo, NeoFalhou } = await import('@/lib/server/neo.service');
    const { client, members } = time();
    const resumo = resumoParaONeo(montarDossie(client, members));

    let corpo: Record<string, unknown> = {};
    const ok = vi.fn(async (_url: unknown, init?: RequestInit) => {
      corpo = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: JSON.stringify(ANALISE) }), { status: 200 });
    });
    await expect(analisarComONeo(resumo, { fetch: ok as unknown as typeof fetch })).resolves.toEqual(ANALISE);
    expect(corpo.model).toBe('gpt-5.4-mini');
    expect(corpo.store).toBe(false);
    expect(corpo.text).toMatchObject({ format: { type: 'json_schema', strict: true } });

    const limite = vi.fn(async () => new Response('{}', { status: 429 }));
    await expect(analisarComONeo(resumo, { fetch: limite as unknown as typeof fetch })).rejects.toBeInstanceOf(NeoFalhou);

    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(analisarComONeo(resumo, { fetch: ok as unknown as typeof fetch })).rejects.toMatchObject({ codigo: 'SEM_CONFIGURACAO' });
    vi.unstubAllEnvs();
  });
});

describe('o PDF', () => {
  async function gerar(neo: AnaliseDoNeo | null) {
    const { client, members } = time();
    const dossie = montarDossie(client, members, new Date('2026-09-27T12:00:00Z'));
    const props = { dossie, neo, neoErro: neo ? null : 'O NEO não está configurado.', modelo: 'gpt-5.4-mini' };
    const buffer = await pdf(createElement(RelatorioDoTime, props) as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = await new Response(buffer as unknown as ReadableStream).arrayBuffer();
    return { dossie, bytes: Buffer.from(bytes) };
  }

  it('sai inteiro com a análise do NEO', async () => {
    const { dossie, bytes } = await gerar(ANALISE);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nomeDoPdf(dossie)).toBe('relatorio-estrategico-time-palmeira-2026-09-27.pdf');
    if (process.env.PREVIA_PDF) {
      writeFileSync(process.env.PREVIA_PDF, bytes);
      writeFileSync(
        process.env.PREVIA_PDF.replace('.pdf', '.json'),
        JSON.stringify({ dossie, neo: ANALISE, neoErro: null, modelo: 'gpt-5.4-mini' }),
      );
    }
  }, 30_000);

  it('sai inteiro sem o NEO', async () => {
    const { bytes } = await gerar(null);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_PDF) writeFileSync(process.env.PREVIA_PDF.replace('.pdf', '-sem-neo.pdf'), bytes);
  }, 30_000);
});

describe('o PDF de um time grande', () => {
  it('sai inteiro com 1.200 pessoas e 40 lideranças (dezenas de páginas)', async () => {
    // O cabecalho e o rodape repetem em toda pagina. Um estilo herdado mal
    // resolvido crescia a cada pagina ate o PDF nao sair: so aparecia em
    // time grande, que e justamente o que vai para a direcao.
    const { client, members } = time();
    const lideres = Array.from({ length: 40 }, (_, i) =>
      pessoa({ name: `Liderança ${i + 1} Almeida`, userId: `u-g${i}`, tier: 'LIDER', recruitedBy: MARINA }),
    );
    const base = lideres.flatMap((l, i) =>
      Array.from({ length: 30 }, () =>
        pessoa({ tier: 'EQUIPE', access: 'NO_PHONE', recruitedBy: { userId: l.userId, name: l.name, role: 'EQUIPE', tier: 'LIDER', photo: null }, district: `Bairro ${i % 9}` }),
      ),
    );
    const dossie = montarDossie(client, [...members, ...lideres, ...base], new Date('2026-09-27T12:00:00Z'));
    expect(dossie.numeros.total).toBeGreaterThan(1200);
    const props = { dossie, neo: null, neoErro: null, modelo: 'gpt-5.4-mini' };
    const buffer = await pdf(createElement(RelatorioDoTime, props) as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_PDF) writeFileSync(process.env.PREVIA_PDF.replace('.pdf', '-grande.pdf'), bytes);
  }, 120_000);
});
