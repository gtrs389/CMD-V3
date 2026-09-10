import { StorageFullError } from '../types';

/** Abstracao minima de armazenamento chave/valor. */
export interface StorageDriver {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}

/** Prefixo com versao, para permitir migracoes futuras. */
export const STORAGE_PREFIX = 'sistema.v1.';

export const STORAGE_KEYS = {
  clients: `${STORAGE_PREFIX}clients`,
  members: `${STORAGE_PREFIX}members`,
  drafts: `${STORAGE_PREFIX}draft.`,
  seeded: `${STORAGE_PREFIX}seeded`,
} as const;

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  );
}

/** Armazenamento em memoria: usado no servidor e nos testes. */
export function createMemoryStorage(): StorageDriver {
  const map = new Map<string, string>();
  return {
    read<T>(key: string): T | null {
      const raw = map.get(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    write<T>(key: string, value: T): void {
      map.set(key, JSON.stringify(value));
    },
    remove(key: string): void {
      map.delete(key);
    },
  };
}

/**
 * Armazenamento do navegador.
 *
 * Toda leitura tolera conteudo corrompido e toda escrita converte o estouro de
 * cota em `StorageFullError`, para que a interface possa avisar o usuario.
 */
export function createBrowserStorage(): StorageDriver {
  return {
    read<T>(key: string): T | null {
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    write<T>(key: string, value: T): void {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        if (isQuotaError(error)) {
          throw new StorageFullError(
            'O armazenamento do navegador atingiu o limite. Remova registros ou fotos antigas.',
          );
        }
        throw error;
      }
    },
    remove(key: string): void {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignorado: remover nunca deve interromper o fluxo.
      }
    },
  };
}

let driver: StorageDriver | null = null;

/** Driver ativo. No servidor cai para memoria, evitando erro de renderizacao. */
export function getStorage(): StorageDriver {
  if (!driver) {
    driver = typeof window === 'undefined' ? createMemoryStorage() : createBrowserStorage();
  }
  return driver;
}
