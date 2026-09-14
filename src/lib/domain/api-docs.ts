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
  /** Campos do corpo JSON. Vazio em toda a API: nada e escolhido por fora. */
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
   Como a identidade funciona
   ------------------------------------------------------------------------- */

export const API_AUTH_HEADER = 'Authorization: Bearer cmd_SUA_CHAVE';

/**
 * A regra que organiza tudo o mais: a chave DIZ quem e.
 *
 * Sem isso, alguem lendo a documentacao procuraria onde informar o time e o
 * dono — e a resposta e que nao existe esse lugar, de proposito.
 */
export const API_IDENTIDADE =
  'Cada chave pertence a um único administrador de um único time, escolhidos na criação. ' +
  'O link sai sempre em nome dessa pessoa: a requisição não informa dono nem time, e não há ' +
  'como uma chave alcançar outro administrador.';

export const API_AUTH_NOTES: readonly string[] = [
  'Toda chamada exige a chave no cabeçalho Authorization. Só a administração geral cria chaves, e cada uma aparece por inteiro uma única vez: o banco guarda apenas o SHA-256 dela.',
  'A sessão do painel NÃO substitui a chave nas rotas /api/v1. Você administra e testa as chaves por esta tela; as chamadas da API usam a chave vinculada.',
  'A cada chamada o servidor reconfere o vínculo inteiro: chave não revogada, administração geral ativa, administrador do time ativo, com perfil de administrador do time, ainda ligado ao mesmo time, e o time ainda existindo. Qualquer falha derruba a chave na hora.',
  'Toda recusa responde 401 com a mesma frase, sem dizer qual conferência falhou. O motivo real fica registrado em "Ver atividade", visível só para a administração geral.',
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
    "mensagem": "Chave da API inválida ou sem permissão."
  },
  "message": "Chave da API inválida ou sem permissão."
}`;

/** Recusa de campo no corpo: o erro que aparece a quem ainda manda `donoId`. */
export const API_ERRO_CORPO = `{
  "erro": {
    "codigo": "dados_invalidos",
    "mensagem": "Esta requisição não recebe campos: o dono e o time do link vêm da chave. Remova donoId e timeId do corpo."
  },
  "message": "Esta requisição não recebe campos: o dono e o time do link vêm da chave. Remova donoId e timeId do corpo."
}`;

export const API_ERROS_GERAIS: readonly DocErro[] = [
  {
    status: 401,
    codigo: 'nao_autenticado',
    quando:
      'Chave ausente, fora do formato, inválida, revogada, sem vínculo, ou com administrador, administração geral ou time que deixaram de valer.',
  },
  {
    status: 400,
    codigo: 'dados_invalidos',
    quando: 'Corpo com campos (a identidade vem da chave) ou parâmetro fora do formato.',
  },
  {
    status: 404,
    codigo: 'nao_encontrado',
    quando: 'Link inexistente — ou de outro administrador, que para esta chave é o mesmo que não existir.',
  },
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
    "nome": "Time Bezerra"
  },
  "dono": {
    "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
    "nome": "João Silva",
    "perfil": "CANDIDATE"
  },
  "geradoPor": {
    "nome": "João Silva",
    "perfil": "CANDIDATE"
  },
  "geradoEm": "2026-09-14T14:02:51.417Z",
  "expiraEm": "2026-09-15T14:02:51.417Z",
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
    resumo: 'Cria o link do administrador vinculado à chave. Sem corpo, sem parâmetros.',
    descricao: [
      'O link nasce COMO SE o administrador vinculado tivesse entrado no painel e clicado em "Gerar link". Não é uma imitação: é a mesma operação, no mesmo servidor, com o mesmo identificador opaco e aleatório.',
      'Não há nada a escolher. Dono, time e prazo vêm do vínculo da chave, conferido no banco a cada chamada. Se o corpo trouxer donoId ou timeId, a requisição é recusada com 400 — a identidade não pode vir de fora.',
      'O rastreamento sai idêntico ao de um clique: o administrador do time aparece como dono E como quem gerou, com data e hora do servidor, e o prazo aplicado é o do perfil dele, definido em Configurações. Não há como distinguir, no histórico do link, um link gerado aqui de um gerado no painel.',
      'Que a ação veio da API fica registrado do outro lado: em "Chaves da API", no botão Ver atividade, com a chave, a administração geral responsável, o time e o resultado.',
      'A geração anterior daquele administrador deixa de funcionar no mesmo instante. Quem abrir o endereço antigo vê a tela de link indisponível.',
      'O endereço completo volta uma única vez, nesta resposta. Para vê-lo de novo, use GET /api/v1/links — ele permanece disponível enquanto a geração for a corrente.',
    ],
    parametros: [],
    corpo: [],
    requisicao: `curl -X POST 'https://SEU-PAINEL/api/v1/links' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 201,
    resposta: `{
  "link": ${indent(LINK_EXEMPLO, 2)}
}`,
    erros: [
      {
        status: 400,
        codigo: 'dados_invalidos',
        quando: 'O corpo trouxe campos (donoId, timeId ou qualquer outro). Envie a requisição sem corpo.',
      },
      {
        status: 404,
        codigo: 'nao_encontrado',
        quando: 'O time do vínculo foi removido enquanto a requisição acontecia.',
      },
    ],
  },
  {
    id: 'listar-links',
    metodo: 'GET',
    caminho: '/api/v1/links',
    titulo: 'Listar links',
    resumo: 'O link atual do administrador vinculado, com o endereço pronto para enviar.',
    descricao: [
      'A lista é recortada pelo vínculo da chave, no próprio banco: link de outro administrador ou de outro time nunca aparece aqui.',
      'Como cada pessoa tem um único convite, a lista traz o link atual daquele administrador — e fica vazia enquanto ele nunca teve um.',
      'O que passou do prazo é marcado como expirado na própria consulta, pelo horário do servidor: a lista nunca mostra como ativo um link vencido.',
    ],
    parametros: [],
    corpo: [],
    requisicao: `curl 'https://SEU-PAINEL/api/v1/links' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "links": [
    ${indent(LINK_EXEMPLO, 4)}
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
      'Só alcança link do administrador vinculado à chave. Link de outra pessoa responde 404 — a chave não chega nem a saber que ele existe.',
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
      "nome": "Time Bezerra"
    },
    "dono": {
      "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
      "nome": "João Silva",
      "perfil": "CANDIDATE"
    },
    "geradoPor": {
      "nome": "João Silva",
      "perfil": "CANDIDATE"
    },
    "geradoEm": "2026-09-14T14:02:51.417Z",
    "expiraEm": "2026-09-15T14:02:51.417Z",
    "geracao": 4,
    "primeiroAcessoEm": "2026-09-14T14:31:09.664Z",
    "concluidoEm": null,
    "revogadoEm": null
  }
}`,
    erros: [
      {
        status: 404,
        codigo: 'nao_encontrado',
        quando: 'Nenhum link com esse id para o administrador vinculado a esta chave.',
      },
    ],
  },
  {
    id: 'revogar-link',
    metodo: 'DELETE',
    caminho: '/api/v1/links/{id}',
    titulo: 'Revogar link',
    resumo: 'Derruba um link já enviado, na hora, sem colocar outro no lugar.',
    descricao: [
      'É o que fazer quando o endereço foi para a pessoa errada: quem abrir vê a tela de link indisponível, e nenhum cadastro entra por ele.',
      'Só alcança link do administrador vinculado à chave.',
      'Repetir a chamada devolve o mesmo resultado e não duplica nada no histórico.',
      'Diferente da geração, a revogação consta no histórico como ação da administração: não existe esse botão no painel, então não há clique a reproduzir.',
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
      "nome": "Time Bezerra"
    },
    "dono": {
      "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
      "nome": "João Silva",
      "perfil": "CANDIDATE"
    },
    "geradoPor": {
      "nome": "João Silva",
      "perfil": "CANDIDATE"
    },
    "geradoEm": "2026-09-14T14:02:51.417Z",
    "expiraEm": "2026-09-15T14:02:51.417Z",
    "geracao": 4,
    "primeiroAcessoEm": "2026-09-14T14:31:09.664Z",
    "concluidoEm": null,
    "revogadoEm": "2026-09-14T15:07:44.881Z"
  }
}`,
    erros: [
      {
        status: 404,
        codigo: 'nao_encontrado',
        quando: 'Nenhum link com esse id para o administrador vinculado a esta chave.',
      },
      {
        status: 409,
        codigo: 'conflito',
        quando: 'O link já foi usado para um cadastro. Gere um novo em vez de revogar este.',
      },
    ],
  },
  {
    id: 'consultar-vinculo',
    metodo: 'GET',
    caminho: '/api/v1/vinculo',
    titulo: 'Consultar o vínculo da chave',
    resumo: 'Diz a quem esta chave pertence: o time e o administrador.',
    descricao: [
      'Use na configuração da integração, para confirmar sem adivinhar em nome de quem os links vão sair.',
      'Se o nome que volta aqui não é o esperado, a chave configurada no seu sistema é outra.',
      '"recrutamentoAtivo" falso significa que o time está com o recrutamento desligado: o link continua sendo gerado, mas nasce sem aceitar cadastro (campo "ativo" falso no link).',
    ],
    parametros: [],
    corpo: [],
    requisicao: `curl 'https://SEU-PAINEL/api/v1/vinculo' \\
  -H 'Authorization: Bearer cmd_SUA_CHAVE'`,
    respostaStatus: 200,
    resposta: `{
  "time": {
    "id": "b21f8e66-4c3a-4f19-8d77-1a9e0c5b2d34",
    "nome": "Time Bezerra",
    "recrutamentoAtivo": true
  },
  "administrador": {
    "id": "5c7d1a08-93b4-4e62-a0f5-77c2e9d31b48",
    "nome": "João Silva",
    "perfil": "CANDIDATE"
  },
  "chave": {
    "nome": "Integração CRM"
  }
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
  'Somente a administração geral cria, vê e revoga chaves. O administrador do time não cria chave, não vê chave e não escolhe em nome de quem a API atua.',
  'Cada chave pertence a um administrador de um time, escolhidos na criação. O vínculo não muda: para trocar o administrador, revogue a chave e crie outra.',
  'Nenhum endpoint recebe donoId ou timeId. A identidade vem da chave, e o servidor a reconfere no banco a cada chamada.',
  'O prazo dos links é o configurado em "Expiração dos links", nesta mesma tela. A API não escolhe duração.',
  'Com o recrutamento do time desligado, o link continua sendo gerado, mas nasce sem aceitar cadastro: o campo "ativo" vem falso.',
  'Cada administrador tem um único link. Gerar de novo renova o mesmo link e derruba o endereço anterior — não existe acumular endereços válidos para a mesma pessoa.',
  'Todo link gerado pela API aparece no rastreamento desta tela como se tivesse sido gerado no painel pelo próprio administrador do time — mesmo dono, mesmo gerador, mesma data e hora do servidor.',
  'O registro de que a ação partiu da API fica em "Chaves da API", no botão Ver atividade: qual chave, sob qual administração geral, em nome de quem, qual operação, qual resultado e quando. Chamadas recusadas também entram, com o motivo.',
  'As respostas não trazem token em separado, hash, segredo de reserva, CPF, título de eleitor nem retorno de consulta cadastral.',
];
