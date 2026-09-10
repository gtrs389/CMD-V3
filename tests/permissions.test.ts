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

  it('nao da painel ao perfil EQUIPE nesta etapa', () => {
    expect(hasPanelAccess(equipe)).toBe(false);
    expect(can(equipe, 'client.view')).toBe(false);
    expect(can(equipe, 'member.view')).toBe(false);
  });

  it('permite apenas o envio publico para EQUIPE e visitantes', () => {
    expect(can(equipe, 'invite.submit')).toBe(true);
    expect(can(null, 'invite.submit')).toBe(true);
    expect(can(null, 'admin.access')).toBe(false);
  });

  it('visitante nao herda nenhuma permissao administrativa', () => {
    expect(permissionsOf(null)).toEqual(['invite.submit']);
  });
});
