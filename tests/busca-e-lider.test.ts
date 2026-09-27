import { describe, expect, it } from 'vitest';
import type { Member, Recruiter } from '@/lib/types';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';
import { perfilDoLider } from '@/lib/domain/perfil-do-lider';
import { cadastrosRepetidos } from '@/lib/domain/inconsistencias';

/**
 * A busca da lista do time e o painel do Lider.
 */

let n = 0;
function pessoa(partes: Partial<Member>): Member {
  n += 1;
  return {
    id: `m${n}`, clientId: 'c', name: `Pessoa ${n}`, phone: `8299990${String(n).padStart(4, '0')}`,
    email: null, photo: null, gender: null, cpf: null, voterId: null, zone: '10', section: '147',
    state: 'AL', city: 'Palmeira dos Índios', district: 'Centro', street: 'Rua A',
    relationshipOptionId: null, relationshipLabel: null, responses: [], consentAt: null, source: 'invite',
    recruitedBy: null, tier: 'EQUIPE', tag: null, recruiterChange: null, access: 'NO_PHONE', userId: null,
    createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z', ...partes,
  };
}

describe('busca por qualquer dado', () => {
  const maria = pessoa({
    name: 'Maria José da Silva', phone: '82999871807', cpf: '52998224725', voterId: '100000002720',
    district: 'Jardim Brasil', street: 'Rua Brasil Novo', zone: '10', section: '326',
    recruitedBy: { userId: 'u1', name: 'João Silva', role: 'EQUIPE', tier: 'LIDER', photo: null },
  });

  it('acha pelo nome, sem acento e sem caixa', () => {
    expect(buscarPessoa(maria, 'jose')).toMatchObject({ achou: true, campos: ['nome'] });
  });

  it('acha pelo CPF, título e telefone, com ou sem máscara', () => {
    expect(buscarPessoa(maria, '529.982.247-25').campos).toEqual(['CPF']);
    expect(buscarPessoa(maria, '529982').campos).toEqual(['CPF']);
    expect(buscarPessoa(maria, '1000 0000 2720').campos).toContain('título');
    expect(buscarPessoa(maria, '(82) 99987-1807').campos).toEqual(['telefone']);
  });

  it('acha pelo bairro, rua, zona/seção e responsável', () => {
    expect(buscarPessoa(maria, 'jardim').campos).toEqual(['bairro']);
    expect(buscarPessoa(maria, 'brasil novo').campos).toContain('rua');
    expect(buscarPessoa(maria, '10/326').campos).toEqual(['zona/seção']);
    expect(buscarPessoa(maria, 'joão').campos).toContain('responsável');
  });

  it('várias palavras se somam: todas precisam bater', () => {
    expect(buscarPessoa(maria, 'maria jardim').achou).toBe(true);
    expect(buscarPessoa(maria, 'maria xucurus').achou).toBe(false);
  });

  it('número curto não sai achando todo telefone', () => {
    // "10" e a zona, e nao "qualquer telefone com 10 no meio".
    expect(buscarPessoa(pessoa({ name: 'Carla Nunes', phone: '82910000000', zone: '5', section: '7' }), '10').achou).toBe(false);
  });

  it('busca vazia acha todo mundo', () => {
    expect(buscarPessoa(maria, '   ').achou).toBe(true);
  });
});

describe('painel do Líder', () => {
  const agora = new Date('2026-09-27T12:00:00Z');
  const dias = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();
  const lider = (nome: string, userId: string) => pessoa({ name: nome, userId, tier: 'LIDER', access: 'ACTIVE' });
  const de = (l: Member): Recruiter => ({ userId: l.userId, name: l.name, role: 'EQUIPE', tier: 'LIDER', photo: null });

  const joao = lider('João Silva', 'u-joao');
  const bruna = lider('Bruna Costa', 'u-bruna');
  const elisa = lider('Elisa Ramos', 'u-elisa');
  const equipeJoao = [
    pessoa({ recruitedBy: de(joao), createdAt: dias(1) }),
    pessoa({ recruitedBy: de(joao), createdAt: dias(2), voterId: null, cpf: '123' }),
    pessoa({ recruitedBy: de(joao), createdAt: dias(20), district: 'Xucurus' }),
    pessoa({ name: 'Ana Lima', phone: '82911110000', recruitedBy: de(joao), createdAt: dias(40) }),
  ];
  const equipeBruna = [pessoa({ name: 'Ana Lima', phone: '82911110000', recruitedBy: de(bruna), createdAt: dias(45) })];
  const todos = [joao, bruna, elisa, ...equipeJoao, ...equipeBruna];

  it('conta a Equipe, o ritmo e a posição no ranking', () => {
    const p = perfilDoLider(joao, todos, cadastrosRepetidos(todos), agora);
    expect(p.total).toBe(4);
    expect(p.ultimos7).toBe(2);
    expect(p.ultimos30).toBe(3);
    expect(p.posicao).toBe(1);
    expect(p.totalDeLideres).toBe(3);
    expect(p.participacao).toBe(80);
    expect(p.selo).toBe('Motor');
    expect(p.diasSemCadastrar).toBe(1);
    expect(p.semanas).toHaveLength(12);
  });

  it('mostra as inconsistências da Equipe dele, e quem mais contou o repetido', () => {
    const p = perfilDoLider(joao, todos, cadastrosRepetidos(todos), agora);
    expect(p.paraConferir.map((x) => x.motivos)).toContainEqual(['CPF com 3 dígitos']);
    expect(p.repetidos).toHaveLength(1);
    expect(p.repetidos[0].outrosResponsaveis).toEqual(['Bruna Costa · Líder']);
    expect(p.saude).toBeLessThan(100);
  });

  it('selo: parado e sem Equipe', () => {
    expect(perfilDoLider(bruna, todos, [], agora).selo).toBe('Parado');
    expect(perfilDoLider(elisa, todos, [], agora)).toMatchObject({ selo: 'Sem Equipe', total: 0, diasSemCadastrar: null });
  });
});
