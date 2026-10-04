'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/repositories/http/api';

/** O andamento da apuracao, como a rota devolve. */
export interface SituacaoAoVivo {
  uf: string;
  ano: number;
  turno: number;
  totalDeSecoes: number;
  secoesApuradas: number;
  ultimaColeta: string | null;
  pausadoAte: string | null;
  ultimoErro: string | null;
  novas?: number;
}

/** De quanto em quanto tempo a tela pede uma coleta nova. */
const A_CADA_MS = 30_000;

/**
 * Mantem a votacao ao vivo andando enquanto a tela estiver aberta.
 *
 * Pede uma coleta logo ao abrir e depois a cada minuto; quando chegam
 * boletins novos, avisa quem chamou (para recarregar o mapa ou a lista).
 * Varias telas abertas nao dobram as consultas ao TSE: o servidor so deixa
 * uma coleta rodar por vez.
 */
export function useVotacaoAoVivo(ativo: boolean, aoChegarBoletim?: () => void) {
  const [situacao, setSituacao] = useState<SituacaoAoVivo | null>(null);
  const [coletando, setColetando] = useState(false);
  /** Por que a coleta falhou: migration pendente, TSE recusando... */
  const [erro, setErro] = useState<string | null>(null);
  const aviso = useRef(aoChegarBoletim);

  useEffect(() => {
    aviso.current = aoChegarBoletim;
  }, [aoChegarBoletim]);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;

    const coletar = () => {
      if (document.visibilityState !== 'visible') return;
      setColetando(true);
      api<SituacaoAoVivo>('/api/votacao/ao-vivo', { method: 'POST' })
        .then((s) => {
          if (!vivo) return;
          setSituacao(s);
          setErro(null);
          if ((s.novas ?? 0) > 0) aviso.current?.();
        })
        .catch((e: unknown) => {
          if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível buscar os boletins.');
        })
        .finally(() => vivo && setColetando(false));
    };

    const primeira = window.setTimeout(coletar, 0);
    const relogio = window.setInterval(coletar, A_CADA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(primeira);
      window.clearInterval(relogio);
    };
  }, [ativo]);

  // O erro da propria coleta, ou o que o servidor guardou da ultima.
  return { situacao, coletando, erro: erro ?? situacao?.ultimoErro ?? null };
}

/** "1.234 de 7.000 seções (18%) · atualizado às 19:42". */
export function textoDoAndamento(s: SituacaoAoVivo | null): string | null {
  if (!s || s.totalDeSecoes === 0) return null;
  const pct = Math.floor((s.secoesApuradas / s.totalDeSecoes) * 100);
  const hora = s.ultimaColeta
    ? new Date(s.ultimaColeta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const n = (v: number) => v.toLocaleString('pt-BR');
  return `${n(s.secoesApuradas)} de ${n(s.totalDeSecoes)} seções com boletim (${pct}%)${hora ? ` · atualizado às ${hora}` : ''}`;
}
