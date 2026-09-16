'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { citiesPath, parseCities, type CityOption } from '@/lib/domain/location';
import { UF_OPTIONS } from '@/lib/utils/documents';

/**
 * De onde o time e: o ESTADO e, se ele quiser dizer, os MUNICIPIOS.
 *
 * Ate a migration 038 o sistema so sabia disso INDIRETAMENTE, pelo endereco
 * de cada integrante que se cadastrava — ou seja, so depois do primeiro
 * cadastro chegar, e nunca do time em si.
 *
 * O ESTADO E OBRIGATORIO e a lista traz so as 27 siglas: nao ha como
 * escolher um estado errado, so deixar de escolher. A sigla e o que o resto
 * do sistema ja grava no endereco do integrante, e e por ela que as duas
 * coisas cruzam — por isso a lista, e nao um campo de digitar.
 *
 * OS MUNICIPIOS SAO OPCIONAIS E VARIOS. Uma operacao raramente cabe em um
 * municipio so; obrigar a escolher um seria pedir uma resposta errada, e
 * aceitar so um seria pedir metade dela. Nenhum municipio escolhido quer
 * dizer "o time nao restringiu" — nunca "o time nao tem".
 *
 * A lista de municipios e a do proprio estado, e vem da rota interna
 * `/api/localidades`: a chave da API externa fica no servidor e nunca chega
 * ao navegador. Trocar o estado LIMPA os municipios, porque um municipio de
 * Alagoas nao faz sentido embaixo de Sergipe.
 *
 * Se a lista falhar, o campo de municipio diz isso e oferece tentar de novo
 * — e o cadastro segue assim mesmo, porque o municipio e opcional. O que nao
 * pode e um time deixar de ser cadastrado porque uma lista de apoio nao
 * carregou.
 */

interface TeamPlaceFieldsProps {
  stateUf: string;
  cities: string[];
  onStateChange: (uf: string) => void;
  onCitiesChange: (cities: string[]) => void;
  stateError?: string;
}

const ESTADO_ID = 'time-estado';
const MUNICIPIO_ID = 'time-municipios';

export function TeamPlaceFields({
  stateUf,
  cities,
  onStateChange,
  onCitiesChange,
  stateError,
}: TeamPlaceFieldsProps) {
  /**
   * A lista carregada, marcada com o estado a que pertence.
   *
   * Guardar so o resultado — e DERIVAR "carregando" e "falhou" dele — evita
   * mexer em estado no corpo do efeito, que dispara renderizacao em
   * cascata. E, de quebra, mata sozinho o caso da resposta atrasada: uma
   * lista de Alagoas que chega depois de o ADMIN trocar para Sergipe nao
   * corresponde ao estado atual, e simplesmente nao e usada.
   */
  const [lista, setLista] = useState<{ uf: string; tentativa: number; opcoes: CityOption[] } | null>(
    null,
  );
  const [erro, setErro] = useState<{ uf: string; tentativa: number } | null>(null);
  /** Muda so para forcar uma nova tentativa no mesmo estado. */
  const [tentativa, setTentativa] = useState(0);

  const pronto = lista?.uf === stateUf && lista.tentativa === tentativa;
  const falhou = erro?.uf === stateUf && erro.tentativa === tentativa;
  const carregando = Boolean(stateUf) && !pronto && !falhou;
  const opcoes = pronto ? lista.opcoes : [];

  useEffect(() => {
    if (!stateUf) return;

    fetch(citiesPath(stateUf))
      .then((resposta) => {
        if (!resposta.ok) throw new Error('falha');
        return resposta.json();
      })
      .then((corpo) => {
        setLista({ uf: stateUf, tentativa, opcoes: parseCities(corpo) });
      })
      .catch(() => {
        setErro({ uf: stateUf, tentativa });
      });
  }, [stateUf, tentativa]);

  const trocarEstado = useCallback(
    (uf: string) => {
      if (uf === stateUf) return;
      onStateChange(uf);
      // Municipio pertence a um estado: mantidos, virariam uma lista que nao
      // existe no estado novo.
      onCitiesChange([]);
    },
    [stateUf, onStateChange, onCitiesChange],
  );

  function adicionar(nome: string) {
    if (!nome || cities.includes(nome)) return;
    onCitiesChange([...cities, nome]);
  }

  function remover(nome: string) {
    onCitiesChange(cities.filter((item) => item !== nome));
  }

  // O que ja foi escolhido sai da lista: reoferecer seria oferecer um clique
  // que nao faz nada.
  const disponiveis = opcoes
    .filter((cidade) => !cities.includes(cidade.name))
    .map((cidade) => ({ value: cidade.name, label: cidade.name }));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
      <Field
        id={ESTADO_ID}
        label="Estado"
        required
        error={stateError}
        className="sm:basis-64"
        help="De qual estado é este time."
      >
        <SearchableSelect
          id={ESTADO_ID}
          value={stateUf}
          options={UF_OPTIONS.map((uf) => ({ value: uf.id, label: uf.label }))}
          placeholder="Selecione o estado"
          searchPlaceholder="Buscar estado"
          onChange={trocarEstado}
          invalid={Boolean(stateError)}
        />
      </Field>

      <Field
        id={MUNICIPIO_ID}
        label="Municípios"
        className="sm:flex-1"
        help={
          stateUf
            ? 'Opcional. Pode escolher mais de um; em branco vale o estado inteiro.'
            : 'Escolha o estado primeiro.'
        }
      >
        <div className="flex flex-col gap-2">
          <SearchableSelect
            id={MUNICIPIO_ID}
            // Sempre vazio: este campo ADICIONA um municipio, e os escolhidos
            // ficam logo abaixo. Deixar o ultimo escolhido no controle faria
            // parecer que so ha um.
            value=""
            options={disponiveis}
            placeholder={cities.length > 0 ? 'Adicionar outro município' : 'Adicionar município'}
            searchPlaceholder="Buscar município"
            onChange={adicionar}
            disabled={!stateUf || falhou}
            disabledHint={
              !stateUf ? 'Escolha o estado primeiro.' : 'Lista de municípios indisponível.'
            }
            loading={carregando}
            error={falhou ? 'Não foi possível carregar os municípios.' : null}
            onRetry={() => setTentativa((valor) => valor + 1)}
          />

          {cities.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {cities.map((nome) => (
                <li key={nome}>
                  <span className="inline-flex items-center gap-1 rounded-pill border border-line bg-ink-50 py-1 pr-1 pl-2.5 text-xs font-medium text-ink-700">
                    {nome}
                    <button
                      type="button"
                      onClick={() => remover(nome)}
                      aria-label={`Remover ${nome}`}
                      className="inline-flex size-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>
    </div>
  );
}
