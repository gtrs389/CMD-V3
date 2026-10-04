import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BoletimIlegivel,
  comparecimentoDoBoletim,
  lerBoletimDeUrna,
  votosDoBoletim,
} from '@/lib/domain/boletim-de-urna';

/**
 * Boletins de urna de exemplo publicados pelo TSE (simulado e treinamento),
 * e a leitura de cada um feita pelo decodificador de referencia: a
 * especificacao bu.asn1 do TSE compilada com asn1tools.
 */
const PASTA = join(__dirname, 'fixtures', 'bu');
const EXEMPLOS = readdirSync(PASTA).filter((nome) => nome.endsWith('.bu'));

describe('boletim de urna do TSE', () => {
  it.each(EXEMPLOS)('%s: lê seção e votos exatamente como o decodificador oficial', (nome) => {
    const boletim = lerBoletimDeUrna(new Uint8Array(readFileSync(join(PASTA, nome))));
    const esperado = JSON.parse(readFileSync(join(PASTA, `${nome}.esperado.json`), 'utf8'));

    expect(boletim).toMatchObject({
      municipio: esperado.municipio,
      zona: esperado.zona,
      local: esperado.local,
      secao: esperado.secao,
    });
    expect(
      boletim.eleicoes.map((e) => ({
        id: e.id,
        aptos: e.aptos,
        cargos: e.cargos.map((c) => ({
          cargo: c.cargo,
          comparecimento: c.comparecimento,
          votos: c.votos.map((v) => [v.tipo, v.quantidade, v.partido, v.codigo]),
        })),
      })),
    ).toEqual(esperado.eleicoes);
  });

  it('vira "cargo:número" -> votos: candidato, legenda pelo partido, 95 branco e 96 nulo', () => {
    const boletim = lerBoletimDeUrna(new Uint8Array(readFileSync(join(PASTA, 's02100-0139200090033.bu'))));
    const votos = votosDoBoletim(boletim);
    expect(votos['6:9101']).toBe(1);
    expect(votos['7:96']).toBe(1);
    expect(votos['5:96']).toBe(2);
    expect(comparecimentoDoBoletim(boletim)).toBe(2);
  });

  it('arquivo que não é boletim é recusado com erro próprio', () => {
    expect(() => lerBoletimDeUrna(new Uint8Array([0x30, 0x05, 0x01]))).toThrow(BoletimIlegivel);
    expect(() => lerBoletimDeUrna(new TextEncoder().encode('<html>erro</html>'))).toThrow(BoletimIlegivel);
  });
});
