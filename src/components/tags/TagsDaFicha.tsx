'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, History, Plus, ShieldCheck, X } from 'lucide-react';
import type { EventoDeTag, Member, MemberTag, TagDoCatalogo } from '@/lib/types';
import { TEAM_TIER_LABELS } from '@/lib/types';
import { mesmoNomeDeTag } from '@/lib/domain/tags';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories/events';
import { formatDateTime } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { ESTILO_DA_TAG, TagChip } from '@/components/members/TagChip';
import { useNavegador } from '@/components/members/navegador-contexto';
import { EditorDeTag } from './EditorDeTag';
import { mudarPessoasDaTag, useCatalogoDeTags } from './useCatalogoDeTags';

/**
 * As tags da pessoa, na ficha.
 *
 * Cada tag e um cartao que conta a historia inteira: de onde a pessoa veio
 * ("Era Equipe"), o que ela carrega agora, desde quando, quem colocou — e a
 * prova de que nada se perdeu: os cadastros que ela trouxe continuam no nome
 * dela, contados ali mesmo.
 */
export function TagsDaFicha({ member, podeEditar }: { member: Member; podeEditar: boolean }) {
  const toast = useToast();
  const navegador = useNavegador();
  const tags = member.tags ?? [];
  const [escolhendo, setEscolhendo] = useState(false);
  const [tirando, setTirando] = useState<MemberTag | null>(null);
  const [recem, setRecem] = useState<string | null>(null);

  if (!podeEditar && tags.length === 0) return null;

  const cadastros = navegador?.cadastrosDoUsuario(member.userId) ?? null;

  async function colocar(tag: { id: string; name: string }) {
    try {
      await mudarPessoasDaTag(tag.id, 'colocar', [member.id]);
      setRecem(tag.id);
      setEscolhendo(false);
      notifyDataChanged();
      toast.success(`${member.name} agora é ${tag.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível colocar a tag.');
    }
  }

  async function confirmarTirar() {
    if (!tirando) return;
    try {
      await mudarPessoasDaTag(tirando.id, 'tirar', [member.id]);
      notifyDataChanged();
      toast.success(`Tag “${tirando.name}” retirada de ${member.name}.`);
      setTirando(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível tirar a tag.');
    }
  }

  return (
    <section aria-labelledby={`tags-${member.id}`} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 id={`tags-${member.id}`} className="text-sm font-semibold text-ink-900">
          Tags
        </h4>
        {podeEditar ? (
          <Button variant="subtle" size="sm" onClick={() => setEscolhendo(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Adicionar tag
          </Button>
        ) : null}
      </div>

      {tags.length === 0 ? (
        <p className="rounded-control border border-dashed border-line p-3 text-sm text-ink-500">
          Nenhuma tag. Uma tag — como <strong className="font-semibold text-ink-700">Coordenador Delta Operacional</strong>{' '}
          — não muda nada do que a pessoa fez: só passa a mostrar a nova função, com a origem à vista.
        </p>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <CartaoDaTag
              key={tag.id}
              tag={tag}
              member={member}
              cadastros={cadastros}
              brilhar={recem === tag.id}
              onTirar={podeEditar ? () => setTirando(tag) : undefined}
            />
          ))}
        </ul>
      )}

      {podeEditar ? <HistoricoDeTags memberId={member.id} versao={tags.map((t) => t.id).join(',')} /> : null}

      {escolhendo ? (
        <EscolherTagModal member={member} onClose={() => setEscolhendo(false)} onEscolher={colocar} />
      ) : null}

      <ConfirmDialog
        open={Boolean(tirando)}
        title={`Tirar “${tirando?.name ?? ''}” de ${member.name}?`}
        description={`${member.name} continua exatamente como era antes da tag: cadastros, link, acesso e nível não mudam. O histórico guarda que teve a tag.`}
        confirmLabel="Tirar tag"
        onConfirm={confirmarTirar}
        onCancel={() => setTirando(null)}
      />
    </section>
  );
}

/** Uma tag da pessoa: origem → tag, desde quando, por quem, e o que ficou preservado. */
function CartaoDaTag({
  tag,
  member,
  cadastros,
  brilhar,
  onTirar,
}: {
  tag: MemberTag;
  member: Member;
  cadastros: number | null;
  brilhar: boolean;
  onTirar?: () => void;
}) {
  const escuro = tag.color === 'navy' || tag.color === 'slate';
  const estilo = ESTILO_DA_TAG[tag.color];
  const primeiroNome = member.name.split(/\s+/)[0];

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-card p-3.5 ring-1',
        estilo.chip,
        brilhar && 'animate-pop',
      )}
    >
      {/* O simbolo grande, de fundo: a insignia e a primeira coisa que se ve. */}
      {tag.symbol ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -top-3 right-12 text-[5.5rem] leading-none font-black select-none',
            estilo.simbolo,
            'opacity-15',
          )}
        >
          {tag.symbol}
        </span>
      ) : null}
      {/* Luz que atravessa a tag uma vez, quando ela acabou de ser colocada. */}
      {brilhar ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-delta-brilho bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      ) : null}

      <div className="relative flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-control text-lg font-black',
            escuro ? 'bg-white/10' : 'bg-white/70',
            estilo.simbolo,
          )}
        >
          {tag.symbol ?? tag.name.charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          {/* A trajetoria: de onde veio, e o que virou. */}
          <p className={cn('flex flex-wrap items-center gap-1.5 text-xs', escuro ? 'text-white/75' : 'text-ink-500')}>
            <span
              className={cn(
                'rounded-pill px-2 py-0.5 font-medium',
                escuro ? 'bg-white/10 text-white' : 'bg-white/80 text-ink-700',
              )}
            >
              Era {TEAM_TIER_LABELS[tag.fromTier]}
            </span>
            <ArrowRight aria-hidden="true" className="size-3.5" />
            <span>virou</span>
          </p>
          <p className="mt-1 text-base leading-tight font-bold break-words">{tag.name}</p>

          <p className={cn('mt-1.5 text-xs', escuro ? 'text-white/70' : 'text-ink-500')}>
            Desde {formatDateTime(tag.since)}
            {tag.byName ? ` · por ${tag.byName}` : ''}
          </p>

          <p className={cn('mt-2 flex items-start gap-1.5 text-xs', escuro ? 'text-white/85' : 'text-ink-700')}>
            <ShieldCheck aria-hidden="true" className={cn('mt-px size-3.5 shrink-0', estilo.simbolo)} />
            <span>
              Tudo preservado
              {cadastros !== null && member.userId
                ? `: ${cadastros} ${cadastros === 1 ? 'cadastro continua' : 'cadastros continuam'} no nome de ${primeiroNome}`
                : ''}
              {' — '}link, acesso e nível ({TEAM_TIER_LABELS[member.tier]}) iguais.
            </span>
          </p>
        </div>

        {onTirar ? (
          <button
            type="button"
            onClick={onTirar}
            aria-label={`Tirar a tag ${tag.name}`}
            title="Tirar a tag"
            className={cn(
              'relative -mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              escuro ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-ink-500 hover:bg-white/80 hover:text-ink-900',
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Escolher uma tag do catalogo — ou criar uma na hora e ja colocar. */
function EscolherTagModal({
  member,
  onClose,
  onEscolher,
}: {
  member: Member;
  onClose: () => void;
  onEscolher: (tag: TagDoCatalogo) => Promise<void>;
}) {
  const { tags, erro, criar } = useCatalogoDeTags();
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [colocando, setColocando] = useState<string | null>(null);

  const jaTem = new Set((member.tags ?? []).map((t) => t.id));
  const disponiveis = (tags ?? []).filter(
    (tag) => !jaTem.has(tag.id) && (!busca.trim() || tag.name.toLowerCase().includes(busca.trim().toLowerCase())),
  );
  const nomeNovo = busca.trim();
  const podeCriarComONome = Boolean(nomeNovo) && !(tags ?? []).some((t) => mesmoNomeDeTag(t.name, nomeNovo));

  async function escolher(tag: TagDoCatalogo) {
    setColocando(tag.id);
    try {
      await onEscolher(tag);
    } finally {
      setColocando(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={criando ? 'Nova tag' : `Tag para ${member.name}`}
      onBack={criando ? () => setCriando(false) : undefined}
      backLabel={criando ? 'as tags' : undefined}
      busy={colocando !== null}
    >
      {criando ? (
        <EditorDeTag
          inicial={{ name: nomeNovo, symbol: null, color: 'navy', description: null }}
          rotulo="Criar e colocar"
          onCancelar={() => setCriando(false)}
          onSalvar={async (tag) => {
            const criada = await criar(tag);
            await onEscolher(criada);
          }}
        />
      ) : (
        <div className="space-y-3">
          <SearchInput id="escolher-tag-busca" label="Buscar tag" value={busca} onChange={setBusca} placeholder="Buscar ou criar tag" />

          {erro && !tags ? <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">{erro}</p> : null}

          {tags && disponiveis.length === 0 && !podeCriarComONome ? (
            <p className="py-4 text-center text-sm text-ink-500">
              {tags.length && !busca ? `${member.name} já tem todas as tags.` : 'Nenhuma tag encontrada.'}
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {disponiveis.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  disabled={colocando !== null}
                  onClick={() => escolher(tag)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control border border-line px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <TagChip tag={tag} />
                    {tag.description ? <span className="mt-1 block text-xs text-ink-500">{tag.description}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-ink-400 tabular-nums">
                    {tag.pessoas} {tag.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <Button variant="secondary" fullWidth onClick={() => setCriando(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {podeCriarComONome ? `Criar a tag “${nomeNovo}”` : 'Criar nova tag'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

const ACAO: Record<EventoDeTag['acao'], string> = {
  ADDED: 'recebeu',
  REMOVED: 'deixou de ter',
  TAG_DELETED: 'perdeu (tag apagada do catálogo)',
};

/** O que aconteceu com as tags da pessoa, do mais recente para o mais antigo. */
function HistoricoDeTags({ memberId, versao }: { memberId: string; versao: string }) {
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<EventoDeTag[] | null>(null);

  // Aberto — e de novo sempre que as tags da pessoa mudam.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    api<{ historico: EventoDeTag[] }>(`/api/members/${memberId}/tags`)
      .then(({ historico }) => vivo && setEventos(historico))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, [aberto, memberId, versao]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900"
      >
        <History aria-hidden="true" className="size-3.5" />
        Histórico de tags
        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto ? (
        eventos === null ? (
          <p className="py-2 text-xs text-ink-400">Carregando…</p>
        ) : eventos.length === 0 ? (
          <p className="py-2 text-xs text-ink-400">Nada registrado ainda.</p>
        ) : (
          <ol className="mt-1 space-y-1.5 border-l-2 border-line pl-3">
            {eventos.map((evento, i) => (
              <li key={`${evento.em}-${i}`} className="text-xs text-ink-700">
                <span className="text-ink-400">{formatDateTime(evento.em)} · </span>
                {ACAO[evento.acao]} <strong className="font-semibold">{evento.tagName}</strong>
                <span className="text-ink-400">
                  {' '}
                  · era {TEAM_TIER_LABELS[evento.nivel]} · por {evento.por}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
