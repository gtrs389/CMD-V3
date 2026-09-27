import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, permissionsOf, roleLabel, ROLE_LABELS } from '@/lib/permissions';
import { EQUIPE_NAO_CADASTRA, tierCanRecruit, tierOf } from '@/lib/domain/team-tier';
import { recruiterText } from '@/lib/domain/recruitment';
import { TEAM_TIER_LABELS, type Recruiter, type SessionUser } from '@/lib/types';

/**
 * Lideres e Equipe.
 *
 *   Administrador do time  cadastra os LIDERES;
 *   Lider                  cadastra a EQUIPE;
 *   Equipe                 nao cadastra ninguem.
 *
 * O nivel nao e gravado: sai de quem cadastrou a pessoa. Estes testes
 * prendem essa regra, as permissoes que ela tira da Equipe e os nomes que
 * aparecem na tela.
 */

const LIDER: SessionUser = {
  id: 'u-joao',
  name: 'João Silva',
  email: null,
  role: 'EQUIPE',
  tier: 'LIDER',
  candidateId: 'cli-a',
  memberId: 'm-joao',
  mustChangePassword: false,
};

const EQUIPE: SessionUser = {
  ...LIDER,
  id: 'u-ana',
  name: 'Ana Ribeiro',
  tier: 'EQUIPE',
  memberId: 'm-ana',
};

describe('o nível sai de quem cadastrou', () => {
  it('cadastrado pelo Administrador do time é Líder', () => {
    expect(tierOf('CANDIDATE')).toBe('LIDER');
  });

  it('cadastrado por um Líder (perfil EQUIPE) é Equipe', () => {
    expect(tierOf('EQUIPE')).toBe('EQUIPE');
  });

  it('cadastro do ADMIN geral ou sem origem conhecida continua Líder', () => {
    // Ninguem e rebaixado a Equipe sem evidencia: perder o poder de
    // cadastrar por falta de historico seria punir o cadastro antigo.
    expect(tierOf('ADMIN')).toBe('LIDER');
    expect(tierOf(null)).toBe('LIDER');
    expect(tierOf(undefined)).toBe('LIDER');
  });

  it('só o Líder cadastra', () => {
    expect(tierCanRecruit('LIDER')).toBe(true);
    expect(tierCanRecruit('EQUIPE')).toBe(false);
    // Fora do perfil EQUIPE nao ha nivel, e o perfil decide sozinho.
    expect(tierCanRecruit(null)).toBe(true);
  });
});

describe('permissões', () => {
  it('o Líder cadastra, tem link e envia o Formulário 2', () => {
    expect(can(LIDER, 'member.create')).toBe(true);
    expect(can(LIDER, 'invite.view')).toBe(true);
    expect(can(LIDER, 'invite.renew')).toBe(true);
    expect(can(LIDER, 'survey.send')).toBe(true);
  });

  it('a Equipe não cadastra ninguém, por nenhum caminho', () => {
    expect(can(EQUIPE, 'member.create')).toBe(false);
    expect(can(EQUIPE, 'invite.view')).toBe(false);
    expect(can(EQUIPE, 'invite.renew')).toBe(false);
    expect(can(EQUIPE, 'survey.send')).toBe(false);
  });

  it('a Equipe continua entrando no painel e vendo o que já tinha', () => {
    expect(can(EQUIPE, 'panel.access')).toBe(true);
    expect(can(EQUIPE, 'team.access')).toBe(true);
    expect(can(EQUIPE, 'member.view')).toBe(true);
    expect(can(EQUIPE, 'survey.view')).toBe(true);
  });

  it('a Equipe não ganha nada que o Líder não tenha', () => {
    const lider = permissionsOf('EQUIPE', 'LIDER');
    for (const permissao of permissionsOf('EQUIPE', 'EQUIPE')) {
      expect(lider).toContain(permissao);
    }
  });

  it('sessão sem nível conhecido fica com o que o perfil sempre teve', () => {
    // Sessoes antigas, ou lidas antes do nivel existir: nada e tirado.
    expect(permissionsOf('EQUIPE')).toEqual(permissionsOf('EQUIPE', 'LIDER'));
  });

  it('o nível não mexe em outro perfil', () => {
    expect(permissionsOf('CANDIDATE', 'EQUIPE')).toEqual(permissionsOf('CANDIDATE'));
    expect(permissionsOf('ADMIN', 'EQUIPE')).toEqual(permissionsOf('ADMIN'));
  });
});

describe('nomes na tela', () => {
  it('Líder e Equipe', () => {
    expect(TEAM_TIER_LABELS.LIDER).toBe('Líder');
    expect(TEAM_TIER_LABELS.EQUIPE).toBe('Equipe');
  });

  it('o perfil EQUIPE aparece como Líder, e como Equipe quando o nível diz', () => {
    expect(ROLE_LABELS.EQUIPE).toBe('Líder');
    expect(roleLabel('EQUIPE')).toBe('Líder');
    expect(roleLabel('EQUIPE', 'LIDER')).toBe('Líder');
    expect(roleLabel('EQUIPE', 'EQUIPE')).toBe('Equipe');
    expect(roleLabel('CANDIDATE', 'EQUIPE')).toBe('Administrador do time');
  });

  it('"Cadastrado por" diz Líder, e Equipe só no cadastro antigo', () => {
    const joao: Recruiter = { userId: 'u-joao', name: 'João Silva', role: 'EQUIPE', photo: null };
    expect(recruiterText(joao)).toBe('João Silva · Líder');
    expect(recruiterText({ ...joao, tier: 'LIDER' })).toBe('João Silva · Líder');
    // Alguem que hoje e Equipe e cadastrou antes da separacao dos niveis.
    expect(recruiterText({ ...joao, tier: 'EQUIPE' })).toBe('João Silva · Equipe');
  });

  it('a recusa diz o motivo', () => {
    expect(EQUIPE_NAO_CADASTRA).toContain('só o Líder');
  });
});

describe('migration 046', () => {
  const sql = readFileSync('supabase/migrations/046_lideres_e_equipe.sql', 'utf8');
  // O que executa, sem os comentarios — que falam de DROP e DELETE para
  // dizer que nao ha nenhum.
  const codigo = sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

  it('roda em uma transação e não apaga nada', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(codigo).not.toMatch(/\b(drop table|drop column|delete from|truncate)\b/i);
  });

  it('cria a guarda de Líder e Equipe em cmd_members', () => {
    expect(sql).toContain('create or replace function public.cmd_members_lider_guard()');
    expect(sql).toContain('before insert or update on public.cmd_members');
    expect(sql).toContain("set search_path = ''");
  });
});
