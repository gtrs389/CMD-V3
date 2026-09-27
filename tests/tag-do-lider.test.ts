import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TAG_MAX, normalizarTag, tagDaPessoa } from '@/lib/domain/tag-do-lider';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';
import { toMember, toRecruiter } from '@/lib/server/mappers';
import type { MemberRow } from '@/lib/supabase/tables';
import type { Member, Recruiter } from '@/lib/types';

/**
 * Tag do Lider (migration 048).
 *
 * So o Lider guarda a tag; cada pessoa da Equipe mostra a tag do Lider dela,
 * lida na hora. Estes testes prendem as duas metades: o que e gravado e o
 * que aparece ao lado do nome.
 */

const JOAO: Recruiter = {
  userId: 'u-joao',
  name: 'João Silva',
  role: 'EQUIPE',
  tier: 'LIDER',
  tag: 'ZONA NORTE',
  photo: null,
};

function pessoa(parcial: Partial<Member>): Member {
  return {
    id: 'm1', clientId: 'c1', name: 'Maria Souza', phone: '82999990000', email: null, photo: null,
    gender: null, cpf: null, voterId: null, zone: null, section: null, state: 'AL', city: 'Maceió',
    district: 'Centro', street: null, relationshipOptionId: null, relationshipLabel: null, responses: [],
    consentAt: null, source: 'invite', recruitedBy: JOAO, tier: 'EQUIPE', tag: null,
    recruiterChange: null, access: 'NO_PHONE', userId: null,
    createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z',
    ...parcial,
  };
}

function linha(parcial: Partial<MemberRow>): MemberRow {
  return {
    id: 'm1', client_id: 'c1', name: 'Maria Souza', phone: '82999990000', email: null,
    photo_path: null, photo_mime: null, photo_size: null, gender: null, cpf: null, voter_id: null,
    zone: null, section: null, state: null, city: null, district: null, street: null,
    relationship_option_id: null, relationship_label: null, consent_at: null,
    consent_privacy_hash: null, consent_privacy_snapshot: null, consent_privacy_version: null,
    source: 'invite', demo_seed: null, recruited_by_user_id: 'u-joao',
    recruited_by_name: 'João Silva', recruited_by_role: 'EQUIPE', recruiter_changed_at: null,
    recruiter_changed_by: null, recruiter_previous_name: null, tag: null,
    created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z',
    ...parcial,
  };
}

describe('a tag que se grava', () => {
  it('sai limpa e em maiúsculas', () => {
    expect(normalizarTag('  zona   norte ')).toBe('ZONA NORTE');
    expect(normalizarTag('Igreja São José')).toBe('IGREJA SÃO JOSÉ');
  });

  it('vazia vira nulo: é assim que se tira a tag', () => {
    expect(normalizarTag('')).toBeNull();
    expect(normalizarTag('   ')).toBeNull();
    expect(normalizarTag(null)).toBeNull();
  });

  it('é cortada no tamanho do banco, sem espaço sobrando na ponta', () => {
    const longa = normalizarTag('a'.repeat(TAG_MAX - 1) + ' bcdef');
    expect(longa).toBe('A'.repeat(TAG_MAX - 1));
    expect(longa!.length).toBeLessThanOrEqual(TAG_MAX);
  });

  it('o limite é o mesmo do check da migration 048', () => {
    const sql = readFileSync('supabase/migrations/048_tag_do_lider.sql', 'utf8');
    expect(sql).toContain(`char_length(tag) between 1 and ${TAG_MAX}`);
  });
});

describe('a tag ao lado do nome', () => {
  it('o Líder mostra a própria tag', () => {
    expect(tagDaPessoa(pessoa({ tier: 'LIDER', tag: 'CENTRO', recruitedBy: null }))).toBe('CENTRO');
  });

  it('a Equipe mostra a tag do Líder dela', () => {
    expect(tagDaPessoa(pessoa({}))).toBe('ZONA NORTE');
  });

  it('a Equipe ignora qualquer tag própria: vale a do Líder', () => {
    expect(tagDaPessoa(pessoa({ tag: 'OUTRA' }))).toBe('ZONA NORTE');
  });

  it('sem tag no Líder, ninguém mostra nada', () => {
    expect(tagDaPessoa(pessoa({ recruitedBy: { ...JOAO, tag: null } }))).toBeNull();
    expect(tagDaPessoa(pessoa({ tier: 'LIDER', recruitedBy: null }))).toBeNull();
  });

  it('a busca da lista acha o Líder e a Equipe pela tag', () => {
    expect(buscarPessoa(pessoa({}), 'zona norte')).toEqual({ achou: true, campos: ['tag'] });
    expect(buscarPessoa(pessoa({ tier: 'LIDER', tag: 'ZONA NORTE', recruitedBy: null }), 'norte').achou).toBe(true);
    expect(buscarPessoa(pessoa({}), 'igreja').achou).toBe(false);
  });
});

describe('o servidor', () => {
  it('só entrega tag própria a quem é Líder', () => {
    const lider = toMember(linha({ recruited_by_role: 'CANDIDATE', tag: 'CENTRO' }), {
      responses: [], photoUrl: null, recruitedBy: null, access: 'ACTIVE', userId: 'u1',
    });
    expect(lider.tag).toBe('CENTRO');

    const equipe = toMember(linha({ recruited_by_role: 'EQUIPE', tag: 'SOBROU' }), {
      responses: [], photoUrl: null, recruitedBy: null, access: 'ACTIVE', userId: 'u2',
    });
    expect(equipe.tag).toBeNull();
  });

  it('leva a tag do Líder no responsável de quem é da Equipe', () => {
    expect(toRecruiter(linha({}), null, 'LIDER', 'ZONA NORTE')?.tag).toBe('ZONA NORTE');
  });

  it('não leva tag quando o responsável não é Líder', () => {
    expect(toRecruiter(linha({}), null, 'EQUIPE', 'ZONA NORTE')?.tag).toBeUndefined();
    expect(
      toRecruiter(linha({ recruited_by_role: 'CANDIDATE' }), null, null, 'ZONA NORTE')?.tag,
    ).toBeUndefined();
  });
});
