/**
 * A coluna "DATA DE CADASTRO" de uma planilha: a regra, sem rede e sem banco.
 *
 * Vale para os dois caminhos da planilha — a do Google Sheets lida ao vivo
 * (`planilha-do-sheets.ts`) e o arquivo subido pelo botao "Planilha" da
 * Equipe (`csv-import.ts`) —, para uma data escrita do mesmo jeito nunca
 * entrar num e sumir no outro.
 */

/**
 * Nomes aceitos para a coluna, sem acento e em minusculas (a barra vira
 * espaco: "Carimbo de data/hora", do Google Forms, chega como
 * "carimbo de data hora").
 */
export const CABECALHOS_DA_DATA = [
  'data de cadastro',
  'data do cadastro',
  'data cadastro',
  'data e hora do cadastro',
  'data e hora de cadastro',
  'data hora do cadastro',
  'data de inscricao',
  'data da inscricao',
  'cadastrado em',
  'cadastro em',
  'carimbo de data hora',
  'data hora',
  'data',
] as const;

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Data e hora de Brasilia (UTC-3) em ISO, ou vazio quando nao e uma data de verdade. */
function emBrasilia(ano: number, mes: number, dia: number, hora = 12, minuto = 0): string {
  if (ano < 2000 || ano > 2100 || hora > 23 || minuto > 59) return '';
  // 31/02 nao existe: o calendario "rolaria" para marco, e a data e recusada.
  const conferida = new Date(Date.UTC(ano, mes - 1, dia));
  if (conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return '';
  return new Date(`${ano}-${pad(mes)}-${pad(dia)}T${pad(hora)}:${pad(minuto)}:00-03:00`).toISOString();
}

/**
 * A coluna "DATA DE CADASTRO", do jeito que ela vier:
 *
 *   - celula de DATA do Google (chega como numero de serie: 45931, ou
 *     45931.6 com hora);
 *   - texto "01/10/2026", "1/10/26", "01/10/2026 14:30", "01-10-2026";
 *   - texto ISO "2026-10-01";
 *   - mes por extenso: "1 de outubro de 2026", "01/out/2026", "1-out-26";
 *   - com segundos ou "14h30", e com o dia da semana na frente.
 *
 * Sem hora, vale meio-dia: a data nunca "vira" de dia por fuso. A hora e a
 * de Brasilia. O que nao for data plausivel fica vazio — nunca inventado.
 */
export function dataDeCadastroDaPlanilha(bruto: string): string {
  // "qua., 01/10/2026" e "quarta-feira, 1 de outubro de 2026": o dia da
  // semana na frente nao muda a data.
  const texto = (bruto ?? '')
    .trim()
    .replace(/^[A-Za-zÀ-ú-]+\.?,?\s+(?=\d)/, '');
  if (!texto) return '';

  // Numero de serie do Google/Excel: dias desde 30/12/1899.
  if (/^\d{5}(\.\d+)?$/.test(texto)) {
    const serie = Number(texto);
    const dias = Math.floor(serie);
    const minutos = Math.round((serie - dias) * 24 * 60);
    const base = new Date(Date.UTC(1899, 11, 30) + dias * 86_400_000);
    const temHora = serie !== dias;
    return emBrasilia(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      temHora ? Math.floor(minutos / 60) % 24 : 12,
      temHora ? minutos % 60 : 0,
    );
  }

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) {
    const [, a, m, d, h, mi] = iso;
    return emBrasilia(Number(a), Number(m), Number(d), h ? Number(h) : 12, mi ? Number(mi) : 0);
  }

  const br = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(?:,?\s+(?:[aà]s\s+)?(\d{1,2})[:h](\d{2}))?/);
  if (br) {
    const [, d, m, a, h, mi] = br;
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
    return emBrasilia(ano, Number(m), Number(d), h ? Number(h) : 12, mi ? Number(mi) : 0);
  }

  const extenso = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/^(\d{1,2})(?:\s+de\s+|\s*[/.-]\s*|\s+)([a-z]{3})[a-z]*\.?(?:\s+de\s+|\s*[/.-]\s*|\s+)(\d{4}|\d{2})(?!\d)(?:,?\s+(?:as\s+)?(\d{1,2})[:h](\d{2}))?/);
  if (extenso && MESES[extenso[2]]) {
    const [, d, mes, a, h, mi] = extenso;
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
    return emBrasilia(ano, MESES[mes], Number(d), h ? Number(h) : 12, mi ? Number(mi) : 0);
  }

  return '';
}
