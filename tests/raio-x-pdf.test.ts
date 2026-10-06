import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';
import type { PdfDoRaioXProps } from '@/components/neo/RaioXPdf';

/** O componente devolve um <Document>; o tipo do createElement nao sabe disso. */
const documento = (props: PdfDoRaioXProps) => createElement(PdfDoRaioX, props) as unknown as ReactElement<DocumentProps>;
import { PdfDoRaioX } from '@/components/neo/RaioXPdf';
import type { EscolaNoComparativo, LiderNoRaioX } from '@/lib/domain/confronto';

const escola = {
  chave: 'e1',
  titulo: 'COLÉGIO ESTADUAL HUMBERTO MENDES',
  endereco: 'AV GOV MUNIZ FALCÃO 701, SÃO FRANCISCO',
  cidade: 'Palmeira dos Índios',
  uf: 'AL',
  estimativa: 198,
  apurado: [83, 168],
  pinosDaCampanha: ['p1'],
  secoes: [
    { zona: '10', secao: '96', estimativa: 4, apurado: [7, 8] },
    { zona: '10', secao: '97', estimativa: 3, apurado: [4, 8] },
    { zona: null, secao: null, estimativa: 5, apurado: [0, 0] },
  ],
} as unknown as EscolaNoComparativo;

const candidatos = [
  { nome: 'NIVALDO ALBUQUERQUE', rotulo: 'NIVALDO ALBUQUERQUE (4400) · Deputado Federal · 1º turno', cor: '#2a78d6', foto: null },
  { nome: 'PAULINHO MENDONÇA', rotulo: 'PAULINHO MENDONÇA (15100) · Deputado Estadual · 1º turno', cor: '#eb6834', foto: null },
];

const lideres: LiderNoRaioX[] = [
  { id: 'l1', nome: 'Félix Silva Targino', cadastrados: 72, porSecao: { '10/96': 3 } },
  { id: 'l2', nome: 'Vivian Beatriz Monteiro de Lemos Silva', cadastrados: 18, porSecao: {} },
];

describe('PDF do Raio-X da escola', () => {
  it('gera o PDF com varios candidatos', async () => {
    const buffer = await renderToBuffer(
      documento({ escola, candidatos, lideres, diretos: 3, time: 'Time Bezerra', geradoEm: '2026-10-05T12:00:00Z' }),
    );
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('gera o PDF com um candidato so, sem lideres', async () => {
    const buffer = await renderToBuffer(
      documento({
        escola: { ...escola, apurado: [83], secoes: escola.secoes.map((x) => ({ ...x, apurado: [x.apurado[0]] })) },
        candidatos: [candidatos[0]],
        lideres: [],
        diretos: 0,
        geradoEm: '2026-10-05T12:00:00Z',
      }),
    );
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
