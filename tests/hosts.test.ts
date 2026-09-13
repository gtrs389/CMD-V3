import { afterEach, describe, expect, it } from 'vitest';
import {
  isAdminHost,
  isPanelHost,
  isPublicEntryPath,
  isPublicPath,
  publicHostFrom,
} from '@/lib/domain/hosts';

/**
 * A separacao entre o painel e o dominio publico e uma regra de seguranca:
 * um engano aqui expoe a tela de login no endereco que milhares de pessoas
 * recebem por WhatsApp, ou derruba o formulario de cadastro no endereco
 * certo. Por isso ela tem teste proprio.
 */

const ORIGINAL = process.env.CMD_PANEL_HOST;
const ORIGINAL_ADMIN = process.env.CMD_ADMIN_HOST;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CMD_PANEL_HOST;
  else process.env.CMD_PANEL_HOST = ORIGINAL;

  if (ORIGINAL_ADMIN === undefined) delete process.env.CMD_ADMIN_HOST;
  else process.env.CMD_ADMIN_HOST = ORIGINAL_ADMIN;
});

/** O endereco exclusivo do ADMIN geral, como ele existe em producao. */
const ADMIN_HOST = '7061696e656c2061646d.convitetimebezerra.com';

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


describe('endereço exclusivo do ADMIN geral', () => {
  it('é reconhecido sem precisar de variável', () => {
    delete process.env.CMD_ADMIN_HOST;
    delete process.env.CMD_PANEL_HOST;

    expect(isAdminHost(ADMIN_HOST)).toBe(true);
    expect(isAdminHost(`${ADMIN_HOST}:443`)).toBe(true);
    expect(isAdminHost(ADMIN_HOST.toUpperCase())).toBe(true);

    expect(isAdminHost('painel.convitetimebezerra.com')).toBe(false);
    expect(isAdminHost('www.convitetimebezerra.com')).toBe(false);
    expect(isAdminHost('convitetimebezerra.com')).toBe(false);
    expect(isAdminHost(null)).toBe(false);
  });

  it('serve o painel, inclusive com CMD_PANEL_HOST apontando para outro', () => {
    // Sem isso, configurar o endereco do painel jogaria o endereco do ADMIN
    // no dominio publico: o proprio ADMIN cairia na tela de saida.
    process.env.CMD_PANEL_HOST = 'painel.convitetimebezerra.com';

    expect(isPanelHost(ADMIN_HOST)).toBe(true);
    expect(isPanelHost('painel.convitetimebezerra.com')).toBe(true);
    expect(isPanelHost('www.convitetimebezerra.com')).toBe(false);
  });

  it('a variável manda quando o subdomínio é outro', () => {
    process.env.CMD_ADMIN_HOST = 'cofre.convitetimebezerra.com';

    expect(isAdminHost('cofre.convitetimebezerra.com')).toBe(true);
    expect(isAdminHost(ADMIN_HOST)).toBe(false);
  });

  it('desenvolvimento e prévia não são endereço exclusivo', () => {
    // Tratar localhost como exclusivo do ADMIN trancaria o ambiente de teste
    // para todos os outros perfis.
    delete process.env.CMD_ADMIN_HOST;

    expect(isAdminHost('localhost:3000')).toBe(false);
    expect(isAdminHost('cmd-git-branch-conta.vercel.app')).toBe(false);
    expect(isPanelHost('localhost:3000')).toBe(true);
  });
});

describe('o que o endereço do ADMIN não serve', () => {
  it('recusa as portas de entrada dos links enviados', () => {
    expect(isPublicEntryPath('/convite/abc123')).toBe(true);
    expect(isPublicEntryPath('/questionario/abc123')).toBe(true);
    expect(isPublicEntryPath('/acesso/time/abc123')).toBe(true);
    expect(isPublicEntryPath('/api/public/convite')).toBe(true);
    expect(isPublicEntryPath('/api/acesso-time')).toBe(true);
  });

  it('não recusa o que o próprio painel do ADMIN usa', () => {
    // O ADMIN cadastra alguem a mao pelo painel, e o campo de endereco
    // depende destas listas.
    expect(isPublicEntryPath('/api/localidades/estados')).toBe(false);
    expect(isPublicEntryPath('/api/localidades/municipios/SP')).toBe(false);
    expect(isPublicEntryPath('/saida')).toBe(false);
    expect(isPublicEntryPath('/')).toBe(false);
    expect(isPublicEntryPath('/dashboard')).toBe(false);
    expect(isPublicEntryPath('/api/members')).toBe(false);
  });
});

describe('endereço público deduzido do painel', () => {
  it('o link gerado no endereço do ADMIN sai com o domínio público', () => {
    // Sem isso, cada convite enviado por WhatsApp divulgaria justamente o
    // endereco que existe para nao ser conhecido.
    delete process.env.CMD_ADMIN_HOST;
    delete process.env.CMD_PANEL_HOST;

    expect(publicHostFrom(ADMIN_HOST)).toBe('www.convitetimebezerra.com');
    expect(publicHostFrom('painel.convitetimebezerra.com')).toBe('www.convitetimebezerra.com');
  });

  it('não deduz nada onde não há painel para trocar', () => {
    delete process.env.CMD_ADMIN_HOST;
    delete process.env.CMD_PANEL_HOST;

    expect(publicHostFrom('www.convitetimebezerra.com')).toBe(null);
    expect(publicHostFrom('convitetimebezerra.com')).toBe(null);
    expect(publicHostFrom('localhost:3000')).toBe(null);
    expect(publicHostFrom(null)).toBe(null);
  });
});
