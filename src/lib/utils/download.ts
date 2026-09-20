/**
 * Download de arquivo gerado no proprio navegador.
 *
 * Usado pela planilha de exemplo do cadastro em lote e pela exportacao da
 * equipe. Nada disso passa por servidor: o conteudo ja esta na tela, e
 * mandar de volta para baixar seria um passeio inutil.
 */

/**
 * Baixa um CSV pronto para o Excel em portugues.
 *
 * BOM na frente e ponto e virgula no conteudo: o Excel precisa dos dois
 * para abrir o arquivo EM COLUNAS e com os acentos certos. Sem o BOM,
 * "João" chega como "JoÃ£o"; com virgula no lugar do ponto e virgula, tudo
 * empilha em uma coluna so.
 */
export function baixarCsv(nomeDoArquivo: string, conteudo: string): void {
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeDoArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
