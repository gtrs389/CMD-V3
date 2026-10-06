import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { Member } from '@/lib/types';
import { PdfDeLideres, type PdfDeLideresProps } from '@/components/neo/LideresPorReferenciaPdf';
import { agruparPorReferencia, lideresComReferencia, referenciasDosLideres } from '@/lib/domain/lideres-por-referencia';

/** O componente devolve um <Document>; o tipo do createElement nao sabe disso. */
const documento = (props: PdfDeLideresProps) => createElement(PdfDeLideres, props) as unknown as ReactElement<DocumentProps>;

const REFERENCIAS = ['Roberval', 'Dr. Félix Targino', 'Vereadora Ana Paula de Lemos', null];
const time = Array.from(
  { length: 70 },
  (_, i) => ({ id: `l${i}`, name: `Líder Número ${i + 1} da Silva Monteiro`, tier: 'LIDER', recruitedBy: null, reference: REFERENCIAS[i % 4] }) as unknown as Member,
);

describe('PDF dos líderes por referência', () => {
  for (const forma of ['lista', 'grupos'] as const) {
    it(`gera o PDF em ${forma}, com várias páginas`, async () => {
      const lideres = lideresComReferencia(time);
      const buffer = await renderToBuffer(
        documento({
          lideres,
          grupos: agruparPorReferencia(lideres),
          referencias: referenciasDosLideres(time).map((o) => ({ rotulo: o.rotulo, quantidade: o.quantidade })),
          forma,
          geradoEm: '2026-10-06T12:00:00.000Z',
        }),
      );
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });
  }
});
