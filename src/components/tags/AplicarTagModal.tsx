'use client';

import { useMemo, useState } from 'react';
import type { Member, Tag, TeamTier } from '@/lib/types';
import { TEAM_TIER_LABELS } from '@/lib/types';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';
import { notifyDataChanged } from '@/lib/repositories/events';
import { cn } from '@/lib/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { TagChip } from '@/components/members/TagChip';
import { mudarPessoasDaTag } from './useCatalogoDeTags';

type Recorte = 'todos' | TeamTier | 'com-a-tag';

/**
 * Colocar a mesma tag em varias pessoas do time de uma vez — e tirar.
 *
 * A lista ja abre com quem tem a tag marcado. Marcar e desmarcar so muda a
 * tela; o rodape diz o que vai acontecer ("coloca em 3, tira de 1") e nada
 * e gravado antes do "Aplicar".
 */
export function AplicarTagModal({
  open,
  tag,
  members,
  onClose,
}: {
  open: boolean;
  tag: Tag | null;
  members: Member[];
  onClose: () => void;
}) {
  if (!open || !tag) return null;
  // Montado de novo a cada abertura: a marcacao inicial e sempre a de agora.
  return <Conteudo key={tag.id} tag={tag} members={members} onClose={onClose} />;
}

function Conteudo({ tag, members, onClose }: { tag: Tag; members: Member[]; onClose: () => void }) {
  const toast = useToast();
  const tinham = useMemo(
    () => new Set(members.filter((m) => m.tags?.some((t) => t.id === tag.id)).map((m) => m.id)),
    [members, tag.id],
  );
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(tinham));
  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todos');
  const [salvando, setSalvando] = useState(false);

  const ordenados = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [members],
  );
  const visiveis = ordenados.filter((m) => {
    if (recorte === 'com-a-tag' && !marcados.has(m.id)) return false;
    if ((recorte === 'LIDER' || recorte === 'EQUIPE') && m.tier !== recorte) return false;
    return buscarPessoa(m, busca).achou;
  });

  const colocar = [...marcados].filter((id) => !tinham.has(id));
  const tirar = [...tinham].filter((id) => !marcados.has(id));
  const mudou = colocar.length + tirar.length > 0;
  const todosVisiveis = visiveis.length > 0 && visiveis.every((m) => marcados.has(m.id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarVisiveis() {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const m of visiveis) {
        if (todosVisiveis) novo.delete(m.id);
        else novo.add(m.id);
      }
      return novo;
    });
  }

  async function aplicar() {
    setSalvando(true);
    try {
      const [postas, retiradas] = await Promise.all([
        mudarPessoasDaTag(tag.id, 'colocar', colocar),
        mudarPessoasDaTag(tag.id, 'tirar', tirar),
      ]);
      notifyDataChanged();
      const partes = [
        postas ? `colocada em ${postas} ${postas === 1 ? 'pessoa' : 'pessoas'}` : null,
        retiradas ? `retirada de ${retiradas} ${retiradas === 1 ? 'pessoa' : 'pessoas'}` : null,
      ].filter(Boolean);
      toast.success(`${tag.name}: ${partes.join(' e ') || 'nada mudou'}.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar a tag.');
    } finally {
      setSalvando(false);
    }
  }

  const recortes: { valor: Recorte; rotulo: string }[] = [
    { valor: 'todos', rotulo: `Todos ${members.length}` },
    { valor: 'LIDER', rotulo: 'Líderes' },
    { valor: 'EQUIPE', rotulo: 'Equipe' },
    { valor: 'com-a-tag', rotulo: `Marcados ${marcados.size}` },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      busy={salvando}
      size="md"
      title="Aplicar tag a pessoas"
      footer={
        <>
          <p className="mr-auto hidden text-xs text-ink-500 sm:block" aria-live="polite">
            {mudou
              ? [
                  colocar.length ? `Coloca em ${colocar.length}` : null,
                  tirar.length ? `tira de ${tirar.length}` : null,
                ]
                  .filter(Boolean)
                  .join(', ')
              : 'Nada mudou ainda'}
          </p>
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={aplicar} loading={salvando} disabled={!mudou}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TagChip tag={tag} />
          <span className="text-xs text-ink-500">
            Nada do que a pessoa fez muda: cadastros, link, acesso e nível continuam iguais.
          </span>
        </div>

        <SearchInput id="aplicar-tag-busca" label="Buscar pessoa" value={busca} onChange={setBusca} placeholder="Nome, telefone, bairro…" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Recorte" className="flex flex-wrap gap-1 rounded-control bg-ink-50 p-1">
            {recortes.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={recorte === opcao.valor}
                onClick={() => setRecorte(opcao.valor)}
                className={cn(
                  'min-h-9 rounded-[calc(var(--radius-control)-2px)] px-3 text-xs font-medium whitespace-nowrap',
                  recorte === opcao.valor ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
          {visiveis.length ? (
            <button
              type="button"
              onClick={alternarVisiveis}
              className="min-h-9 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              {todosVisiveis ? 'Desmarcar' : 'Marcar'} {visiveis.length === members.length ? 'todos' : `os ${visiveis.length} da lista`}
            </button>
          ) : null}
        </div>

        {visiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Ninguém nesta busca.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-card border border-line">
            {visiveis.map((m) => {
              const marcado = marcados.has(m.id);
              const novo = marcado && !tinham.has(m.id);
              const saindo = !marcado && tinham.has(m.id);
              return (
                <li key={m.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-ink-50">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(m.id)}
                      className="size-5 shrink-0 cursor-pointer accent-brand-700"
                    />
                    <Avatar name={m.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{m.name}</span>
                      <span className="block truncate text-xs text-ink-500">
                        {TEAM_TIER_LABELS[m.tier]}
                        {m.recruitedBy?.name ? ` · por ${m.recruitedBy.name}` : ''}
                      </span>
                    </span>
                    {novo ? (
                      <span className="shrink-0 rounded-pill bg-success-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-success-700">
                        entra
                      </span>
                    ) : saindo ? (
                      <span className="shrink-0 rounded-pill bg-danger-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-danger-700">
                        sai
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
