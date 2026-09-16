import { describe, expect, it } from 'vitest';
import { DEFAULT_INVITE_BANNER, inviteBannerSrc } from '@/lib/domain/invite-banner';

/**
 * Qual banner o celular mostra.
 *
 * A regra existe porque havia UM banner para o sistema inteiro, com o
 * endereco escrito dentro do componente. Com um Time DEMO na mesma tela, a
 * demonstracao passou a exibir o banner de producao de um cliente real.
 */

const ASSINADA = 'https://exemplo.supabase.co/storage/v1/object/sign/cmd-media/banners/x.png?t=1';

describe('banner do celular', () => {
  it('usa o banner do próprio time quando ele existe', () => {
    expect(inviteBannerSrc({ banner: ASSINADA, isDemo: false })).toBe(ASSINADA);
    // Inclusive no Time DEMO: foi para isso que o upload existe.
    expect(inviteBannerSrc({ banner: ASSINADA, isDemo: true })).toBe(ASSINADA);
  });

  it('não empresta o banner de produção para um Time DEMO', () => {
    // Sem banner próprio, o DEMO fica SEM banner — a tela cai na faixa de
    // convite comum. Usar a arte de um cliente real numa demonstração é pior
    // do que não ter banner nenhum.
    expect(inviteBannerSrc({ banner: null, isDemo: true })).toBeNull();
  });

  it('mantém o banner padrão em todo time real, como sempre foi', () => {
    expect(inviteBannerSrc({ banner: null, isDemo: false })).toBe(DEFAULT_INVITE_BANNER);
  });
});
