import { describe, expect, it } from 'vitest';
import { can, hasPanelAccess, permissionsOf } from '@/lib/permissions';

const admin = { role: 'ADMIN' } as const;
const equipe = { role: 'EQUIPE' } as const;
const time = { role: 'CANDIDATE' } as const;

describe('permissoes', () => {
  it('da acesso total ao ADMIN', () => {
    expect(hasPanelAccess(admin)).toBe(true);
    expect(can(admin, 'client.delete')).toBe(true);
    expect(can(admin, 'form.manage')).toBe(true);
  });

  it('abre o painel da EQUIPE, mas só em leitura e sem o registro do candidato', () => {
    expect(hasPanelAccess(equipe)).toBe(true);
    expect(can(equipe, 'team.access')).toBe(true);
    expect(can(equipe, 'member.view')).toBe(true);
    expect(can(equipe, 'invite.view')).toBe(true);

    // Cadastrar a mao ELE PODE: nem toda pessoa se cadastra sozinha pelo
    // link, e o integrante precisa registrar quem esta na frente dele.
    expect(can(equipe, 'member.create')).toBe(true);

    // O registro do candidato, as demais escritas e a gestao do convite
    // continuam fora.
    expect(can(equipe, 'client.view')).toBe(false);
    expect(can(equipe, 'client.list')).toBe(false);
    expect(can(equipe, 'member.update')).toBe(false);
    expect(can(equipe, 'member.delete')).toBe(false);
    // A area interna do formulario e exclusiva do ADMIN: nem ver, nem mexer.
    expect(can(equipe, 'form.view')).toBe(false);
    expect(can(equipe, 'form.manage')).toBe(false);
    expect(can(equipe, 'invite.manage')).toBe(false);
    expect(can(equipe, 'settings.view')).toBe(false);
    expect(can(equipe, 'device.view')).toBe(false);
    expect(can(equipe, 'verification.view')).toBe(false);
    expect(can(equipe, 'map.view')).toBe(false);
  });

  it('entrar no painel de alguém é só do ADMIN geral', () => {
    // A sessão aberta é de verdade e escreve no nome da pessoa: ela não
    // acompanha `member.view` nem o acesso ao painel — é permissão própria.
    expect(can(admin, 'session.impersonate')).toBe(true);
    expect(can(time, 'session.impersonate')).toBe(false);
    expect(can(equipe, 'session.impersonate')).toBe(false);
    expect(can(null, 'session.impersonate')).toBe(false);
  });

  it('exportar a equipe em planilha é só do ADMIN geral', () => {
    // A lista inteira em um arquivo sai do sistema e não volta: quem
    // responde por essa saída é o ADMIN. Ver a equipe na tela continua
    // valendo para os três perfis.
    expect(can(admin, 'member.export')).toBe(true);
    expect(can(time, 'member.export')).toBe(false);
    expect(can(equipe, 'member.export')).toBe(false);
    expect(can(null, 'member.export')).toBe(false);
  });

  it('permite o envio público para EQUIPE e visitantes', () => {
    expect(can(equipe, 'invite.submit')).toBe(true);
    expect(can(null, 'invite.submit')).toBe(true);
    expect(can(null, 'admin.access')).toBe(false);
  });

  it('visitante não herda nenhuma permissão administrativa', () => {
    expect(permissionsOf(null)).toEqual(['invite.submit']);
  });
});
