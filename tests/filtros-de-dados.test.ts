import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import type { Member } from '@/lib/types';
import { aplicarFiltros, contarPorFiltro, contextoDosFiltros, fichasPorTelefone } from '@/lib/domain/filtros-de-dados';
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
    expect(aplicarFiltros(todos, ['sem-cpf'], contexto).map((p) => p.member.name)).toEqual(['Ana Sem CPF']);
    expect(aplicarFiltros(todos, ['cpf-incompleto'], contexto)[0]).toMatchObject({
      member: { name: 'Bia CPF Curto' },
      motivos: ['CPF com 9 dígitos'],
    });
    expect(aplicarFiltros(todos, ['cpf-errado'], contexto).map((p) => p.member.name)).toEqual(['Caio CPF Errado']);
  });

  it('marcar vários soma as listas, e quem está em ordem não aparece', () => {
    const nomes = aplicarFiltros(todos, ['sem-cpf', 'cpf-incompleto', 'cpf-errado'], contexto).map((p) => p.member.name);
    expect(nomes).toEqual(['Ana Sem CPF', 'Bia CPF Curto', 'Caio CPF Errado']);
    expect(aplicarFiltros(todos, [], contexto)).toEqual([]);
  });

  it('Equipe sem CPF não é pendência: o filtro é só de Líder', () => {
    const equipeSemCpf = pessoa({ name: 'Edu Equipe Sem CPF', cpf: null, tier: 'EQUIPE', phone: '82999990014' });
    const lista = [...todos, equipeSemCpf];
    const nomes = aplicarFiltros(lista, ['sem-cpf'], contextoDosFiltros(lista, [])).map((p) => p.member.name);
    expect(nomes).toEqual(['Ana Sem CPF']);
  });

  it('telefone repetido é contado pelos números, não pelo estado do acesso', () => {
    // Todos com acesso ATIVO: antes, o filtro olhava o acesso e dava zero.
    const a = pessoa({ name: 'Fábio', phone: '(82) 98888-7777', access: 'ACTIVE' });
    const b = pessoa({ name: 'Gina', phone: '82988887777', access: 'ACTIVE' });
    const c = pessoa({ name: 'Hugo', phone: '82 98888 7777', access: 'NO_PHONE' });
    const sozinho = pessoa({ name: 'Ivo', phone: '82977776666' });
    const lista = [a, b, c, sozinho];
    expect(fichasPorTelefone(lista).get(a.id)).toBe(3);
    const achados = aplicarFiltros(lista, ['telefone-repetido'], contextoDosFiltros(lista, []));
    expect(achados.map((p) => p.member.name)).toEqual(['Fábio', 'Gina', 'Hugo']);
    expect(achados[0].motivos).toEqual(['telefone em 3 fichas do time']);
  });

  it('conta quantos caem em cada filtro', () => {
    const contagem = contarPorFiltro(todos, contexto);
    expect(contagem['sem-cpf']).toBe(1);
    expect(contagem['cpf-incompleto']).toBe(1);
    expect(contagem['sem-titulo']).toBe(0);
  });

  it('o PDF sai só com os filtrados, com quem cadastrou', async () => {
    const pessoas = aplicarFiltros(todos, ['sem-cpf'], contexto).map(({ member, motivos }) => ({
      nome: member.name, telefone: member.phone, motivos, cadastradoPor: 'João Silva · Líder', cadastradoEm: member.createdAt,
    }));
    const doc = createElement(ListaFiltrada, {
      time: 'Time Palmeira', filtros: ['Sem CPF'], responsavel: null, pessoas, geradaEm: '2026-09-27T12:00:00Z',
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_LISTA) (await import('node:fs')).writeFileSync(process.env.PREVIA_LISTA, bytes);
  }, 30_000);

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
      secoes: [
        { titulo: 'Cadastros com dado faltando', explicacao: 'Entraram com buraco.', gravidade: 'media', pessoas: [{ nome: 'Caio', telefone: '82999990001', detalhe: 'falta título', cadastradoPor: 'João Silva · Líder' }] },
      ],
    });
    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const bytes = Buffer.from(await new Response(buffer as unknown as ReadableStream).arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PREVIA_INCONS) (await import('node:fs')).writeFileSync(process.env.PREVIA_INCONS, bytes);
  }, 30_000);
});
