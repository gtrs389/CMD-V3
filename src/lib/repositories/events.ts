type Listener = () => void;

const listeners = new Set<Listener>();

/** Quantos lotes estao segurando os avisos agora. */
let represas = 0;
/** Houve escrita enquanto os avisos estavam represados? */
let pendente = false;

export function subscribeToData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avisa as telas de que os dados mudaram. */
export function notifyDataChanged(): void {
  if (represas > 0) {
    pendente = true;
    return;
  }
  for (const listener of listeners) listener();
}

/**
 * Segura os avisos durante um lote de escritas, e devolve quem solta.
 *
 * A planilha grava centenas de pessoas, uma por vez. Sem isto, CADA gravacao
 * fazia todas as telas abertas recarregarem a lista inteira do time — com
 * 400 pessoas, centenas de consultas pesadas se empilhando no servidor
 * enquanto ele ainda gravava, o que deixa tudo lento e pode estourar o tempo
 * de uma gravacao. Represado, o lote avisa UMA vez, no fim.
 *
 * Soltar duas vezes nao faz nada a mais.
 */
export function holdDataChanged(): () => void {
  represas += 1;
  let solto = false;

  return () => {
    if (solto) return;
    solto = true;
    represas = Math.max(0, represas - 1);
    if (represas === 0 && pendente) {
      pendente = false;
      notifyDataChanged();
    }
  };
}
