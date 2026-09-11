import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_COLOR_CLASSES,
  RELATIONSHIP_ICONS,
  defaultRelationshipOptions,
  isRelationshipColor,
  isRelationshipIcon,
  relationshipColor,
  relationshipIcon,
  relationshipLabel,
} from '@/lib/domain/relationship';
import { createSystemFields } from '@/lib/domain/form-config';

/**
 * O identificador da opção é estável. Renomear precisa refletir em todos os
 * cadastros, e excluir não pode apagar o que já foi escolhido.
 */

const OPCOES = defaultRelationshipOptions();

describe('opções iniciais do vínculo', () => {
  it('traz família, amigo e conhecido com ícone e cor', () => {
    expect(OPCOES.map((opcao) => [opcao.label, opcao.icon, opcao.color])).toEqual([
      ['Família', 'heart', 'rose'],
      ['Amigo(a)', 'smile', 'green'],
      ['Conhecido', 'handshake', 'orange'],
    ]);
  });

  it('usa identificadores estáveis e distintos', () => {
    const ids = OPCOES.map((opcao) => opcao.id);
    expect(ids).toEqual(['familia', 'amigo', 'conhecido']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('entra como campo padrão visível e opcional', () => {
    const campo = createSystemFields().find((field) => field.systemKey === 'relationship');

    expect(campo).toBeDefined();
    expect(campo?.label).toBe('Vínculo');
    expect(campo?.enabled).toBe(true);
    expect(campo?.required).toBe(false);
    expect(campo?.options).toHaveLength(3);
  });
});

describe('nome exibido', () => {
  it('renomear a opção reflete nos cadastros existentes', () => {
    const renomeadas = OPCOES.map((opcao) =>
      opcao.id === 'familia' ? { ...opcao, label: 'Familiar' } : opcao,
    );

    // O cadastro guardou "Família", mas a opção ainda existe: vale o nome atual.
    expect(relationshipLabel(renomeadas, 'familia', 'Família')).toBe('Familiar');
  });

  it('excluir a opção preserva o nome registrado no histórico', () => {
    const semFamilia = OPCOES.filter((opcao) => opcao.id !== 'familia');

    expect(relationshipLabel(semFamilia, 'familia', 'Família')).toBe('Família');
  });

  it('sem escolha, não há nome', () => {
    expect(relationshipLabel(OPCOES, null, null)).toBeNull();
  });

  it('sem opção e sem histórico, devolve o identificador', () => {
    expect(relationshipLabel([], 'sumiu', null)).toBe('sumiu');
  });
});

describe('ícones e cores', () => {
  it('reconhece apenas os valores do catálogo', () => {
    expect(isRelationshipIcon('heart')).toBe(true);
    expect(isRelationshipIcon('foguete')).toBe(false);
    expect(isRelationshipColor('rose')).toBe(true);
    expect(isRelationshipColor('neon')).toBe(false);
  });

  it('tem classe de cor para cada cor do catálogo', () => {
    for (const cor of RELATIONSHIP_COLORS) {
      expect(RELATIONSHIP_COLOR_CLASSES[cor]).toBeTruthy();
    }
    expect(RELATIONSHIP_ICONS.length).toBeGreaterThanOrEqual(3);
  });

  it('cai para um padrão quando o valor guardado não é reconhecido', () => {
    const estranha = { id: 'x', label: 'X', icon: 'foguete', color: 'neon' };

    expect(relationshipColor(estranha)).toBe('rose');
    expect(relationshipIcon(estranha)).toBeTruthy();
  });
});
