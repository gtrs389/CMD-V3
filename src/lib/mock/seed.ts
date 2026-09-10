import { clientRepository, memberRepository } from '@/lib/repositories';
import { createField, createOption } from '@/lib/domain/form-config';
import type { Client, CustomField } from '@/lib/types';

/**
 * Dados de exemplo.
 *
 * Servem para demonstrar a operacao sem banco de dados. Sao gravados nos
 * mesmos repositorios usados pelo restante do sistema, portanto passam pelas
 * mesmas regras e serao substituidos automaticamente quando existir uma API.
 */

interface SeedMember {
  name: string;
  phone: string;
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
    name: 'Coordenacao Regional Norte',
    email: 'coordenacao.norte@exemplo.com',
    notes: 'Equipe responsavel pela articulacao nos bairros do setor norte.',
    members: [
      {
        name: 'Ana Beatriz Moraes',
        phone: '11987650001',
        regiao: 'Zona Norte',
        disponibilidade: ['Manha', 'Tarde'],
        observacao: 'Tem veiculo proprio.',
      },
      {
        name: 'Carlos Eduardo Lima',
        phone: '11987650002',
        regiao: 'Centro',
        disponibilidade: ['Noite'],
        observacao: '',
      },
      {
        name: 'Juliana Prado',
        phone: '21987650003',
        regiao: 'Zona Norte',
        disponibilidade: ['Manha'],
        observacao: 'Prefere contato por mensagem.',
      },
    ],
  },
  {
    name: 'Nucleo Zona Sul',
    email: 'nucleo.sul@exemplo.com',
    notes: '',
    members: [
      {
        name: 'Marcos Vinicius Tavares',
        phone: '11987650004',
        regiao: 'Zona Sul',
        disponibilidade: ['Tarde', 'Noite'],
        observacao: '',
      },
    ],
  },
];

function buildExtraFields(order: number): { fields: CustomField[]; ids: Record<string, string> } {
  const regiao: CustomField = {
    ...createField('select'),
    label: 'Regiao de atuacao',
    helpText: 'Onde a pessoa atua com mais frequencia.',
    required: true,
    order,
    options: [createOption('Centro'), createOption('Zona Norte'), createOption('Zona Sul')],
  };

  const disponibilidade: CustomField = {
    ...createField('multiselect'),
    label: 'Disponibilidade',
    helpText: 'Pode marcar mais de um periodo.',
    order: order + 1,
    options: [createOption('Manha'), createOption('Tarde'), createOption('Noite')],
  };

  const observacao: CustomField = {
    ...createField('textarea'),
    label: 'Observacoes',
    placeholder: 'Algo que a coordenacao precisa saber',
    order: order + 2,
    options: [],
  };

  return {
    fields: [regiao, disponibilidade, observacao],
    ids: { regiao: regiao.id, disponibilidade: disponibilidade.id, observacao: observacao.id },
  };
}

function optionIdByLabel(field: CustomField | undefined, label: string): string | null {
  return field?.options.find((option) => option.label === label)?.id ?? null;
}

/** Cria clientes, campos e integrantes de demonstracao. */
export async function loadSampleData(): Promise<number> {
  let created = 0;

  for (const entry of SEED) {
    const client: Client = await clientRepository.create({
      name: entry.name,
      email: entry.email,
      photo: null,
      notes: entry.notes,
    });

    const { fields, ids } = buildExtraFields(client.form.fields.length);
    const updated = await clientRepository.updateForm(client.id, {
      fields: [...client.form.fields, ...fields],
      introText: 'Preencha seus dados para integrar a equipe.',
    });

    const regiaoField = updated.form.fields.find((field) => field.id === ids.regiao);
    const dispField = updated.form.fields.find((field) => field.id === ids.disponibilidade);

    for (const member of entry.members) {
      await memberRepository.create({
        clientId: client.id,
        name: member.name,
        phone: member.phone,
        photo: null,
        consentAt: null,
        source: 'invite',
        responses: [
          { fieldId: ids.regiao, value: optionIdByLabel(regiaoField, member.regiao) },
          {
            fieldId: ids.disponibilidade,
            value: member.disponibilidade
              .map((label) => optionIdByLabel(dispField, label))
              .filter((id): id is string => id !== null),
          },
          { fieldId: ids.observacao, value: member.observacao || null },
        ],
      });
      created += 1;
    }
  }

  return created;
}
