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
  it('sem variável nenhuma, o painel é o subdomínio painel.', () => {
    // A versao anterior dependia SO da variavel, lida no Edge na hora do
    // build: esquecer de configura-la deixava a tela de login aberta no
    // endereco publico, sem nada avisar. O caminho comum passa a funcionar
    // sem configuracao.
    delete process.env.CMD_PANEL_HOST;

    expect(isPanelHost('painel.convitetimebezerra.com')).toBe(true);

    expect(isPanelHost('convitetimebezerra.com')).toBe(false);
    expect(isPanelHost('www.convitetimebezerra.com')).toBe(false);
    expect(isPanelHost('outro.convitetimebezerra.com')).toBe(false);
    expect(isPanelHost(null)).toBe(false);
  });

  it('desenvolvimento e prévia continuam servindo tudo', () => {
    // Nao sao o dominio publico de ninguem: e onde se testa. Trancar o login
    // aqui deixaria sem entrada quem desenvolve ou revisa uma previa.
    delete process.env.CMD_PANEL_HOST;

    expect(isPanelHost('localhost:3000')).toBe(true);
    expect(isPanelHost('127.0.0.1:3000')).toBe(true);
    expect(isPanelHost('cmd-git-branch-conta.vercel.app')).toBe(true);
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

  it('a variável manda quando o painel não é o subdomínio padrão', () => {
    process.env.CMD_PANEL_HOST = 'admin.convitetimebezerra.com';

    expect(isPanelHost('admin.convitetimebezerra.com')).toBe(true);
    // Configurada, ela decide sozinha: nem o subdominio da convencao passa.
    expect(isPanelHost('painel.convitetimebezerra.com')).toBe(false);
    expect(isPanelHost('www.convitetimebezerra.com')).toBe(false);
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
