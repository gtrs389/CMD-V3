import 'server-only';
import type { MudancaNaApuracao, ResultadoDoCargo, RetratoDaApuracao } from '@/lib/domain/apuracao';
import { CARGOS_DA_APURACAO } from '@/lib/domain/tse-ao-vivo';
import { selectRows } from '@/lib/supabase/rest';
import { configuracaoAoVivo, situacaoAoVivo, type SituacaoAoVivo } from './votacao-ao-vivo.service';
import { favoritosDe } from './votacao.service';

/**
 * Sala de Apuracao (migration 058): tudo o que a tela precisa numa leitura so.
 *
 * Os dados ja foram trazidos do TSE pela coleta ao vivo; aqui so se le o
 * banco. Sem a migration 058, a Sala abre vazia, sem quebrar.
 */

export interface EventoDaApuracao extends MudancaNaApuracao {
  em: string;
  horaTse: string | null;
  cargo: number;
}

export interface SalaDeApuracao {
  uf: string;
  ano: number;
  turno: number;
  cargos: ResultadoDoCargo[];
  historico: Record<number, RetratoDaApuracao[]>;
  eventos: EventoDaApuracao[];
  favoritos: string[];
  boletins: SituacaoAoVivo;
}

/** Eventos mostrados na linha do tempo. */
const EVENTOS = 40;

export async function salaDeApuracao(userId: string): Promise<SalaDeApuracao> {
  const c = configuracaoAoVivo();
  const filtro = { pleito: `eq.${c.pleito}`, uf: `eq.${c.uf}` };

  const [resultados, retratos, eventos, favoritos, boletins] = await Promise.all([
    selectRows<{ office_code: number; payload: ResultadoDoCargo }>('cmd_tse_live_results', {
      select: 'office_code,payload',
      filters: filtro,
    }).catch(() => []),
    selectRows<{ office_code: number; at: string; tse_time: string | null; pct_sections: number; leaders: [string, number, number][] }>(
      'cmd_tse_live_history',
      { select: 'office_code,at,tse_time,pct_sections,leaders', filters: filtro, order: 'at.asc' },
    ).catch(() => []),
    selectRows<{ office_code: number; at: string; tse_time: string | null; kind: MudancaNaApuracao['tipo']; text: string; number: string | null }>(
      'cmd_tse_live_events',
      { select: 'office_code,at,tse_time,kind,text,number', filters: filtro, order: 'at.desc', limit: EVENTOS },
    ).catch(() => []),
    favoritosDe(userId),
    situacaoAoVivo().catch(() => null),
  ]);

  const ordem = CARGOS_DA_APURACAO.map((x) => x.codigo as number);
  const historico: Record<number, RetratoDaApuracao[]> = {};
  for (const r of retratos) {
    (historico[r.office_code] ??= []).push({
      em: r.at,
      horaTse: r.tse_time,
      pctSecoes: Number(r.pct_sections),
      lideres: r.leaders,
    });
  }

  return {
    uf: c.uf,
    ano: c.ano,
    turno: c.turno,
    cargos: resultados
      .map((r) => r.payload)
      .sort((a, b) => ordem.indexOf(a.cargo) - ordem.indexOf(b.cargo)),
    historico,
    eventos: eventos.map((e) => ({
      em: e.at,
      horaTse: e.tse_time,
      cargo: e.office_code,
      tipo: e.kind,
      texto: e.text,
      numero: e.number,
    })),
    favoritos,
    boletins: boletins ?? {
      uf: c.uf,
      ano: c.ano,
      turno: c.turno,
      totalDeSecoes: 0,
      secoesApuradas: 0,
      ultimaColeta: null,
      pausadoAte: null,
      ultimoErro: null,
    },
  };
}
