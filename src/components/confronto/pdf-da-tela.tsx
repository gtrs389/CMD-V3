import { Document, Image, Page, Text, View, pdf } from '@react-pdf/renderer';
import { toCanvas } from 'html-to-image';
import { baixarArquivo } from '@/lib/utils/download';

/**
 * O PDF "igual a tela": em vez de redesenhar o confronto noutro formato, a
 * propria tela e fotografada (em dobro de resolucao, para o texto sair
 * nitido) e vira paginas A4 deitadas.
 *
 * O corte das paginas acompanha os blocos da tela: cada pagina termina no
 * fim de um cartao, de uma secao ou de uma linha da lista — nunca no meio
 * de um numero. So um bloco maior que a pagina inteira e cortado.
 *
 * O que tem `data-pdf-ocultar` (o botao do PDF, o chat do NEO) fica fora.
 * Carregado sob demanda: so quem clica em "Baixar PDF" baixa este codigo.
 */

/** A4 deitado, em pontos. */
const PAGINA = { largura: 842, altura: 595 };
const MARGEM = 20;
const RODAPE = 18;
const ESCALA = 2;

/** Os blocos da tela (cartoes, secoes, linhas): topo e fim, em px a partir do alto da tela. */
function blocosDaTela(alvo: HTMLElement): { topo: number; fim: number }[] {
  const topo = alvo.getBoundingClientRect().top;
  const blocos: { topo: number; fim: number }[] = [];
  alvo.querySelectorAll<HTMLElement>('section, header, li, figure, [data-pdf-bloco]').forEach((el) => {
    if (el.closest('[data-pdf-ocultar]')) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0) blocos.push({ topo: Math.round(r.top - topo), fim: Math.round(r.bottom - topo) });
  });
  return blocos;
}

/**
 * Onde da para cortar: no fim de um bloco, desde que o corte nao atravesse
 * nenhum outro bloco que caberia inteiro numa pagina (o cartao ao lado,
 * mais comprido, nao pode sair partido). Blocos maiores que a pagina — a
 * lista inteira de secoes — podem ser cortados, entre as linhas deles.
 */
function pontosDeCorte(blocos: { topo: number; fim: number }[], alturaDaPagina: number): number[] {
  const inteiros = blocos.filter((b) => b.fim - b.topo <= alturaDaPagina * 0.95);
  const pontos = new Set<number>();
  for (const b of blocos) {
    const y = b.fim;
    if (inteiros.some((o) => o.topo < y - 1 && o.fim > y + 1)) continue;
    pontos.add(y);
  }
  return [...pontos].sort((a, b) => a - b);
}

/** Onde cada pagina comeca e termina (em px da tela), cortando no fim de um bloco sempre que da. */
function fatias(altura: number, alturaDaPagina: number, cortes: number[]): [number, number][] {
  const lista: [number, number][] = [];
  let y = 0;
  while (y < altura - 1) {
    const limite = y + alturaDaPagina;
    if (limite >= altura) {
      lista.push([y, altura]);
      break;
    }
    // O ultimo fim de bloco que cabe, desde que use ao menos 45% da pagina.
    const corte = [...cortes].reverse().find((c) => c <= limite && c > y + alturaDaPagina * 0.45);
    const fim = corte ?? limite;
    lista.push([y, fim]);
    y = fim;
  }
  return lista;
}

export async function baixarPdfDaTela(
  alvo: HTMLElement,
  { nomeDoArquivo, titulo }: { nomeDoArquivo: string; titulo: string },
): Promise<void> {
  const largura = alvo.scrollWidth;
  const altura = alvo.scrollHeight;
  const fundo = getComputedStyle(document.body).backgroundColor || '#eef2f6';
  const blocos = blocosDaTela(alvo);

  const foto = await toCanvas(alvo, {
    pixelRatio: ESCALA,
    backgroundColor: fundo,
    width: largura,
    height: altura,
    filter: (no) => !(no instanceof HTMLElement && no.dataset.pdfOcultar !== undefined),
  });

  const larguraUtil = PAGINA.largura - MARGEM * 2;
  const alturaUtil = PAGINA.altura - MARGEM * 2 - RODAPE;
  const alturaDaPaginaEmPx = (largura * alturaUtil) / larguraUtil;
  const cortes = pontosDeCorte(blocos, alturaDaPaginaEmPx);
  const paginas = fatias(altura, alturaDaPaginaEmPx, cortes).map(([de, ate]) => {
    const pedaco = document.createElement('canvas');
    pedaco.width = foto.width;
    pedaco.height = Math.max(1, Math.round((ate - de) * ESCALA));
    const ctx = pedaco.getContext('2d');
    if (ctx) {
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, pedaco.width, pedaco.height);
      ctx.drawImage(foto, 0, Math.round(de * ESCALA), foto.width, pedaco.height, 0, 0, pedaco.width, pedaco.height);
    }
    return { src: pedaco.toDataURL('image/jpeg', 0.93), altura: ((ate - de) * larguraUtil) / largura };
  });

  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const documento = (
    <Document title={titulo} author="CMD · Sala de Confronto">
      {paginas.map((p, i) => (
        <Page key={i} size="A4" orientation="landscape" style={{ backgroundColor: fundo, padding: MARGEM }}>
          {/* A imagem do @react-pdf nao tem alt: o texto do PDF e o titulo e o rodape. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={p.src} style={{ width: larguraUtil, height: p.altura }} />
          <View
            fixed
            style={{
              position: 'absolute',
              left: MARGEM,
              right: MARGEM,
              bottom: 10,
              flexDirection: 'row',
              justifyContent: 'space-between',
              fontSize: 7,
              color: '#64748b',
            }}
          >
            <Text>{`${titulo} · CMD · Sala de Confronto`}</Text>
            <Text>{`gerado em ${quando} · página ${i + 1} de ${paginas.length}`}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
  const blob = await pdf(documento).toBlob();
  baixarArquivo(nomeDoArquivo, blob);
}
