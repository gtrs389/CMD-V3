'use client';

import { useCallback, useState } from 'react';
import { DoorOpen, Save } from 'lucide-react';
import type { PublicEntrySettings } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

/**
 * Saida do dominio publico, em Configuracoes.
 *
 * Somente o ADMIN ve e altera: as rotas exigem `settings.view` e
 * `settings.manage`.
 *
 * O sistema tem dois enderecos. O do painel — `painel.<dominio>` — atende
 * login, cadastro e configuracoes. O outro, o dominio publico, e o que vai
 * nos links enviados por WhatsApp: ele serve o formulario de cadastro, o
 * questionario e o acesso do time, e nada mais.
 *
 * Quem chega ao dominio publico tentando abrir o painel nao encontra a tela
 * de login — e por ela que um ataque comeca, e ela nao tem por que ficar
 * exposta no endereco que milhares de pessoas recebem. Essa pessoa vai para
 * o endereco escolhido aqui.
 *
 * Em branco, ela ve apenas um aviso neutro: sem login, sem nome de time e
 * sem nada que identifique o sistema.
 *
 * O segundo campo e o outro lado da mesma moeda: qual endereco vai NOS
 * LINKS enviados. Ele era montado com o endereco da aba aberta, e quem gera
 * o link esta no painel — o link saia apontando para o painel, onde a
 * pessoa convidada cai justamente na tela de saida. Em branco, o servidor
 * deduz trocando `painel.` por `www.`; preenchido, manda sozinho.
 */
export function PublicEntryCard() {
  const toast = useToast();
  const loader = useCallback(
    () => api<{ entry: PublicEntrySettings }>('/api/configuracoes/acesso'),
    [],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [draft, setDraft] = useState<string | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const atual = data?.entry.redirectUrl ?? '';
  const atualOrigem = data?.entry.linkOrigin ?? '';
  const valor = draft ?? atual;
  const valorOrigem = origem ?? atualOrigem;
  const mudou = valor.trim() !== atual || valorOrigem.trim() !== atualOrigem;

  async function salvar() {
    setSaving(true);
    try {
      const { entry } = await api<{ entry: PublicEntrySettings }>('/api/configuracoes/acesso', {
        method: 'PATCH',
        body: { redirectUrl: valor.trim(), linkOrigin: valorOrigem.trim() },
      });
      setDraft(null);
      setOrigem(null);
      reload();
      toast.success(
        entry.redirectUrl
          ? 'Destino salvo. Quem chegar pelo domínio público vai para lá.'
          : 'Redirecionamento desligado. Quem chegar verá apenas um aviso neutro.',
      );
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível salvar o destino.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <DoorOpen aria-hidden="true" className="size-4 text-ink-400" />
              Entrada pelo domínio público
            </span>
          </CardTitle>
          <CardDescription>
            O domínio público é o que vai nos links enviados. Ele atende o formulário de
            cadastro, o Formulário 2 e o acesso do time — a tela de login não fica exposta
            nele. Escolha para onde mandar quem chegar sem um link válido.
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {loading ? (
          <Skeleton className="h-11 w-full rounded-control" />
        ) : error ? (
          <div
            role="alert"
            className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          >
            <p>{error}</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <Field
              id="saida-publica"
              label="Endereço de destino"
              help="Deixe em branco para mostrar apenas um aviso neutro, sem redirecionar."
            >
              <Input
                id="saida-publica"
                type="url"
                inputMode="url"
                spellCheck={false}
                placeholder="https://exemplo.com.br"
                value={valor}
                disabled={saving}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>

            <Field
              id="origem-links"
              label="Endereço dos links enviados"
              help="Deixe em branco para deduzir do painel: painel.seudominio.com vira www.seudominio.com."
            >
              <Input
                id="origem-links"
                type="url"
                inputMode="url"
                spellCheck={false}
                placeholder="https://www.seudominio.com.br"
                value={valorOrigem}
                disabled={saving}
                onChange={(event) => setOrigem(event.target.value)}
              />
            </Field>

            <div className="flex justify-end">
              <Button onClick={() => void salvar()} loading={saving} disabled={!mudou}>
                <Save aria-hidden="true" className="size-4" />
                Salvar destino
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
