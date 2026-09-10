type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avisa as telas de que os dados mudaram. */
export function notifyDataChanged(): void {
  for (const listener of listeners) listener();
}

/** Reage a alteracoes feitas em outra aba do mesmo navegador. */
export function watchCrossTabChanges(prefix: string): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(prefix)) notifyDataChanged();
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
