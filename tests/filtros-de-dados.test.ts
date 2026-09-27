import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import type { Member } from '@/lib/types';
import { aplicarFiltros, contarPorFiltro } from '@/lib/domain/filtros-de-dados';
import { ListaFiltrada } from '@/components/neo/RelatorioPdf';

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

const semCpf = pessoa({ name: 'Ana Sem CPF', cpf: null });
const cpfCurto = pessoa({ name: 'Bia CPF Curto', cpf: '529982247' });
const cpfErrado = pessoa({ name: 'Caio CPF Errado', cpf: '52998224700' });
const emOrdem = pessoa({ name: 'Davi Em Ordem' });
const todos = [semCpf, cpfCurto, cpfErrado, emOrdem];
const contexto = { repetidos: new Set<string>() };

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
});
