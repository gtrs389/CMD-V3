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
  manchete: 'Time cresce puxado por dois Líderes, mas a base de dados precisa de faxina.',
  resumoExecutivo:
    'O Time Palmeira tem 45 pessoas, com 6 Líderes. João Silva e Bruna Costa respondem por 30 dos 39 cadastros feitos por Líderes.\n\nO ponto de atenção é a qualidade: 12 cadastros estão sem título, e Ana Lima foi cadastrada duas vezes, por dois Líderes diferentes.',
  indice: { valor: 64, rotulo: 'Estável', justificativa: 'Ritmo bom, concentrado em dois Líderes, e 9% da base com dado para conferir.' },
  destaques: [
    { titulo: 'Dois motores', detalhe: 'João Silva (18) e Bruna Costa (12) somam 77% dos cadastros de Líderes.' },
    { titulo: 'Território coberto', detalhe: 'Os 4 bairros principais têm pelo menos 9 pessoas cada.' },
  ],
  riscos: [
    { titulo: 'Dependência de poucos', detalhe: 'Se João Silva parar, o time perde 46% do ritmo.', gravidade: 'alta' },
    { titulo: 'Títulos incompletos', detalhe: '8 cadastros com título de 10 dígitos.', gravidade: 'media' },
  ],
  lideres: [
    { nome: 'João Silva', perfil: 'Motor', leitura: '18 na Equipe, o maior do time.' },
    { nome: 'Elisa Ramos', perfil: 'Parado', leitura: 'Nenhum cadastro desde que entrou.' },
  ],
  territorio: 'A equipe está bem distribuída entre Centro, Xucurus, Jardim Brasil e São Cristóvão.',
  qualidadeDosDados: 'Há 1 cadastro repetido contado por dois Líderes e 8 títulos para conferir.',
  planoDeAcao: [
    { acao: 'Excluir a cópia de Ana Lima', responsavel: 'Administração do time', prazo: 'Hoje', impacto: 'O ranking volta a contar certo.' },
    { acao: 'Conversar com Elisa Ramos', responsavel: 'Administração do time', prazo: 'Esta semana', impacto: 'Reativa um Líder parado.' },
  ],
  perguntas: ['O que falta para Elisa Ramos começar?', 'Quem confere os títulos antes de mandar a planilha?'],
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
    expect(lerAnalise({ ...ANALISE, indice: { ...ANALISE.indice, valor: 250 } })).toBeNull();
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
    expect(nomeDoPdf(dossie)).toBe('relatorio-time-palmeira-2026-09-27.pdf');
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
