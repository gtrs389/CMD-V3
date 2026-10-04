import { describe, expect, it } from 'vitest';
import type { Member, Recruiter } from '@/lib/types';
import type { PlaceMember, PollingPlacePin } from '@/lib/domain/map-pin';
import { escolaDaSecao, pessoasPorEscola, rankingDeLideres, rankingDeVotos } from '@/lib/domain/votos-por-lideranca';

const escola = (id: string, titulo: string, secoes: [string, string, number][]): PollingPlacePin => ({
  locationId: id,
  latitude: -9.4,
  longitude: -36.6,
  title: titulo,
  address: null,
  city: 'Palmeira dos Índios',
  state: 'AL',
  imageUrl: null,
  total: secoes.reduce((s, [, , n]) => s + n, 0),
  men: 0,
  women: 0,
  others: 0,
  sections: secoes.map(([zone, section, total]) => ({ zone, section, total })),
});

const ESCOLAS = [
  escola('a', 'Escola A', [['10', '144', 20], ['10', '145', 12]]),
  escola('b', 'Escola B', [['10', '200', 30]]),
  escola('c', 'Escola C', [['28', '10', 5]]),
];

let n = 0;
function pessoa(p: Partial<Member>): Member {
  n += 1;
  return {
    id: `m${n}`, clientId: 't', name: `Pessoa ${n}`, phone: `8299${String(n).padStart(7, '0')}`, email: null, photo: null, gender: null, cpf: null,
    voterId: null, zone: null, section: null, state: 'AL', city: 'X', district: 'Centro', street: 'Rua', relationshipOptionId: null,
    relationshipLabel: null, responses: [], consentAt: null, source: 'invite', recruitedBy: null, tier: 'EQUIPE', tag: null,
    recruiterChange: null, access: 'ACTIVE', userId: null, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
    ...p,
  } as Member;
}
const de = (uid: string, nome: string): Recruiter => ({ userId: uid, name: nome, role: 'EQUIPE', tier: 'LIDER', photo: null });

describe('ranking de votos (escolas e zonas)', () => {
  it('ordena as escolas e soma as zonas, com a escola forte de cada uma', () => {
    const r = rankingDeVotos(ESCOLAS);
    expect(r.total).toBe(67);
    expect(r.escolas.map((e) => e.place.title)).toEqual(['Escola A', 'Escola B', 'Escola C']);
    expect(r.zonas[0]).toMatchObject({ zona: '10', votos: 62, escolas: 2, secoes: 3, escolaForte: 'Escola A' });
    expect(r.zonas[1]).toMatchObject({ zona: '28', votos: 5 });
  });

  it('lista todas as secoes, da mais forte para a mais fraca, com o local de cada uma', () => {
    const r = rankingDeVotos(ESCOLAS);
    expect(r.secoes.map((x) => `${x.zona}/${x.secao}:${x.votos}`)).toEqual(['10/200:30', '10/144:20', '10/145:12', '28/10:5']);
    expect(r.secoes[0]).toMatchObject({ posicao: 1, local: 'Escola B', municipio: 'Palmeira dos Índios/AL' });
  });

  it('com zona escolhida, so as secoes dela contam', () => {
    const r = rankingDeVotos(ESCOLAS, '28');
    expect(r.total).toBe(5);
    expect(r.escolas.map((e) => e.place.title)).toEqual(['Escola C']);
  });
});

describe('ranking dos Líderes (onde a Equipe vota)', () => {
  it('a secao do cadastro aponta a escola; "07" e "7" sao a mesma', () => {
    expect(escolaDaSecao(ESCOLAS).get('28/10')?.title).toBe('Escola C');
  });

  it('cada Líder: tamanho da Equipe, escola forte, zonas e seções', () => {
    const ana = pessoa({ name: 'Ana', tier: 'LIDER', userId: 'u-ana' });
    const bia = pessoa({ name: 'Bia', tier: 'LIDER', userId: 'u-bia' });
    const equipeAna = [
      pessoa({ zone: '10', section: '144', recruitedBy: de('u-ana', 'Ana') }),
      pessoa({ zone: '010', section: '144', recruitedBy: de('u-ana', 'Ana') }),
      pessoa({ zone: '10', section: '200', recruitedBy: de('u-ana', 'Ana') }),
      pessoa({ zone: null, section: null, recruitedBy: de('u-ana', 'Ana') }),
    ];
    const equipeBia = [pessoa({ zone: '28', section: '10', recruitedBy: de('u-bia', 'Bia') })];

    const r = rankingDeLideres([ana, bia, ...equipeAna, ...equipeBia], ESCOLAS);
    expect(r.totalDeLiderados).toBe(5);
    const [primeiro, segundo] = r.lideres;
    expect(primeiro.lider.name).toBe('Ana');
    expect(primeiro.equipe).toBe(4);
    expect(primeiro.escolas[0]).toMatchObject({ rotulo: 'Escola A', votos: 2 });
    expect(primeiro.zonas).toEqual([{ rotulo: 'Zona 10', votos: 3, detalhe: undefined }]);
    expect(primeiro.secoes[0]).toMatchObject({ rotulo: 'Zona 10 · Seção 144', votos: 2, detalhe: 'Escola A' });
    expect(primeiro.semSecao).toBe(1);
    expect(segundo.escolas[0].rotulo).toBe('Escola C');
  });
});

describe('quem vota em cada local', () => {
  const quem = (id: string, nome: string, zone: string | null, section: string | null, lider: string | null): PlaceMember => ({
    memberId: id, name: nome, photo: null, clientId: 't', clientName: 'Time', phone: null, email: null, zone, section,
    cadastradoPor: null, tier: lider ? 'EQUIPE' : 'LIDER', lider,
  });
  const PESSOAS = new Map<string, PlaceMember[]>([
    ['a', [
      quem('1', 'Zeca', '10', '145', 'Ana'),
      quem('2', 'Bia', null, null, 'Ana'),
      quem('3', 'Caio', '010', '0144', 'Rui'),
      quem('4', 'Ana', '10', '144', null),
    ]],
    ['b', [quem('5', 'Duda', '10', '200', 'Ana')]],
    ['c', [quem('6', 'Eva', '28', '10', 'Rui')]],
  ]);

  it('segue a ordem do ranking; dentro do local, zona, seção e nome', () => {
    const r = pessoasPorEscola(rankingDeVotos(ESCOLAS), PESSOAS);
    expect(r.escolas.map((e) => e.escola.place.title)).toEqual(['Escola A', 'Escola B', 'Escola C']);
    expect(r.escolas[0].pessoas.map((p) => `${p.nome}:${p.zona}/${p.secao}`)).toEqual([
      'Ana:10/144',
      'Caio:10/144',
      'Zeca:10/145',
      'Bia:null/null',
    ]);
    expect(r.totalDePessoas).toBe(6);
    expect(r.lideres).toBe(2);
  });

  it('o Líder vem marcado; quem é da Equipe traz o nome do Líder', () => {
    const [a] = pessoasPorEscola(rankingDeVotos(ESCOLAS), PESSOAS).escolas;
    expect(a.pessoas.find((p) => p.nome === 'Ana')).toMatchObject({ ehLider: true, lider: null });
    expect(a.pessoas.find((p) => p.nome === 'Caio')).toMatchObject({ ehLider: false, lider: 'Rui' });
  });

  it('com zona escolhida, só quem vota nela entra', () => {
    const r = pessoasPorEscola(rankingDeVotos(ESCOLAS, '28'), PESSOAS, '28');
    expect(r.escolas.map((e) => e.escola.place.title)).toEqual(['Escola C']);
    expect(r.escolas[0].pessoas.map((p) => p.nome)).toEqual(['Eva']);
  });
});
