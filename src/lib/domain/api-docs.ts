/**
 * Documentacao da API de links de cadastro.
 *
 * A documentacao mora AQUI, e nao em um texto solto dentro da tela, por um
 * motivo pratico: ela e conferida por teste. `tests/api-docs.test.ts` abre
 * cada endereco descrito abaixo, procura o arquivo de rota correspondente e
 * exige que o metodo documentado exista de verdade — documentacao que
 * descreve endpoint inexistente quebra a verificacao antes de chegar ao ar.
 *
 * Modulo comum, sem `server-only`: a tela de Configuracoes desenha a partir
 * daqui, e o teste le o mesmo conteudo.
 *
 * Os exemplos usam identificadores ficticios e nenhum dado de pessoa real.
 */

export const API_VERSION = 'v1';

/** Prefixo de todos os endereços da API. */
export const API_BASE = '/api/v1';

/**
 * Onde a API atende.
 *
 * O sistema tem tres enderecos com papeis diferentes (ver `hosts.ts`): o do
 * ADMIN geral, o `painel.` do time e o dominio publico dos links enviados. A
 * API e do painel — o dominio publico NAO a serve, e uma chamada feita para
 * la e mandada para a saida configurada, sem nunca chegar a API.
 *
 * Ja os links que a API DEVOLVE apontam para o dominio publico: e o endereco
 * que as pessoas recebem por WhatsApp.
 */
export const API_HOST_NOTE =
  'Chame a API no endereço do painel — o mesmo em que você está agora. ' +
  'O domínio público não serve a API: ele só serve os links enviados.';

export interface DocField {
  nome: string;
  tipo: string;
  obrigatorio?: boolean;
  descricao: string;
}

export interface DocErro {
  status: number;
  codigo: string;
  quando: string;
}

export interface DocEndpoint {
  id: string;
  metodo: 'GET' | 'POST' | 'DELETE';
  /** Endereco completo, como aparece na URL. */
  caminho: string;
  titulo: string;
  resumo: string;
  /** Um paragrafo por item. */
  descricao: string[];
  /** Parametros de caminho e de consulta (query). */
  parametros: DocField[];
  /** Campos do corpo JSON. Vazio nos metodos sem corpo. */
  corpo: DocField[];
  /** Exemplo pronto para colar no terminal. */
  requisicao: string;
  respostaStatus: number;
  /** Exemplo de resposta, formatado. */
  resposta: string;
  /** Erros proprios deste endpoint, alem dos gerais. */
  erros: DocErro[];
}

/* -------------------------------------------------------------------------
   Autenticacao
   ------------------------------------------------------------------------- */

export const API_AUTH_HEADER = 'Authorization: Bearer cmd_SUA_CHAVE';

export const API_AUTH_NOTES: readonly string[] = [
  'Toda chamada exige uma chave da API no cabeçalho Authorization. A chave é criada nesta mesma tela e aparece por inteiro uma única vez: o banco guarda apenas o SHA-256 dela.',
  'A chave age em nome do administrador geral que a criou. Se esse acesso for desativado, todas as chaves dele param de funcionar no mesmo instante — não é preciso revogar uma por uma.',
  'A API não cria nem revoga chaves: isso acontece apenas aqui, com sessão de administrador. Uma chave vazada não consegue criar outra.',
  'Sem o cabeçalho Authorization, a sessão do painel também é aceita — é o que permite testar um endpoint direto do navegador, já logado como administrador.',
  'Chame a API do seu servidor, nunca do navegador de quem usa seu sistema: a chave é um segredo, e no navegador ela fica visível para qualquer pessoa. Guarde-a em variável de ambiente, fora do código.',
];

/* -------------------------------------------------------------------------
   Ciclo de vida do link
   ------------------------------------------------------------------------- */

export interface DocEstado {
  estado: string;
  significado: string;
}

export const API_ESTADOS: readonly DocEstado[] = [
  { estado: 'ACTIVE', significado: 'Gerado e ainda não aberto por ninguém.' },
  {
    estado: 'CLAIMED',
    significado: 'Reservado pelo primeiro aparelho que o abriu. Outro aparelho não consegue usá-lo.',
  },
  { estado: 'SUBMITTING', significado: 'Cadastro sendo enviado naquele instante.' },
  { estado: 'CONSUMED', significado: 'Cadastro concluído. O link não recebe outro.' },
  { estado: 'EXPIRED', significado: 'Prazo terminou. A duração é definida em Configurações.' },
  {
    estado: 'REVOKED',
    significado: 'Derrubado — por uma geração nova do mesmo dono ou por DELETE /api/v1/links/{id}.',
  },
];

/* -------------------------------------------------------------------------
   Erros
   ------------------------------------------------------------------------- */

/**
 * Formato unico de erro.
 *
 * `erro.codigo` e estavel e faz parte do contrato desta versao; a mensagem e
 * texto para pessoa e pode melhorar a qualquer momento. Integre pelo codigo.
 */
export const API_ERRO_EXEMPLO = `{
  "erro": {
    "codigo": "nao_autenticado",
    "mensagem": "Chave da API inválida ou revogada."
  },
  "message": "Chave da API inválida ou revogada."
}`;

export const API_ERROS_GERAIS: readonly DocErro[] = [
  {
    status: 401,
    codigo: 'nao_autenticado',
    quando: 'Chave ausente, fora do formato, inválida, revogada ou cujo dono foi desativado.',
  },
  {
    status: 403,
    codigo: 'sem_permissao',
    quando: 'A sessão usada não é a do administrador geral do sistema.',
  },
  { status: 400, codigo: 'dados_invalidos', quando: 'Corpo ou parâmetro fora do formato esperado.' },
  { status: 404, codigo: 'nao_encontrado', quando: 'Time, dono ou link inexistente.' },
  {
    status: 503,
    codigo: 'servico_indisponivel',
    quando: 'Banco fora do ar ou migration pendente. Tente de novo em seguida.',
  },
];

/* -------------------------------------------------------------------------
   Endpoints
   ------------------------------------------------------------------------- */

const LINK_EXEMPLO = `{
  "id": "3f2b9c40-7a1e-4a53-9f0d-2b8c6d5e4a11",
  "url": "https://www.suacampanha.com.br/convite/9tKq2Lm4Xb7vR0aZcE1s",
  "estado": "ACTIVE",
  "ativo": true,
  "time": {
    "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
    "nome": "Equipe Zona Norte"
  },
  "dono": {
    "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
    "nome": "Marina Duarte",
    "perfil": "CANDIDATE"
  },
  "geradoPor": {
    "nome": "Administração",
    "perfil": "ADMIN"
  },
  "geradoEm": "2026-09-13T14:02:51.417Z",
  "expiraEm": "2026-09-14T14:02:51.417Z",
  "geracao": 4,
  "primeiroAcessoEm": null,
  "concluidoEm": null,
  "revogadoEm": null
}`;

/** Indenta um exemplo ja formatado para encaixa-lo dentro de outro. */
function indent(json: string, spaces: number): string {
  const padding = ' '.repeat(spaces);
  return json
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${padding}${line}`))
    .join('\n');
}

export const API_ENDPOINTS: readonly DocEndpoint[] = [
  {
    id: 'gerar-link',
    metodo: 'POST',
    caminho: '/api/v1/links',
    titulo: 'Gerar link de cadastro',
    resumo: 'Cria o endereço que o time envia para as pessoas se cadastrarem.',
    descricao: [
      'É a mesma operação do botão do painel: o link nasce no servidor, com identificador opaco e aleatório, e vale pelo prazo definido em Configurações.',
      'A geração anterior daquele dono deixa de funcionar no mesmo instante. Quem abrir o endereço antigo vê a tela de link indisponível.',
      'O endereço completo volta uma única vez, nesta resposta. Para vê-lo de novo, use GET /api/v1/links — ele permanece disponível enquanto a geração for a corrente.',
      'Quem recebe o cadastro continua sendo o dono do link: o administrador do time fica em "Cadastrado por", e não o administrador geral que chamou a API.',
    ],
    parametros: [],
    corpo: [
      {
        nome: 'timeId',
        tipo: 'string (uuid)',
        obrigatorio: true,
        descricao: 'Time que receberá os cadastros. Use o id devolvido por GET /api/v1/times.',
      },
      {
        nome: 'donoId',
        tipo: 'string (uuid)',
        descricao:
          'Administrador do time dono do link, quando o time tem mais de um. Ausente, vale o administrador ativo mais antigo.',
      },
    ],
    requisicao: `curl -X POST 'https://SEU-PAINEL/api/v1/links' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE' \\
  -H 'Content-Type: application/json' \\
  -d '{"timeId":"b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34"}'`,
    respostaStatus: 201,
    resposta: `{
  "link": ${indent(LINK_EXEMPLO, 2)}
}`,
    erros: [
      {
        status: 404,
        codigo: 'nao_encontrado',
        quando: 'O time não existe, ou ainda não tem nenhum administrador cadastrado.',
      },
      {
        status: 400,
        codigo: 'dados_invalidos',
        quando: 'O donoId informado é de outro time, está desativado ou não tem link pessoal.',
      },
    ],
  },
  {
    id: 'listar-links',
    metodo: 'GET',
    caminho: '/api/v1/links',
    titulo: 'Listar links',
    resumo: 'Links existentes, do mais recente para o mais antigo, com o endereço de cada um.',
    descricao: [
      'O que passou do prazo é marcado como expirado na própria consulta, pelo horário do servidor: a lista nunca mostra como ativo um link vencido.',
      'Sem filtro, devolve os 50 links mais recentes de todos os times.',
    ],
    parametros: [
      { nome: 'time', tipo: 'string (uuid)', descricao: 'Restringe a um time.' },
      {
        nome: 'estado',
        tipo: 'string',
        descricao: 'ACTIVE, CLAIMED, SUBMITTING, CONSUMED, EXPIRED ou REVOKED.',
      },
      { nome: 'limite', tipo: 'inteiro', descricao: 'De 1 a 200. Padrão: 50.' },
    ],
    corpo: [],
    requisicao: `curl 'https://SEU-PAINEL/api/v1/links?time=b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34&estado=ACTIVE' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "links": [
    ${indent(LINK_EXEMPLO, 4)},
    {
      "id": "7d4e1b93-2c58-4a07-b6f1-90ae3c2d5f76",
      "url": "https://www.suacampanha.com.br/convite/Vb8sQ1pN6yTt3LrWfH0d",
      "estado": "CONSUMED",
      "ativo": false,
      "time": {
        "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
        "nome": "Equipe Zona Norte"
      },
      "dono": {
        "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
        "nome": "Marina Duarte",
        "perfil": "CANDIDATE"
      },
      "geradoPor": {
        "nome": "Marina Duarte",
        "perfil": "CANDIDATE"
      },
      "geradoEm": "2026-09-12T11:20:03.902Z",
      "expiraEm": "2026-09-13T11:20:03.902Z",
      "geracao": 3,
      "primeiroAcessoEm": "2026-09-12T11:41:18.220Z",
      "concluidoEm": "2026-09-12T11:46:55.007Z",
      "revogadoEm": null
    }
  ]
}`,
    erros: [],
  },
  {
    id: 'consultar-link',
    metodo: 'GET',
    caminho: '/api/v1/links/{id}',
    titulo: 'Consultar um link',
    resumo: 'Situação de um link: estado, prazo, primeiro acesso e conclusão.',
    descricao: [
      'Serve para acompanhar o que aconteceu com um endereço enviado, sem abrir o painel.',
      'Nenhum dado da pessoa que se cadastrou sai por aqui: nome, telefone, CPF e título ficam no painel, onde o acesso é conferido cadastro a cadastro.',
    ],
    parametros: [
      {
        nome: 'id',
        tipo: 'string (uuid)',
        obrigatorio: true,
        descricao: 'Identificador do link, devolvido na geração e na listagem.',
      },
    ],
    corpo: [],
    requisicao: `curl 'https://SEU-PAINEL/api/v1/links/3f2b9c40-7a1e-4a53-9f0d-2b8c6d5e4a11' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "link": {
    "id": "3f2b9c40-7a1e-4a53-9f0d-2b8c6d5e4a11",
    "url": "https://www.suacampanha.com.br/convite/9tKq2Lm4Xb7vR0aZcE1s",
    "estado": "CLAIMED",
    "ativo": true,
    "time": {
      "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
      "nome": "Equipe Zona Norte"
    },
    "dono": {
      "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
      "nome": "Marina Duarte",
      "perfil": "CANDIDATE"
    },
    "geradoPor": {
      "nome": "Administração",
      "perfil": "ADMIN"
    },
    "geradoEm": "2026-09-13T14:02:51.417Z",
    "expiraEm": "2026-09-14T14:02:51.417Z",
    "geracao": 4,
    "primeiroAcessoEm": "2026-09-13T14:31:09.664Z",
    "concluidoEm": null,
    "revogadoEm": null
  }
}`,
    erros: [{ status: 404, codigo: 'nao_encontrado', quando: 'Nenhum link com esse id.' }],
  },
  {
    id: 'revogar-link',
    metodo: 'DELETE',
    caminho: '/api/v1/links/{id}',
    titulo: 'Revogar link',
    resumo: 'Derruba um link já enviado, na hora, sem colocar outro no lugar.',
    descricao: [
      'É o que fazer quando o endereço foi para a pessoa errada: quem abrir vê a tela de link indisponível, e nenhum cadastro entra por ele.',
      'Repetir a chamada devolve o mesmo resultado e não duplica nada no histórico.',
      'Link já usado para um cadastro não é revogado: o cadastro existe, e apagar o estado final falsificaria o histórico. Nesse caso a resposta é 409.',
    ],
    parametros: [
      {
        nome: 'id',
        tipo: 'string (uuid)',
        obrigatorio: true,
        descricao: 'Identificador do link a derrubar.',
      },
    ],
    corpo: [],
    requisicao: `curl -X DELETE 'https://SEU-PAINEL/api/v1/links/3f2b9c40-7a1e-4a53-9f0d-2b8c6d5e4a11' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "link": {
    "id": "3f2b9c40-7a1e-4a53-9f0d-2b8c6d5e4a11",
    "url": "https://www.suacampanha.com.br/convite/9tKq2Lm4Xb7vR0aZcE1s",
    "estado": "REVOKED",
    "ativo": false,
    "time": {
      "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
      "nome": "Equipe Zona Norte"
    },
    "dono": {
      "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
      "nome": "Marina Duarte",
      "perfil": "CANDIDATE"
    },
    "geradoPor": {
      "nome": "Administração",
      "perfil": "ADMIN"
    },
    "geradoEm": "2026-09-13T14:02:51.417Z",
    "expiraEm": "2026-09-14T14:02:51.417Z",
    "geracao": 4,
    "primeiroAcessoEm": "2026-09-13T14:31:09.664Z",
    "concluidoEm": null,
    "revogadoEm": "2026-09-13T15:07:44.881Z"
  }
}`,
    erros: [
      { status: 404, codigo: 'nao_encontrado', quando: 'Nenhum link com esse id.' },
      {
        status: 409,
        codigo: 'conflito',
        quando: 'O link já foi usado para um cadastro. Gere um novo em vez de revogar este.',
      },
    ],
  },
  {
    id: 'listar-times',
    metodo: 'GET',
    caminho: '/api/v1/times',
    titulo: 'Listar times',
    resumo: 'Times e seus administradores ativos — os identificadores usados ao gerar um link.',
    descricao: [
      'É por aqui que o programa descobre o timeId (e, quando necessário, o donoId) antes de pedir um link.',
      'Só administradores ativos aparecem: gerar link em nome de um acesso desativado é recusado pelo banco.',
      'Nenhum dado de pessoa cadastrada sai daqui — apenas nome do time, identificadores e a chave de recrutamento.',
    ],
    parametros: [],
    corpo: [],
    requisicao: `curl 'https://SEU-PAINEL/api/v1/times' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "times": [
    {
      "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
      "nome": "Equipe Zona Norte",
      "recrutamentoAtivo": true,
      "criadoEm": "2026-02-11T13:45:02.118Z",
      "administradores": [
        {
          "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
          "nome": "Marina Duarte"
        }
      ]
    },
    {
      "id": "0a5d3c71-6e92-4b18-9c44-5f7b2e8a1d09",
      "nome": "Equipe Centro",
      "recrutamentoAtivo": false,
      "criadoEm": "2026-03-02T09:12:40.556Z",
      "administradores": []
    }
  ]
}`,
    erros: [],
  },
];

/**
 * Avisos que valem para a API inteira.
 *
 * Sao regras do sistema, e nao conselhos: quem integra precisa saber disso
 * antes de escrever a primeira linha.
 */
export const API_REGRAS: readonly string[] = [
  'O prazo dos links é o configurado em "Expiração dos links", nesta mesma tela. A API não escolhe duração.',
  'Com o recrutamento do time desligado, o link continua sendo gerado, mas nasce sem aceitar cadastro: o campo "ativo" vem falso.',
  'Cada dono tem um único link. Gerar de novo renova o mesmo link e derruba o endereço anterior — não existe acumular endereços válidos para a mesma pessoa.',
  'Todo link gerado pela API aparece no rastreamento desta tela, com o administrador da chave registrado como quem gerou.',
  'As respostas não trazem token em separado, hash, segredo de reserva, CPF, título de eleitor nem retorno de consulta cadastral.',
];
