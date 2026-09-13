import { afterEach, describe, expect, it } from 'vitest';
import { isPanelHost, isPublicPath } from '@/lib/domain/hosts';

/**
 * A separacao entre o painel e o dominio publico e uma regra de seguranca:
 * um engano aqui expoe a tela de login no endereco que milhares de pessoas
 * recebem por WhatsApp, ou derruba o formulario de cadastro no endereco
 * certo. Por isso ela tem teste proprio.
 */

const ORIGINAL = process.env.CMD_PANEL_HOST;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CMD_PANEL_HOST;
  else process.env.CMD_PANEL_HOST = ORIGINAL;
});

describe('endereço do painel', () => {
  it('sem configuração, todo endereço continua servindo tudo', () => {
    // Proposital: uma instalacao que ainda nao separou os dominios nao pode
    // perder o proprio login por causa de uma variavel ausente.
    delete process.env.CMD_PANEL_HOST;

    expect(isPanelHost('convitetimebezerra.com')).toBe(true);
    expect(isPanelHost('qualquer.coisa')).toBe(true);
    expect(isPanelHost(null)).toBe(true);
  });

  it('reconhece o painel e recusa o domínio público', () => {
    process.env.CMD_PANEL_HOST = 'painel.convitetimebezerra.com';

    expect(isPanelHost('painel.convitetimebezerra.com')).toBe(true);
    // Porta, maiuscula e ponto final do FQDN nao mudam o endereco.
    expect(isPanelHost('PAINEL.ConviteTimeBezerra.com:443')).toBe(true);
    expect(isPanelHost('painel.convitetimebezerra.com.')).toBe(true);

    expect(isPanelHost('convitetimebezerra.com')).toBe(false);
    expect(isPanelHost('www.convitetimebezerra.com')).toBe(false);
    expect(isPanelHost('outro.convitetimebezerra.com')).toBe(false);
    expect(isPanelHost(null)).toBe(false);
  });

  it('trata www e o domínio raiz como o mesmo endereço', () => {
    process.env.CMD_PANEL_HOST = 'painel.convitetimebezerra.com';
    expect(isPanelHost('www.painel.convitetimebezerra.com')).toBe(true);
  });
});

describe('caminhos do domínio público', () => {
  it('deixa passar as portas de entrada dos links enviados', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/convite/abc123')).toBe(true);
    expect(isPublicPath('/questionario/abc123')).toBe(true);
    expect(isPublicPath('/acesso/time/abc123')).toBe(true);
    expect(isPublicPath('/api/public/convite')).toBe(true);
    expect(isPublicPath('/api/public/questionario/resposta')).toBe(true);
    expect(isPublicPath('/api/acesso-time')).toBe(true);
    // O endereco do formulario publico depende destas listas: bloquea-las
    // deixava estado, municipio, bairro e rua vazios justamente no dominio
    // que serve os links enviados.
    expect(isPublicPath('/api/localidades/estados')).toBe(true);
    expect(isPublicPath('/api/localidades/municipios/SP')).toBe(true);
    expect(isPublicPath('/saida')).toBe(true);
  });

  it('não deixa passar nada do painel', () => {
    expect(isPublicPath('/login')).toBe(false);
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/candidatos/abc')).toBe(false);
    expect(isPublicPath('/configuracoes')).toBe(false);
    expect(isPublicPath('/primeiro-acesso')).toBe(false);
    expect(isPublicPath('/minha-mobilizacao')).toBe(false);
    expect(isPublicPath('/api/members')).toBe(false);
    expect(isPublicPath('/api/clients/abc/questionario')).toBe(false);
    expect(isPublicPath('/api/auth/login')).toBe(false);
    expect(isPublicPath('/api/configuracoes/acesso')).toBe(false);
  });
});
