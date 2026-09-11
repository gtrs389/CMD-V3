import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalClientRepository } from '@/lib/repositories/local/client.repository';
import { createLocalMemberRepository } from '@/lib/repositories/local/member.repository';
import { createMemoryStorage, type StorageDriver } from '@/lib/repositories/local/storage';

let storage: StorageDriver;
const driver = () => storage;

const clients = createLocalClientRepository(driver);
const members = createLocalMemberRepository(driver);

const clientInput = {
  name: 'Comite Central',
  email: 'CONTATO@Exemplo.com',
  photo: null,
  notes: ' anotacao ',
};

beforeEach(() => {
  storage = createMemoryStorage();
});

describe('repositorio de clientes', () => {
  it('cria com formulário padrão e convite ativo', async () => {
    const { client } = await clients.create(clientInput);

    expect(client.email).toBe('contato@exemplo.com');
    expect(client.notes).toBe('anotacao');
    expect(client.invite.active).toBe(true);
    expect(client.invite.token ?? '').toHaveLength(20);
    expect(client.form.fields).toHaveLength(11);
  });

  it('não coloca dado pessoal no token do convite', async () => {
    const { client } = await clients.create(clientInput);
    const token = (client.invite.token ?? '').toLowerCase();

    expect(token).not.toContain('comite');
    expect(token).not.toContain('contato');
    expect(token).toMatch(/^[a-z0-9]+$/);
  });

  it('localiza pelo token e trata token inexistente', async () => {
    const { client } = await clients.create(clientInput);

    expect(await clients.getByToken(client.invite.token ?? '')).not.toBeNull();
    expect(await clients.getByToken('token-invalido')).toBeNull();
    expect(await clients.getByToken('')).toBeNull();
  });

  it('gera novo token invalidando o anterior', async () => {
    const { client } = await clients.create(clientInput);
    const previous = client.invite.token ?? '';

    const rotated = await clients.regenerateInviteToken(client.id);

    expect(rotated.invite.token).not.toBe(previous);
    expect(rotated.invite.rotatedAt).not.toBeNull();
    expect(await clients.getByToken(previous)).toBeNull();
  });

  it('desativa o convite sem apagar o token', async () => {
    const { client } = await clients.create(clientInput);
    const updated = await clients.setInviteActive(client.id, false);

    expect(updated.invite.active).toBe(false);
    expect(updated.invite.token).toBe(client.invite.token);
  });

  it('atualiza apenas os campos informados', async () => {
    const { client } = await clients.create(clientInput);
    const updated = await clients.update(client.id, { name: 'Novo nome' });

    expect(updated.name).toBe('Novo nome');
    expect(updated.email).toBe(client.email);
  });

  it('conta integrantes no resumo', async () => {
    const { client } = await clients.create(clientInput);
    await members.create({
      clientId: client.id,
      name: 'Ana',
      phone: '11987654321',
      photo: null,
      responses: [],
      consentAt: null,
      source: 'invite',
    });

    const [summary] = await clients.listSummaries();
    expect(summary.memberCount).toBe(1);
    expect(summary.lastMemberAt).not.toBeNull();
  });
});

describe('repositorio de integrantes', () => {
  it('normaliza o telefone ao salvar', async () => {
    const { client } = await clients.create(clientInput);
    const member = await members.create({
      clientId: client.id,
      name: '  Ana Souza ',
      phone: '+55 (11) 98765-4321',
      photo: null,
      responses: [],
      consentAt: null,
      source: 'invite',
    });

    expect(member.name).toBe('Ana Souza');
    expect(member.phone).toBe('11987654321');
  });

  it('remove toda a equipe ao excluir o cliente', async () => {
    const { client } = await clients.create(clientInput);
    for (const name of ['Ana', 'Bruno']) {
      await members.create({
        clientId: client.id,
        name,
        phone: '11987654321',
        photo: null,
        responses: [],
        consentAt: null,
        source: 'invite',
      });
    }

    expect(await members.removeByClient(client.id)).toBe(2);
    expect(await members.listByClient(client.id)).toHaveLength(0);
  });

  it('rejeita atualização de integrante inexistente', async () => {
    await expect(members.update('nao-existe', { name: 'X' })).rejects.toThrow();
  });
});

describe('isolamento entre clientes', () => {
  it('lista apenas os integrantes do próprio cliente', async () => {
    const { client: primeiro } = await clients.create(clientInput);
    const { client: segundo } = await clients.create({ ...clientInput, email: 'outro@exemplo.com' });

    await members.create({
      clientId: primeiro.id,
      name: 'Ana',
      phone: '11987654321',
      photo: null,
      responses: [],
      consentAt: null,
      source: 'invite',
    });

    expect(await members.listByClient(primeiro.id)).toHaveLength(1);
    expect(await members.listByClient(segundo.id)).toHaveLength(0);
  });
});
