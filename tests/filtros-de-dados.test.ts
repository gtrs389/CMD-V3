import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import type { Member } from '@/lib/types';
import { FILTROS_DE_DADOS, aplicarFiltros, contarPorFiltro, contextoDosFiltros, fichasPorTelefone } from '@/lib/domain/filtros-de-dados';
import { agruparPorResponsavel, agruparPorTelefone, barrasPorResponsavel } from '@/lib/domain/por-responsavel';
import { ListaFiltrada, RelatorioDeInconsistencias } from '@/components/neo/ListasPdf';

/**
 * Filtro por dado do quadro de inconsistencias: quem cai em cada filtro, o
 * motivo, e o PDF so com os filtrados.
 */

let n = 0;
function pessoa(partes: Partial<Member>): Member {
  n += 1;
  return {
    id: `m${n}`, clientId: 'c', name: `Pessoa ${n}`, phone: '82999990001', email: null, photo: null,
    gender: null, cpf: '52998224725', voterId: '100000002720', zone: '10', section: '147', state: 'AL',
    city: 'Palmeira dos Índios', district: 'Centro', street: 'Rua A', relationshipOptionId: null,
    relationshipLabel: null, responses: [], consentAt: null, source: 'invite',
    recruitedBy: { userId: 'u1', name: 'João Silva', role: 'EQUIPE', tier: 'LIDER', photo: null },
    tier: 'EQUIPE', recruiterChange: null, access: 'NO_PHONE', userId: null,
    createdAt: '2026-09-10T12:00:00Z', updatedAt: '2026-09-10T12:00:00Z', ...partes,
  };
}

const semCpf = pessoa({ name: 'Ana Sem CPF', cpf: null, tier: 'LIDER', phone: '82999990010' });
const cpfCurto = pessoa({ name: 'Bia CPF Curto', cpf: '529982247', phone: '82999990011' });
const cpfErrado = pessoa({ name: 'Caio CPF Errado', cpf: '52998224700', phone: '82999990012' });
const emOrdem = pessoa({ name: 'Davi Em Ordem', phone: '82999990013' });
const todos = [semCpf, cpfCurto, cpfErrado, emOrdem];
const contexto = contextoDosFiltros(todos, []);

describe('filtro por dado', () => {
  it('cada filtro pega só o seu caso', () => {
    expect(aplicarFiltros(todos, ['cpf-incompleto'], contexto)[0]).toMatchObject({
      member: { name: 'Bia CPF Curto' },
      motivos: ['CPF com 9 dígitos'],
    });
    expect(aplicarFiltros(todos, ['cpf-errado'], contexto).map((p) => p.member.name)).toEqual(['Caio CPF Errado']);
  });

  it('marcar vários soma as listas, e quem está em ordem não aparece', () => {
    const nomes = aplicarFiltros(todos, ['cpf-incompleto', 'cpf-errado'], contexto).map((p) => p.member.name);
    expect(nomes).toEqual(['Bia CPF Curto', 'Caio CPF Errado']);
    expect(aplicarFiltros(todos, [], contexto)).toEqual([]);
  });

  it('não existe filtro "Sem CPF": CPF vazio não é pendência de ninguém', () => {
    expect(FILTROS_DE_DADOS.some((f) => /sem cpf/i.test(f.rotulo))).toBe(false);
    expect(aplicarFiltros(todos, ['sem-cpf'], contexto)).toEqual([]);
    const contagem = contarPorFiltro(todos, contexto);
    expect(contagem['sem-cpf']).toBeUndefined();
  });

  it('telefone compartilhado é contado pelos números, não pelo estado do acesso', () => {
    // Todos com acesso ATIVO: antes, o filtro olhava o acesso e dava zero.
    const a = pessoa({ name: 'Fábio', phone: '(82) 98888-7777', access: 'ACTIVE' });
    const b = pessoa({ name: 'Gina', phone: '82988887777', access: 'ACTIVE' });
    const c = pessoa({ name: 'Hugo', phone: '82 98888 7777', access: 'NO_PHONE' });
    const sozinho = pessoa({ name: 'Ivo', phone: '82977776666' });
    const lista = [a, b, c, sozinho];
    expect(fichasPorTelefone(lista).get(a.id)).toBe(3);
    const achados = aplicarFiltros(lista, ['telefone-repetido'], contextoDosFiltros(lista, []));
    expect(achados.map((p) => p.member.name)).toEqual(['Fábio', 'Gina', 'Hugo']);
    expect(achados[0].motivos).toEqual(['telefone compartilhado (3 fichas)']);
  });

  it('conta quantos caem em cada filtro', () => {
    const contagem = contarPorFiltro(todos, contexto);
    expect(contagem['cpf-incompleto']).toBe(1);
    expect(contagem['sem-titulo']).toBe(0);
  });

  it('diz em quais filtros cada pessoa caiu', () => {
    const [bia] = aplicarFiltros(todos, ['cpf-errado', 'cpf-incompleto'], contexto);
    expect(bia).toMatchObject({ member: { name: 'Bia CPF Curto' }, filtros: ['cpf-incompleto'] });
  });

  it('agrupa por quem cadastrou: quem tem mais primeiro, e cada grupo em ordem alfabética', () => {
    const itens = [
      { nome: 'Zeca', cadastradoPor: 'Bruna Costa · Líder' },
      { nome: 'Ana', cadastradoPor: 'João Silva · Líder' },
      { nome: 'Caio', cadastradoPor: 'João Silva · Líder' },
      { nome: 'Beto', cadastradoPor: 'João Silva · Líder' },
    ];
    const grupos = agruparPorResponsavel(itens);
    expect(grupos.map((g) => g.responsavel)).toEqual(['João Silva · Líder', 'Bruna Costa · Líder']);
    expect(grupos[0].itens.map((i) => i.nome)).toEqual(['Ana', 'Beto', 'Caio']);

    const barras = barrasPorResponsavel(
      [{ cadastradoPor: 'João', c: [0, 1] }, { cadastradoPor: 'João', c: [1] }, { cadastradoPor: 'Bruna', c: [0] }],
      2,
      (x) => x.c,
      { João: 40 },
    );
    expect(barras[0]).toEqual({ responsavel: 'João', quantidades: [1, 2], total: 2, base: 40 });
    expect(barras[1]).toMatchObject({ responsavel: 'Bruna', total: 1, base: null });
  });

  it('o PDF sai agrupado por quem cadastrou, com o gráfico por liderança', async () => {
    const lideres = ['João Silva · Líder', 'Bruna Costa · Líder', 'Carla Nunes · Líder', 'Marina Alves · Administração do time'];
    const bairros = ['Centro', 'Xucurus', 'Jardim Brasil', 'São Cristóvão'];
    const nomes = ['Ana Paula Lima', 'Bruno Ferreira', 'Cícero Gomes', 'Daniela Rocha', 'Edson Batista', 'Fátima Nunes', 'Gilberto Santos', 'Helena Prado', 'Ivone Barros', 'José Carlos Melo', 'Kátia Moura', 'Luiz Henrique', 'Marta Campos', 'Nivaldo Reis', 'Otília Souza', 'Paulo Roberto', 'Quitéria Lins', 'Raimundo Alves', 'Sandra Vieira', 'Tereza Cristina', 'Ubiratan Dias', 'Valdete Silva'];
    const pessoas = nomes.map((nome, i) => ({
      nome,
      telefone: `8299${String(1000000 + i * 7919).slice(0, 7)}`,
      bairro: bairros[i % 4],
      cadastradoPor: lideres[i % 7 < 3 ? 0 : i % 7 < 5 ? 1 : i % 7 < 6 ? 2 : 3],
      cadastradoEm: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
      filtros: i % 3 === 0 ? [0, 1] : [i % 2],
    }));
    const doc = createElement(ListaFiltrada, {
      time: 'Time Palmeira',
      filtros: ['Título incompleto', 'Sem zona ou seção'],
      responsavel: null,
      pessoas,
      geradaEm: '2026-09-27T12:00:00Z',
      basePorResponsavel: { [lideres[0]]: 120, [lideres[1]]: 64, [lideres[2]]: 18, [lideres[3]]: 9 },
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_LISTA) (await import('node:fs')).writeFileSync(process.env.PREVIA_LISTA, bytes);
  }, 30_000);

  it('só "Telefone compartilhado": o PDF é organizado por número', async () => {
    const hugo = 'Hugo Humberto Pereira do Nascimento · Líder';
    const bruna = 'Bruna Costa · Líder';
    const p = (nome: string, tel: string, por: string, bairro = '') => ({
      nome, telefone: tel, bairro, cadastradoPor: por, cadastradoEm: '2026-09-17T12:00:00Z', filtros: [0],
    });
    const pessoas = [
      p('Ana Cleide Martins da Silva', '8299247526', hugo, 'CEP 57607-200'),
      p('Arnaldo Lima da Silva', '(82) 9924-7526', hugo),
      p('Avanilza Martins da Silva', '8299247526', hugo),
      p('Daiane Lima da Silva', '8299247526', bruna),
      p('Ananias Pinto da Silva', '82996321537', hugo, 'Sítio Amaro'),
      p('Carmem Lúcia Valentin da Silva Pereira', '82996321537', hugo, 'Sítio Amaro'),
      p('Caio Oliveira da Silva Pereira', '8198672444', hugo, 'Aldeia'),
      p('Elisiane Oliveira da Silva Pereira', '8198672444', hugo, 'Aldeia'),
    ];
    const grupos = agruparPorTelefone(pessoas);
    expect(grupos.map((g) => [g.telefone, g.itens.length])).toEqual([
      ['8299247526', 4],
      ['8198672444', 2],
      ['82996321537', 2],
    ]);

    const doc = createElement(ListaFiltrada, {
      time: 'Time Palmeira', filtros: ['Telefone compartilhado'], responsavel: null, pessoas,
      geradaEm: '2026-09-27T12:00:00Z', indiceDoTelefoneCompartilhado: 0,
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_LISTA) (await import('node:fs')).writeFileSync(process.env.PREVIA_LISTA.replace('.pdf', '-numeros.pdf'), bytes);
  }, 30_000);

  it('lista grande: grupos que atravessam páginas saem inteiros', async () => {
    const pessoas = Array.from({ length: 400 }, (_, i) => ({
      nome: `Pessoa ${String(i).padStart(3, '0')} Lima`,
      telefone: `82999${String(i).padStart(6, '0')}`,
      bairro: `Bairro ${i % 9}`,
      cadastradoPor: `Liderança ${(i * 7) % 12} · Líder`,
      cadastradoEm: new Date(Date.UTC(2026, 6, 1 + (i % 60))).toISOString(),
      filtros: [i % 3],
    }));
    const doc = createElement(ListaFiltrada, {
      time: 'Time Palmeira', filtros: ['Sem título', 'Sem rua', 'Sem bairro'], responsavel: null, pessoas, geradaEm: '2026-09-27T12:00:00Z',
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_LISTA) (await import('node:fs')).writeFileSync(process.env.PREVIA_LISTA.replace('.pdf', '-grande.pdf'), bytes);
  }, 60_000);

  it('o relatório do quadro de inconsistências sai em PDF, e não em planilha', async () => {
    const doc = createElement(RelatorioDeInconsistencias, {
      time: 'Time Palmeira',
      responsavel: null,
      geradoEm: '2026-09-27T12:00:00Z',
      total: 40,
      pessoasComProblema: 6,
      saude: 85,
      repetidos: [
        {
          nome: 'Ana Lima', certeza: 'Repetido com certeza', nivel: 'certa', evidencias: ['Mesmo nome e telefone'], divergencias: [],
          responsaveis: ['João Silva · Líder', 'Bruna Costa · Líder'],
          registros: [
            { nome: 'Ana Lima', telefone: '82911110000', cadastradoPor: 'João Silva · Líder', cadastradoEm: '2026-08-12T00:00:00Z', primeiro: true },
            { nome: 'Ana Lima', telefone: '82911110000', cadastradoPor: 'Bruna Costa · Líder', cadastradoEm: '2026-08-13T00:00:00Z', primeiro: false },
          ],
        },
      ],
      basePorResponsavel: { 'João Silva · Líder': 120, 'Bruna Costa · Líder': 64, 'Carla Nunes · Líder': 18 },
      secoes: [
        {
          titulo: 'Cadastros com dado faltando', explicacao: 'Entraram com buraco — quase sempre da planilha ou de um cadastro às pressas.', gravidade: 'media',
          pessoas: [
            { nome: 'Caio Mendes', telefone: '82999990001', detalhe: 'falta título de eleitor', cadastradoPor: 'João Silva · Líder' },
            { nome: 'Alice Freitas', telefone: '82999990002', detalhe: 'falta rua', cadastradoPor: 'João Silva · Líder' },
            { nome: 'Rui Barbosa', telefone: '82999990003', detalhe: 'falta zona e seção', cadastradoPor: 'Bruna Costa · Líder' },
            { nome: 'Nina Costa', telefone: '82999990004', detalhe: 'falta bairro', cadastradoPor: 'João Silva · Líder' },
          ],
        },
        {
          titulo: 'Dados para conferir', explicacao: 'Preenchidos, mas não podem existir assim.', gravidade: 'alta',
          pessoas: [
            { nome: 'Caio Mendes', telefone: '82999990001', detalhe: 'CPF não confere', cadastradoPor: 'João Silva · Líder' },
            { nome: 'Lia Souza', telefone: '82999990005', detalhe: 'título com 10 dígitos', cadastradoPor: 'Carla Nunes · Líder' },
          ],
        },
      ],
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_INCONS) (await import('node:fs')).writeFileSync(process.env.PREVIA_INCONS, bytes);
  }, 30_000);
});
