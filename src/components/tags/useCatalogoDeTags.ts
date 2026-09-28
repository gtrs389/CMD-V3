'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TagDoCatalogo, TagInput } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged, subscribeToData } from '@/lib/repositories/events';

/**
 * O catalogo de tags, lido do servidor e mantido em dia: qualquer mudanca de
 * dados (colocar, tirar, editar, apagar) recarrega.
 *
 * Toda escrita avisa as outras telas (`notifyDataChanged`): a lista do time
 * e a ficha passam a mostrar a tag nova, o nome novo ou a tag a menos sem
 * precisar recarregar a pagina.
 */
export function useCatalogoDeTags(ativo = true) {
  const [tags, setTags] = useState<TagDoCatalogo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const { tags } = await api<{ tags: TagDoCatalogo[] }>('/api/tags');
      setTags(tags);
      setErro(null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar as tags.');
    }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    // Primeira leitura fora do corpo do efeito: nenhum estado muda antes de
    // a resposta chegar.
    const primeira = setTimeout(recarregar, 0);
    const parar = subscribeToData(() => void recarregar());
    return () => {
      clearTimeout(primeira);
      parar();
    };
  }, [ativo, recarregar]);

  const criar = useCallback(async (tag: TagInput) => {
    const { tag: criada } = await api<{ tag: TagDoCatalogo }>('/api/tags', { method: 'POST', body: tag });
    notifyDataChanged();
    return criada;
  }, []);

  const editar = useCallback(async (id: string, tag: TagInput) => {
    const { tag: editada } = await api<{ tag: TagDoCatalogo }>(`/api/tags/${id}`, { method: 'PATCH', body: tag });
    notifyDataChanged();
    return editada;
  }, []);

  const apagar = useCallback(async (id: string) => {
    const resultado = await api<{ pessoas: number }>(`/api/tags/${id}`, { method: 'DELETE' });
    notifyDataChanged();
    return resultado;
  }, []);

  return { tags, erro, recarregar, criar, editar, apagar };
}

/** Coloca ou tira uma tag de uma ou varias pessoas. */
export async function mudarPessoasDaTag(
  tagId: string,
  acao: 'colocar' | 'tirar',
  memberIds: string[],
): Promise<number> {
  if (memberIds.length === 0) return 0;
  const resposta = await api<{ colocadas?: number; retiradas?: number }>(`/api/tags/${tagId}/pessoas`, {
    method: 'POST',
    body: { acao, memberIds },
  });
  return resposta.colocadas ?? resposta.retiradas ?? 0;
}
