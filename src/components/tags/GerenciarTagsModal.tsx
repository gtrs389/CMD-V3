'use client';

import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2, UserPlus } from 'lucide-react';
import type { Member, TagDoCatalogo } from '@/lib/types';
import { tagsDoTime } from '@/lib/domain/tags';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { TagChip } from '@/components/members/TagChip';
import { AplicarTagModal } from './AplicarTagModal';
import { EditorDeTag } from './EditorDeTag';
import { useCatalogoDeTags } from './useCatalogoDeTags';

type Tela = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'editar'; tag: TagDoCatalogo };

/**
 * O catalogo de tags: criar, editar, apagar e colocar em varias pessoas.
 *
 * O catalogo e do sistema — a mesma tag serve para qualquer time. O numero de
 * cada linha diz quantas pessoas DESTE time carregam a tag, e quantas no
 * total.
 */
export function GerenciarTagsModal({
  open,
  onClose,
  members,
}: {
  open: boolean;
  onClose: () => void;
  /** As pessoas do time aberto: para contar e para aplicar. */
  members: Member[];
}) {
  const toast = useToast();
  const { tags, erro, criar, editar, apagar } = useCatalogoDeTags(open);
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [apagando, setApagando] = useState<TagDoCatalogo | null>(null);
  const [aplicando, setAplicando] = useState<TagDoCatalogo | null>(null);

  const noTime = new Map(tagsDoTime(members).map(({ tag, pessoas }) => [tag.id, pessoas]));

  function fechar() {
    setTela({ tipo: 'lista' });
    onClose();
  }

  async function confirmarApagar() {
    if (!apagando) return;
    try {
      const { pessoas } = await apagar(apagando.id);
      toast.success(
        pessoas
          ? `Tag “${apagando.name}” apagada e retirada de ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}.`
          : `Tag “${apagando.name}” apagada.`,
      );
      setApagando(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível apagar a tag.');
    }
  }

  const titulo = tela.tipo === 'nova' ? 'Nova tag' : tela.tipo === 'editar' ? 'Editar tag' : 'Tags';

  return (
    <>
      <Modal
        open={open}
        onClose={fechar}
        size="md"
        title={titulo}
        description={
          tela.tipo === 'lista'
            ? 'A mesma tag serve para quantas pessoas quiser, em qualquer time. Colocar ou tirar uma tag não muda nada do que a pessoa fez.'
            : undefined
        }
        onBack={tela.tipo === 'lista' ? undefined : () => setTela({ tipo: 'lista' })}
        backLabel={tela.tipo === 'lista' ? undefined : 'as tags'}
        inactive={Boolean(aplicando)}
      >
        {tela.tipo === 'nova' ? (
          <EditorDeTag
            rotulo="Criar tag"
            onCancelar={() => setTela({ tipo: 'lista' })}
            onSalvar={async (tag) => {
              const criada = await criar(tag);
              toast.success(`Tag “${criada.name}” criada.`);
              setTela({ tipo: 'lista' });
              // Recem-criada, ninguem tem: o proximo passo natural e colocar.
              if (members.length) setAplicando(criada);
            }}
          />
        ) : tela.tipo === 'editar' ? (
          <EditorDeTag
            inicial={tela.tag}
            onCancelar={() => setTela({ tipo: 'lista' })}
            onSalvar={async (tag) => {
              await editar(tela.tag.id, tag);
              toast.success(
                tela.tag.pessoas
                  ? `Tag atualizada em ${tela.tag.pessoas} ${tela.tag.pessoas === 1 ? 'pessoa' : 'pessoas'}.`
                  : 'Tag atualizada.',
              );
              setTela({ tipo: 'lista' });
            }}
          />
        ) : erro && !tags ? (
          <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">{erro}</p>
        ) : !tags ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {tags.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Tags aria-hidden="true" className="size-8 text-ink-300" />
                <p className="text-sm text-ink-500">Nenhuma tag ainda.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-card border border-line">
                {tags.map((tag) => {
                  const aqui = noTime.get(tag.id) ?? 0;
                  return (
                    <li key={tag.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <TagChip tag={tag} />
                        {tag.description ? (
                          <p className="mt-1.5 text-xs text-ink-500">{tag.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-ink-400">
                          <span className="font-semibold text-ink-700 tabular-nums">{aqui}</span>{' '}
                          {aqui === 1 ? 'pessoa' : 'pessoas'} neste time
                          {tag.pessoas !== aqui ? ` · ${tag.pessoas} no total` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {members.length ? (
                          <Button variant="subtle" size="sm" onClick={() => setAplicando(tag)}>
                            <UserPlus aria-hidden="true" className="size-4" />
                            Aplicar
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${tag.name}`}
                          title="Editar"
                          onClick={() => setTela({ tipo: 'editar', tag })}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Apagar ${tag.name}`}
                          title="Apagar"
                          onClick={() => setApagando(tag)}
                          className="text-danger-600 hover:bg-danger-50"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button variant="secondary" fullWidth onClick={() => setTela({ tipo: 'nova' })}>
              <Plus aria-hidden="true" className="size-4" />
              Nova tag
            </Button>
          </div>
        )}
      </Modal>

      <AplicarTagModal
        open={Boolean(aplicando)}
        tag={aplicando}
        members={members}
        onClose={() => setAplicando(null)}
      />

      <ConfirmDialog
        open={Boolean(apagando)}
        title={`Apagar a tag “${apagando?.name ?? ''}”?`}
        description={
          (apagando?.pessoas
            ? `Ela sai de ${apagando.pessoas} ${apagando.pessoas === 1 ? 'pessoa' : 'pessoas'}, em todos os times. `
            : '') +
          'Nada do que essas pessoas fizeram é apagado: cadastros, link, acesso e nível continuam iguais, e o histórico de cada uma guarda que teve a tag.'
        }
        confirmLabel="Apagar tag"
        onConfirm={confirmarApagar}
        onCancel={() => setApagando(null)}
      />
    </>
  );
}
