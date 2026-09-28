import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mesmoNomeDeTag, normalizarTag, resumoDaTag, tagsDoTime } from '@/lib/domain/tags';
import type { MemberTag } from '@/lib/types';

/**
 * Tags das pessoas do time (migration 048).
 *
 * A promessa que estes testes seguram: colocar, tirar, editar ou apagar uma
 * tag NUNCA toca na ficha da pessoa — so na ligacao e no historico.
 */

type Linha = Record<string, unknown>;
const banco: Record<string, Linha[]> = {};
const tocadas: string[] = [];
let semTabela = false;

function casa(linha: Linha, filtros: Record<string, string> = {}): boolean {
  return Object.entries(filtros).every(([coluna, filtro]) => {
    if (filtro.startsWith('eq.')) return String(linha[coluna]) === filtro.slice(3);
    if (filtro.startsWith('in.(')) {
      const valores = filtro.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
      return valores.includes(String(linha[coluna]));
    }
    return true;
  });
}

vi.mock('@/lib/supabase/rest', async (original) => {
  const real = await original<typeof import('@/lib/supabase/rest')>();
  const tabela = (nome: string) => (banco[nome] ??= []);
  return {
    SupabaseRequestError: real.SupabaseRequestError,
    inFilter: (values: readonly string[]) => `in.(${values.map((v) => `"${v}"`).join(',')})`,
    selectRows: async (nome: string, options: { filters?: Record<string, string> } = {}) => {
      if (semTabela && nome !== 'cmd_members') {
        throw new real.SupabaseRequestError('relation does not exist', 404, 'PGRST205');
      }
      return tabela(nome).filter((l) => casa(l, options.filters));
    },
    selectOne: async (nome: string, options: { filters?: Record<string, string> } = {}) =>
      tabela(nome).find((l) => casa(l, options.filters)) ?? null,
    insertOne: async (nome: string, valor: Linha) => {
      tocadas.push(nome);
      const linha = { id: `id-${tabela(nome).length + 1}`, created_at: '2026-09-28T12:00:00Z', updated_at: '2026-09-28T12:00:00Z', ...valor };
      tabela(nome).push(linha);
      return linha;
    },
    insertRows: async (nome: string, valores: Linha[]) => {
      tocadas.push(nome);
      const linhas = valores.map((v) => ({ assigned_at: '2026-09-28T12:00:00Z', ...v }));
      tabela(nome).push(...linhas);
      return linhas;
    },
    updateRows: async (nome: string, filtros: Record<string, string>, valor: Linha) => {
      tocadas.push(nome);
      const linhas = tabela(nome).filter((l) => casa(l, filtros));
      for (const l of linhas) Object.assign(l, valor);
      return linhas;
    },
    deleteRows: async (nome: string, filtros: Record<string, string>) => {
      tocadas.push(nome);
      const fora = tabela(nome).filter((l) => casa(l, filtros));
      banco[nome] = tabela(nome).filter((l) => !fora.includes(l));
      // A cascata do banco: apagar a tag leva as ligacoes.
      if (nome === 'cmd_tags') {
        const ids = new Set(fora.map((l) => l.id));
        banco.cmd_member_tags = tabela('cmd_member_tags').filter((l) => !ids.has(l.tag_id));
      }
      return fora;
    },
  };
});

const servico = await import('@/lib/server/tag.service');
const ADMIN = { id: 'admin-1', name: 'Ana Admin' };

beforeEach(() => {
  for (const nome of Object.keys(banco)) delete banco[nome];
  tocadas.length = 0;
  semTabela = false;
  banco.cmd_members = [
    { id: 'm-equipe', client_id: 'time-1', recruited_by_role: 'EQUIPE', name: 'Maria' },
    { id: 'm-lider', client_id: 'time-1', recruited_by_role: 'CANDIDATE', name: 'João' },
  ];
  banco.cmd_tags = [
    { id: 'tag-delta', name: 'Coordenador Delta Operacional', symbol: 'Δ', color: 'navy', description: null, created_at: 'x', updated_at: 'x' },
  ];
});

describe('regras da tag', () => {
  it('limpa o nome e recusa vazio', () => {
    expect(normalizarTag({ name: '   ' })).toEqual({ ok: false, motivo: 'Dê um nome para a tag.' });
    const pronta = normalizarTag({ name: '  Coordenador   Delta ', symbol: 'ΔΔΔΔ', color: 'rose' });
    expect(pronta).toEqual({
      ok: true,
      tag: { name: 'Coordenador Delta', symbol: 'ΔΔΔ', color: 'rose', description: null },
    });
  });

  it('cor desconhecida volta para marinho', () => {
    const pronta = normalizarTag({ name: 'X', color: 'roxo-neon' as never });
    expect(pronta.ok && pronta.tag.color).toBe('navy');
  });

  it('nome igual sem diferença de acento, caixa ou espaço', () => {
    expect(mesmoNomeDeTag('Coordenação  Delta', 'coordenacao delta')).toBe(true);
    expect(mesmoNomeDeTag('Delta', 'Delta 2')).toBe(false);
  });

  it('resumo diz de onde a pessoa veio', () => {
    expect(resumoDaTag({ fromTier: 'EQUIPE', since: '2026-09-27T12:00:00Z', byName: 'Ana' })).toBe(
      'Era Equipe · desde 27/09/2026 · por Ana',
    );
  });

  it('tags do time contam as pessoas, da mais usada', () => {
    const t = (id: string, name: string): MemberTag => ({
      id, name, symbol: null, color: 'navy', description: null, since: 'x', byName: null, fromTier: 'EQUIPE',
    });
    const r = tagsDoTime([{ tags: [t('a', 'Alfa')] }, { tags: [t('b', 'Beta'), t('a', 'Alfa')] }, {}]);
    expect(r.map((x) => [x.tag.name, x.pessoas])).toEqual([['Alfa', 2], ['Beta', 1]]);
  });
});

describe('colocar e tirar tag', () => {
  it('coloca a mesma tag em várias pessoas, guardando o nível de cada uma', async () => {
    await expect(servico.colocarTag('tag-delta', ['m-equipe', 'm-lider'], ADMIN)).resolves.toEqual({ colocadas: 2 });
    const ligacoes = banco.cmd_member_tags;
    expect(ligacoes.map((l) => [l.member_id, l.from_tier])).toEqual([
      ['m-equipe', 'EQUIPE'],
      ['m-lider', 'LIDER'],
    ]);
    expect(banco.cmd_member_tag_events.map((e) => e.action)).toEqual(['ADDED', 'ADDED']);
  });

  it('nunca toca na ficha da pessoa', async () => {
    await servico.colocarTag('tag-delta', ['m-equipe'], ADMIN);
    await servico.tirarTag('tag-delta', ['m-equipe'], ADMIN);
    await servico.editarTag('tag-delta', { name: 'Delta', symbol: 'Δ', color: 'navy', description: null });
    await servico.apagarTag('tag-delta', ADMIN);
    expect(tocadas).not.toContain('cmd_members');
    expect(banco.cmd_members).toHaveLength(2);
  });

  it('colocar de novo não duplica nem muda a data', async () => {
    await servico.colocarTag('tag-delta', ['m-equipe'], ADMIN);
    await expect(servico.colocarTag('tag-delta', ['m-equipe'], ADMIN)).resolves.toEqual({ colocadas: 0 });
    expect(banco.cmd_member_tags).toHaveLength(1);
  });

  it('tirar deixa o histórico', async () => {
    await servico.colocarTag('tag-delta', ['m-equipe'], ADMIN);
    await expect(servico.tirarTag('tag-delta', ['m-equipe'], ADMIN)).resolves.toEqual({ retiradas: 1 });
    expect(banco.cmd_member_tags).toHaveLength(0);
    expect(banco.cmd_member_tag_events.map((e) => e.action)).toEqual(['ADDED', 'REMOVED']);
  });

  it('pessoa inexistente é recusada', async () => {
    await expect(servico.colocarTag('tag-delta', ['m-fantasma'], ADMIN)).rejects.toThrow('Integrante não encontrado.');
  });
});

describe('catálogo', () => {
  it('não aceita nome repetido', async () => {
    await expect(
      servico.criarTag({ name: 'coordenador delta operacional', symbol: null, color: 'blue', description: null }, ADMIN),
    ).rejects.toThrow('Já existe a tag');
  });

  it('editar muda a tag em quem já tem', async () => {
    await servico.colocarTag('tag-delta', ['m-equipe'], ADMIN);
    await servico.editarTag('tag-delta', { name: 'Delta Operacional', symbol: 'Ω', color: 'violet', description: null });
    const tags = await servico.carregarTagsDasPessoas(['m-equipe']);
    expect(tags.get('m-equipe')?.[0]).toMatchObject({ name: 'Delta Operacional', symbol: 'Ω', color: 'violet', fromTier: 'EQUIPE' });
  });

  it('apagar tira de todos e registra no histórico com o nome', async () => {
    await servico.colocarTag('tag-delta', ['m-equipe', 'm-lider'], ADMIN);
    await expect(servico.apagarTag('tag-delta', ADMIN)).resolves.toEqual({ pessoas: 2 });
    expect(banco.cmd_member_tags).toHaveLength(0);
    const apagadas = banco.cmd_member_tag_events.filter((e) => e.action === 'TAG_DELETED');
    expect(apagadas.map((e) => e.tag_name)).toEqual(['Coordenador Delta Operacional', 'Coordenador Delta Operacional']);
  });

  it('antes da migration, a lista do time não cai: ninguém tem tag', async () => {
    semTabela = true;
    await expect(servico.carregarTagsDasPessoas(['m-equipe'])).resolves.toEqual(new Map());
  });
});
