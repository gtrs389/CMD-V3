import { describe, expect, it } from 'vitest';
import {
  APURACAO_2026_1T,
  boletimDoAuxiliar,
  nomesDoCargo,
  secoesDaLista,
  urlDaListaDeSecoes,
  urlDoAuxiliar,
  urlDoBoletim,
  urlDosCandidatos,
} from '@/lib/domain/tse-ao-vivo';

const SECAO = { municipio: '27855', zona: '0010', secao: '0096' };

describe('arquivos da apuração do TSE', () => {
  it('monta os endereços do 1º turno de 2026', () => {
    const c = APURACAO_2026_1T;
    expect(urlDaListaDeSecoes(c, 'AL')).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/config/al/al-p003220-cs.json',
    );
    expect(urlDoAuxiliar(c, 'AL', SECAO)).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/dados/al/27855/0010/0096/p003220-al-m27855-z0010-s0096-aux.json',
    );
    expect(urlDoBoletim(c, 'AL', SECAO, 'abc', 'o00406-2785500100096.bu')).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/dados/al/27855/0010/0096/abc/o00406-2785500100096.bu',
    );
    expect(urlDosCandidatos(c, 'AL', 7, false)).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/al/al-c0007-e006259-u.json',
    );
    expect(urlDosCandidatos(c, 'AL', 1, true)).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/al/al-c0001-e006257-u.json',
    );
  });

  it('lê a lista de seções da UF', () => {
    const json = {
      abr: [
        {
          cd: 'AL',
          mu: [
            { cd: '27855', zon: [{ cd: '0010', sec: [{ ns: '0096' }, { ns: '0097', nsa: ['0099'] }] }] },
            { cd: '27030', zon: [{ cd: '0028', sec: [{ ns: '0010' }] }] },
          ],
        },
      ],
    };
    expect(secoesDaLista(json)).toEqual([
      { municipio: '27855', zona: '0010', secao: '0096' },
      { municipio: '27855', zona: '0010', secao: '0097' },
      { municipio: '27030', zona: '0028', secao: '0010' },
    ]);
    expect(secoesDaLista(null)).toEqual([]);
  });

  it('acha o boletim no auxiliar (formato de 2026 e de 2022); sem boletim, nulo', () => {
    expect(
      boletimDoAuxiliar({
        st: 'Totalizada',
        hashes: [
          { hash: 'h1', st: 'Recebido', dr: '04/10/2026', hr: '17:31:26', arq: [{ nm: 'x.logjez', tp: 'log' }, { nm: 'x.bu', tp: 'bu' }] },
          { hash: 'h2', st: 'Totalizado', dr: '04/10/2026', hr: '18:02:00', arq: [{ nm: 'y.bu', tp: 'bu' }] },
        ],
      }),
    ).toEqual({ hash: 'h2', arquivo: 'y.bu', situacao: 'Totalizado', recebido: '04/10/2026 18:02:00' });

    expect(boletimDoAuxiliar({ hashes: [{ hash: 'h', st: 'Totalizado', nmarq: ['a.rdv', 'a.bu'] }] })).toMatchObject({
      hash: 'h',
      arquivo: 'a.bu',
    });
    expect(boletimDoAuxiliar({ st: 'Não instalada', hashes: [] })).toBeNull();
    expect(boletimDoAuxiliar(null)).toBeNull();
  });

  it('lê os nomes do cargo; no proporcional, o partido vira o nome da legenda', () => {
    const json = {
      carg: [
        {
          nv: '27',
          agr: [
            {
              par: [
                { n: '15', sg: 'MDB', cand: [{ n: '15123', nmu: 'FULANO DE TAL' }] },
                { n: '13', sg: 'PT', cand: [{ n: '13456', nmu: 'MARIA LIMA' }] },
              ],
            },
          ],
        },
      ],
    };
    expect(nomesDoCargo(json, 7)).toEqual([
      { cargo: 7, numero: '15', nome: 'MDB', partido: 'MDB', tipo: 'LEGENDA' },
      { cargo: 7, numero: '15123', nome: 'FULANO DE TAL', partido: 'MDB', tipo: 'CANDIDATO' },
      { cargo: 7, numero: '13', nome: 'PT', partido: 'PT', tipo: 'LEGENDA' },
      { cargo: 7, numero: '13456', nome: 'MARIA LIMA', partido: 'PT', tipo: 'CANDIDATO' },
    ]);
    // Governador: "13" e o candidato, nao a legenda.
    const gov = { carg: [{ agr: [{ par: [{ n: '13', sg: 'PT', cand: [{ n: '13', nmu: 'FULANA' }] }] }] }] };
    expect(nomesDoCargo(gov, 3)).toEqual([{ cargo: 3, numero: '13', nome: 'FULANA', partido: 'PT', tipo: 'CANDIDATO' }]);
  });
});
