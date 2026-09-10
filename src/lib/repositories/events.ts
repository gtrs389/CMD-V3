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
