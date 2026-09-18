'use client';

import { useState } from 'react';
import { MessageSquareText, Send } from 'lucide-react';
import type { ClientFormConfig, SystemFieldKey } from '@/lib/types';
import { parseChatFill, resumoDoPreenchimento } from '@/lib/domain/chat-fill';
import { visibleFields } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

interface ChatFillBoxProps {
  config: ClientFormConfig;
  /** Escreve um campo do formulario, pelo identificador dele. */
  setValue: (fieldId: string, value: string) => void;
}

/**
 * Cadastro escrito como quem manda uma mensagem.
 *
 * Quem cadastra em mutirao nao esta diante de um formulario: esta com o
 * telefone na mao, ouvindo a pessoa falar. Aqui ele escreve do jeito que
 * ouviu — tudo numa linha, em varias, com rotulo ou sem — aperta enviar, e
 * os campos se preenchem.
 *
 * SEIS coisas sao reconhecidas: nome, telefone, titulo de eleitor, zona,
 * secao e endereco. Mandar so o titulo preenche so o titulo.
 *
 * O FORMULARIO CONTINUA SENDO O FORMULARIO. Isto preenche campos, e nada
 * mais: nada e enviado daqui, a validacao e a mesma, e o que foi entendido
 * fica a vista para quem cadastrou conferir antes de salvar. Um cadastro
 * errado que ninguem viu e pior do que um campo vazio.
 *
 * Campo que o ADMIN desativou no formulario nao e preenchido: se ele nao
 * existe na ficha, nao existe aqui.
 */
export function ChatFillBox({ config, setValue }: ChatFillBoxProps) {
  const toast = useToast();
  const [mensagem, setMensagem] = useState('');
  const [aberto, setAberto] = useState(false);

  /** Identificador do campo padrao, quando ele esta ativo no formulario. */
  function campo(systemKey: SystemFieldKey): string | null {
    return visibleFields(config).find((field) => field.systemKey === systemKey)?.id ?? null;
  }

  function enviar() {
    const lido = parseChatFill(mensagem);
    const preenchidos = resumoDoPreenchimento(lido);

    if (preenchidos.length === 0) {
      toast.error('Não reconheci nada na mensagem. Escreva o nome, o telefone ou o título.');
      return;
    }

    const escrever = (systemKey: SystemFieldKey, valor: string | null) => {
      if (!valor) return;
      const id = campo(systemKey);
      if (id) setValue(id, valor);
    };

    escrever('name', lido.name);
    escrever('phone', lido.phone);
    escrever('voter_id', lido.voterId);
    escrever('zone', lido.zone);
    escrever('section', lido.section);
    // O endereco escrito de uma vez vai para a Rua, que e o campo de
    // logradouro da ficha. Bairro, municipio e estado continuam sendo
    // escolhidos a mao, porque sao listas encadeadas.
    escrever('street', lido.address);

    toast.success(`Preenchi: ${preenchidos.join(', ')}.`);
    setMensagem('');

    if (lido.sobrou.length > 0) {
      // Dito uma vez, sem drama: o resto continua na tela para a pessoa
      // decidir o que fazer.
      toast.error(`Não entendi: ${lido.sobrou.join(' · ')}`);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-2 rounded-control border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-500 transition-colors hover:border-accent-600 hover:text-accent-600"
      >
        <MessageSquareText aria-hidden="true" className="size-4 shrink-0" />
        Preencher escrevendo uma mensagem
      </button>
    );
  }

  return (
    <div className="rounded-control border border-accent-600/30 bg-accent-50/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <MessageSquareText aria-hidden="true" className="size-4 text-accent-600" />
          Escreva a mensagem
        </p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs font-medium text-ink-500 hover:text-ink-900"
        >
          Fechar
        </button>
      </div>

      <Textarea
        id="chat-cadastro"
        rows={3}
        value={mensagem}
        placeholder={'Maria da Silva, 82 99999-0001, título 1000 0000 2720, zona 44 seção 3, Rua das Flores 100'}
        onChange={(event) => setMensagem(event.target.value)}
        onKeyDown={(event) => {
          // Enter envia; Shift+Enter continua quebrando linha, porque a
          // mensagem costuma vir em varias.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            enviar();
          }
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[0.6875rem] leading-snug text-ink-500">
          Nome, telefone, título, zona, seção e endereço. Só o título também serve.
        </p>
        <Button type="button" onClick={enviar} disabled={!mensagem.trim()}>
          <Send aria-hidden="true" className="size-4" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
