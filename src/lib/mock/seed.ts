import { clientRepository, memberRepository } from '@/lib/repositories';
import { createField, createOption } from '@/lib/domain/form-config';
import type { Client, CustomField, FieldResponse } from '@/lib/types';

/**
 * Dados de exemplo.
 *
 * Servem para demonstrar a operacao. Sao gravados pelos mesmos repositorios
 * usados pelo restante do sistema, ou seja, vao para o Supabase pelas rotas
 * de API e passam pelas mesmas regras e validacoes.
 */

interface SeedMember {
  name: string;
  phone: string;
  /** E-mail de demonstracao: e o login que o integrante recebe. */
  email: string;
  regiao: string;
  disponibilidade: string[];
  observacao: string;
}

interface SeedClient {
  name: string;
  email: string;
  notes: string;
  members: SeedMember[];
}

const SEED: SeedClient[] = [
  {
    name: 'Coordenação Regional Norte',
    email: 'coordenação.norte@exemplo.com',
    notes: 'Equipe responsável pela articulação nos bairros do setor norte.',
    members: [
      {
        name: 'Ana Beatriz Moraes',
        phone: '11987650001',
        email: 'ana.moraes@exemplo.test',
        regiao: 'Zona Norte',
        disponibilidade: ['Manhã', 'Tarde'],
        observacao: 'Tem veículo próprio.',
      },
      {
        name: 'Carlos Eduardo Lima',
        phone: '11987650002',
        email: 'carlos.lima@exemplo.test',
        regiao: 'Centro',
        disponibilidade: ['Noite'],
        observacao: '',
      },
      {
        name: 'Juliana Prado',
        phone: '21987650003',
        email: 'juliana.prado@exemplo.test',
        regiao: 'Zona Norte',
        disponibilidade: ['Manhã'],
        observacao: 'Prefere contato por mensagem.',
      },
    ],
  },
  {
    name: 'Núcleo Zona Sul',
    email: 'núcleo.sul@exemplo.com',
    notes: '',
    members: [
      {
        name: 'Marcos Vinicius Tavares',
        phone: '11987650004',
        email: 'marcos.tavares@exemplo.test',
        regiao: 'Zona Sul',
        disponibilidade: ['Tarde', 'Noite'],
        observacao: '',
      },
    ],
  },
];

const EXTRA_LABELS = {
  regiao: 'Região de atuação',
  disponibilidade: 'Disponibilidade',
  observacao: 'Observações',
} as const;

function buildExtraFields(order: number): CustomField[] {
  const regiao: CustomField = {
    ...createField('select'),
    label: EXTRA_LABELS.regiao,
    helpText: 'Onde a pessoa atua com mais frequência.',
    required: true,
    order,
    options: [createOption('Centro'), createOption('Zona Norte'), createOption('Zona Sul')],
  };

  const disponibilidade: CustomField = {
    ...createField('multiselect'),
    label: EXTRA_LABELS.disponibilidade,
    helpText: 'Pode marcar mais de um período.',
    order: order + 1,
    options: [createOption('Manhã'), createOption('Tarde'), createOption('Noite')],
  };

  const observacao: CustomField = {
    ...createField('textarea'),
    label: EXTRA_LABELS.observacao,
    placeholder: 'Algo que a coordenação precisa saber',
    order: order + 2,
    options: [],
  };

  return [regiao, disponibilidade, observacao];
}

/**
 * Localiza o campo pelo rotulo.
 *
 * Os identificadores definitivos sao gerados pelo banco ao salvar, entao os
 * IDs montados aqui nao servem para referenciar as respostas.
 */
function fieldByLabel(fields: CustomField[], label: string): CustomField | undefined {
  return fields.find((field) => field.label === label);
}

function optionIdByLabel(field: CustomField | undefined, label: string): string | null {
  return field?.options.find((option) => option.label === label)?.id ?? null;
}

/** Cria clientes, campos e integrantes de demonstracao. */
export async function loadSampleData(): Promise<number> {
  let created = 0;

  for (const entry of SEED) {
    const { client }: { client: Client } = await clientRepository.create({
      name: entry.name,
      email: entry.email,
      photo: null,
      notes: entry.notes,
    });

    const extras = buildExtraFields(client.form.fields.length);
    const updated = await clientRepository.updateForm(client.id, {
      fields: [...client.form.fields, ...extras],
      introText: 'Preencha seus dados para integrar a equipe.',
    });

    const regiaoField = fieldByLabel(updated.form.fields, EXTRA_LABELS.regiao);
    const dispField = fieldByLabel(updated.form.fields, EXTRA_LABELS.disponibilidade);
    const obsField = fieldByLabel(updated.form.fields, EXTRA_LABELS.observacao);

    for (const member of entry.members) {
      await memberRepository.create({
        clientId: client.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        photo: null,
        consentAt: null,
        source: 'invite',
        responses: ([
          regiaoField
            ? { fieldId: regiaoField.id, value: optionIdByLabel(regiaoField, member.regiao) }
            : null,
          dispField
            ? {
                fieldId: dispField.id,
                value: member.disponibilidade
                  .map((label) => optionIdByLabel(dispField, label))
                  .filter((id): id is string => id !== null),
              }
            : null,
          obsField ? { fieldId: obsField.id, value: member.observacao || null } : null,
        ] as (FieldResponse | null)[]).filter(
          (response): response is FieldResponse => response !== null,
        ),
      });
      created += 1;
    }
  }

  return created;
}
