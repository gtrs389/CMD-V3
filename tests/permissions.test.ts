import { describe, expect, it } from 'vitest';
import { can, hasPanelAccess, permissionsOf } from '@/lib/permissions';

const admin = { role: 'ADMIN' } as const;
const equipe = { role: 'EQUIPE' } as const;

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
    expect(can(equipe, 'form.view')).toBe(true);
    expect(can(equipe, 'invite.view')).toBe(true);

    // O registro do candidato, as escritas e a gestao do convite continuam fora.
    expect(can(equipe, 'client.view')).toBe(false);
    expect(can(equipe, 'client.list')).toBe(false);
    expect(can(equipe, 'member.create')).toBe(false);
    expect(can(equipe, 'member.update')).toBe(false);
    expect(can(equipe, 'member.delete')).toBe(false);
    expect(can(equipe, 'form.manage')).toBe(false);
    expect(can(equipe, 'invite.manage')).toBe(false);
    expect(can(equipe, 'settings.view')).toBe(false);
    expect(can(equipe, 'device.view')).toBe(false);
    expect(can(equipe, 'verification.view')).toBe(false);
    expect(can(equipe, 'map.view')).toBe(false);
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
