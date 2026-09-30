import { deflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Planilha do Google Sheets no time duplicado (migration 052).
 *
 * Conferido aqui:
 *   - o .xlsx que o Google exporta e lido aba por aba (o arquivo e montado
 *     no proprio teste, byte a byte);
 *   - cada aba acha o Lider pelo nome, sem maiuscula nem acento; se nao
 *     achar, tenta a coluna LIDER; se nem assim, cria o Lider com o nome
 *     completo da coluna LIDER;
 *   - ligada, a Equipe do banco da copia fica escondida; desligada, o que
 *     veio da planilha fica escondido; no oficial, nada muda;
 *   - a leitura so apaga o que veio da planilha DESTA copia, e nunca toca o
 *     time oficial.
 */

/* -------------------------------------------------------------------------
   Um .xlsx de verdade, montado aqui
   ------------------------------------------------------------------------- */

function zip(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let posicao = 0;

  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const dados = deflateRawSync(Buffer.from(conteudo, 'utf8'));
    const tamanho = Buffer.byteLength(conteudo, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(tamanho, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(tamanho, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(posicao, 42);
    centrais.push(central, nomeBuf);

    posicao += 30 + nomeBuf.length + dados.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const esc = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Abas com linhas; texto vai para sharedStrings, numero vai como numero. */
function xlsx(abas: { nome: string; linhas: (string | number)[][]; oculta?: boolean }[]): Buffer {
  const compartilhados: string[] = [];
  const indice = (texto: string) => {
    const achado = compartilhados.indexOf(texto);
    if (achado !== -1) return achado;
    compartilhados.push(texto);
    return compartilhados.length - 1;
  };
  const letra = (i: number) => String.fromCharCode(65 + i);

  const arquivos: Record<string, string> = {};
  abas.forEach((aba, n) => {
    const linhas = aba.linhas
      .map(
        (linha, r) =>
          `<row r="${r + 1}">` +
          linha
            .map((valor, c) =>
              valor === ''
                ? ''
                : typeof valor === 'number'
                  ? `<c r="${letra(c)}${r + 1}"><v>${valor}</v></c>`
                  : `<c r="${letra(c)}${r + 1}" t="s"><v>${indice(valor)}</v></c>`,
            )
            .join('') +
          '</row>',
      )
      .join('');
    arquivos[`xl/worksheets/sheet${n + 1}.xml`] =
      `<?xml version="1.0"?><worksheet><sheetData>${linhas}</sheetData></worksheet>`;
  });

  arquivos['xl/workbook.xml'] =
    '<?xml version="1.0"?><workbook xmlns:r="r"><sheets>' +
    abas
      .map(
        (aba, n) =>
          `<sheet name="${esc(aba.nome)}" sheetId="${n + 1}"${aba.oculta ? ' state="hidden"' : ''} r:id="rId${n + 1}"/>`,
      )
      .join('') +
    '</sheets></workbook>';
  arquivos['xl/_rels/workbook.xml.rels'] =
    '<?xml version="1.0"?><Relationships>' +
    abas
      .map((_, n) => `<Relationship Id="rId${n + 1}" Type="ws" Target="worksheets/sheet${n + 1}.xml"/>`)
      .join('') +
    '</Relationships>';
  arquivos['xl/sharedStrings.xml'] =
    '<?xml version="1.0"?><sst>' + compartilhados.map((t) => `<si><t>${esc(t)}</t></si>`).join('') + '</sst>';

  return zip(arquivos);
}

const CABECALHO = ['NOME', 'TITULO', 'ZONA', 'SEÇÃO', 'TELEFONE', 'LÍDER', 'REFERÊNCIA', 'VERIFICADO POR FOTO'];

/* -------------------------------------------------------------------------
   Banco em memoria
   ------------------------------------------------------------------------- */

type Row = Record<string, unknown>;
const db = new Map<string, Row[]>();
const tabela = (nome: string) => {
  if (!db.has(nome)) db.set(nome, []);
  return db.get(nome)!;
};

function lista(valor: string): string[] {
  return valor
    .slice(valor.indexOf('(') + 1, -1)
    .split(',')
    .map((item) => item.replace(/^"|"$/g, ''));
}

function casa(row: Row, filtros: Record<string, string> = {}): boolean {
  return Object.entries(filtros).every(([chave, valor]) => {
    if (chave === 'or') {
      // `(coluna.op.valor,...)`: basta uma parte valer.
      return lista(valor).some((parte) => {
        const [coluna, op, alvo] = parte.split('.');
        if (op === 'is') return alvo === 'null' ? row[coluna] == null : row[coluna] === (alvo === 'true');
        if (op === 'eq') return String(row[coluna]) === alvo;
        if (op === 'neq') return row[coluna] != null && String(row[coluna]) !== alvo;
        throw new Error(`or nao suportado: ${parte}`);
      });
    }
    if (valor.startsWith('not.in.')) return !lista(valor).includes(String(row[chave]));
    if (valor === 'is.true') return row[chave] === true;
    if (valor === 'is.false') return row[chave] !== true;
    if (valor === 'is.null') return row[chave] == null;
    if (valor.startsWith('eq.')) return String(row[chave]) === valor.slice(3);
    if (valor.startsWith('in.')) return lista(valor).includes(String(row[chave]));
    throw new Error(`filtro nao suportado: ${chave}=${valor}`);
  });
}

/** Toda escrita que chegar ao banco. A leitura da planilha nao pode gerar nenhuma. */
const escritas: { operacao: string; tabela: string; valores?: unknown }[] = [];

vi.mock('@/lib/supabase/rest', async () => {
  const real = await vi.importActual<typeof import('@/lib/supabase/rest')>('@/lib/supabase/rest');
  const selecionar = (t: string, o: { filters?: Record<string, string> } = {}) =>
    tabela(t).filter((row) => casa(row, o.filters)).map((row) => ({ ...row }));
  const registrar = (operacao: string) => async (t: string, ...resto: unknown[]) => {
    escritas.push({ operacao, tabela: t, valores: resto });
    if (operacao === 'update') {
      const [filtros, valores] = resto as [Record<string, string>, Row];
      const alvo = tabela(t).filter((row) => casa(row, filtros));
      for (const row of alvo) Object.assign(row, valores);
      return alvo.map((row) => ({ ...row }));
    }
    return [];
  };
  return {
    ...real,
    selectRows: async (t: string, o: { filters?: Record<string, string> }) => selecionar(t, o),
    selectOne: async (t: string, o: { filters?: Record<string, string> }) => selecionar(t, o)[0] ?? null,
    insertRows: registrar('insert'),
    insertRowsInChunks: registrar('insert'),
    insertOne: registrar('insert'),
    updateRows: registrar('update'),
    deleteRows: registrar('delete'),
    callFunction: registrar('rpc'),
  };
});

vi.mock('@/lib/supabase/storage', () => ({
  signedUrl: async () => null,
  signedUrls: async (caminhos: unknown[]) => caminhos.map(() => null),
}));

const { lerXlsx } = await import('@/lib/server/xlsx');
const { mapOverview, placeMembers } = await import('@/lib/server/map-location.service');
const { chaveDoNome, idDaPlanilha, lerAbaDoSheets, planejarPlanilha } = await import(
  '@/lib/domain/planilha-do-sheets'
);
const { sheetVisibilityFilter } = await import('@/lib/server/sheet-visibility');
const { equipeDaPlanilha, lerPlanilha, montarEquipe, statusDaPlanilha, updateSheetSettings } = await import(
  '@/lib/server/sheet-live.service'
);

const OFICIAL = 'time-oficial';
const COPIA = 'time-copia';
const LINK = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv';

let arquivoDoGoogle: Buffer;

function semear() {
  db.clear();
  escritas.length = 0;
  tabela('cmd_clients').push(
    { id: OFICIAL, is_copy: false, sheet_sync_enabled: false, sheet_url: null, state_uf: 'AL', cities: [] },
    { id: COPIA, is_copy: true, sheet_sync_enabled: true, sheet_url: LINK, state_uf: 'AL', cities: ['Arapiraca'] },
  );
  tabela('cmd_users').push({ id: 'admin-geral', role: 'ADMIN', client_id: null, member_id: null });
  // Oficial: um Lider e a Equipe dele. Nada disto pode mudar.
  tabela('cmd_members').push(
    { id: 'of-lider', client_id: OFICIAL, name: 'Félix Silva Targino', recruited_by_role: 'CANDIDATE' },
    { id: 'of-equipe', client_id: OFICIAL, name: 'Equipe do Oficial', recruited_by_role: 'EQUIPE' },
    // Copia: o mesmo Lider (copiado) e uma Equipe que estava no banco.
    { id: 'cp-lider', client_id: COPIA, name: 'Félix Silva Targino', recruited_by_role: 'CANDIDATE' },
    { id: 'cp-equipe', client_id: COPIA, name: 'Equipe do Banco', recruited_by_role: 'EQUIPE', recruited_by_user_id: 'u-cp-lider' },
  );
  tabela('cmd_users').push({ id: 'u-cp-lider', role: 'EQUIPE', client_id: COPIA, member_id: 'cp-lider' });

  // Tabela do TSE: a escola da zona 10, secoes 147 e 150.
  tabela('cmd_polling_places').push({
    id: 'pp-escola',
    uf: 'AL',
    city: 'Arapiraca',
    zone: 10,
    name: 'ESCOLA ESTADUAL EXEMPLO',
    address: 'RUA A',
    district: 'CENTRO',
    latitude: -9.75,
    longitude: -36.66,
    sections: [147, 150],
  });
  // O Lider do banco ja vota nela: o pino da escola existe, com 1 pessoa.
  tabela('cmd_map_locations').push({
    id: 'ml-escola',
    latitude: -9.75,
    longitude: -36.66,
    title: 'ESCOLA ESTADUAL EXEMPLO',
    address: 'RUA A',
    place_id: null,
    data_id: null,
    image_url: null,
  });
  tabela('cmd_member_locations').push({
    id: 'loc-lider',
    client_id: COPIA,
    member_id: 'cp-lider',
    location_kind: 'POLLING_PLACE',
    status: 'SUCCESS',
    location_id: 'ml-escola',
    updated_at: '2026-09-30T00:00:00.000Z',
  });
  tabela('cmd_members').find((m) => m.id === 'cp-lider')!.zone = '10';
  tabela('cmd_members').find((m) => m.id === 'cp-lider')!.section = '147';

  arquivoDoGoogle = xlsx([
    {
      nome: 'FELIX SILVA TARGINO',
      linhas: [
        CABECALHO,
        ['Maria Souza', 100000002720, 10, 147, 82999990001, 'Félix Silva Targino', 'Irmã do pastor', 'SIM'],
        ['Félix Silva Targino', '', '', '', '', 'Félix Silva Targino', '', ''],
        ['João Lima', '', '', '', '82988887777', 'Félix Silva Targino', '', 'NÃO'],
      ],
    },
    {
      nome: 'ADALBERTO',
      linhas: [CABECALHO, ['Ana Rocha', '', 10, 150, '', 'Adalberto Souza Lima', '', '']],
    },
    { nome: 'Rascunho', linhas: [CABECALHO, ['Não conta', '', '', '', '', '', '', '']], oculta: true },
  ]);

  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(new Uint8Array(arquivoDoGoogle), {
        status: 200,
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      }),
    ),
  );
}

beforeEach(semear);

/* -------------------------------------------------------------------------
   Testes
   ------------------------------------------------------------------------- */

describe('leitura do .xlsx exportado pelo Google', () => {
  it('lê as abas visíveis, na ordem, com número grande inteiro', () => {
    const abas = lerXlsx(arquivoDoGoogle);
    expect(abas.map((aba) => aba.titulo)).toEqual(['FELIX SILVA TARGINO', 'ADALBERTO']);
    expect(abas[0].linhas[1]).toEqual([
      'Maria Souza',
      '100000002720',
      '10',
      '147',
      '82999990001',
      'Félix Silva Targino',
      'Irmã do pastor',
      'SIM',
    ]);
  });

  it('recusa arquivo que não é planilha (a página de login do Google, por exemplo)', () => {
    expect(() => lerXlsx(Buffer.from('<html>login</html>'))).toThrow('planilha');
  });
});

describe('link da planilha', () => {
  it('aceita o link copiado do navegador e recusa qualquer outro endereço', () => {
    expect(idDaPlanilha(`${LINK}/edit#gid=0`)).toBe('1AbCdEfGhIjKlMnOpQrStUv');
    expect(idDaPlanilha(`${LINK}/edit?usp=sharing`)).toBe('1AbCdEfGhIjKlMnOpQrStUv');
    expect(idDaPlanilha('https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv')).toBeNull();
    expect(idDaPlanilha('http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv')).toBeNull();
  });
});

describe('Líder de cada aba', () => {
  const lideres = [{ memberId: 'cp-lider', name: 'Félix Silva Targino' }];

  it('reconhece o Líder pelo nome da aba, sem maiúscula nem acento', () => {
    expect(chaveDoNome('FELIX  SILVA targino')).toBe(chaveDoNome('Félix Silva Targino'));
    const plano = planejarPlanilha(
      [lerAbaDoSheets('FELIX SILVA TARGINO', [CABECALHO, ['Maria', '', '', '', '', '', '', '']])],
      lideres,
    );
    expect(plano.grupos[0].lider).toEqual({ tipo: 'existente', memberId: 'cp-lider', name: 'Félix Silva Targino' });
  });

  it('aba sem Líder no time vira Líder novo, com o nome completo da coluna LÍDER', () => {
    const plano = planejarPlanilha(
      [lerAbaDoSheets('ADALBERTO', [CABECALHO, ['Ana', '', '', '', '', 'Adalberto Souza Lima', '', '']])],
      lideres,
    );
    expect(plano.grupos[0].lider).toEqual({ tipo: 'novo', name: 'Adalberto Souza Lima' });
  });

  it('sem nada na coluna LÍDER, o Líder novo leva o nome da aba', () => {
    const plano = planejarPlanilha([lerAbaDoSheets('Zé', [CABECALHO, ['Ana', '', '', '', '', '', '', '']])], []);
    expect(plano.grupos[0].lider).toEqual({ tipo: 'novo', name: 'Zé' });
  });

  it('aba com apelido acha o Líder pela coluna LÍDER', () => {
    const plano = planejarPlanilha(
      [lerAbaDoSheets('FÉLIX', [CABECALHO, ['Ana', '', '', '', '', 'Felix Silva Targino', '', '']])],
      lideres,
    );
    expect(plano.grupos[0].lider.tipo).toBe('existente');
  });

  it('sem cabeçalho, lê pela ordem das colunas', () => {
    const aba = lerAbaDoSheets('X', [['Ana Lima', '100000002720', '10', '147', '82999990001', 'Líder X', 'Ref', 'SIM']]);
    expect(aba.pessoas[0]).toMatchObject({ name: 'Ana Lima', zone: '10', section: '147', reference: 'Ref', photoVerified: 'SIM' });
    expect(aba.lider).toBe('Líder X');
  });

  it('aba vazia de Líder desconhecido é ignorada, com o motivo', () => {
    const plano = planejarPlanilha([lerAbaDoSheets('Vazia', [CABECALHO])], lideres);
    expect(plano.grupos).toEqual([]);
    expect(plano.abasIgnoradas[0].aba).toBe('Vazia');
  });
});

describe('quem do banco aparece na cópia', () => {
  it('no time oficial, nada muda', async () => {
    expect(await sheetVisibilityFilter(OFICIAL)).toEqual({});
  });

  it('ligada: do banco só os Líderes; a Equipe do banco fica escondida', async () => {
    expect(await sheetVisibilityFilter(COPIA)).toEqual({
      or: '(recruited_by_role.is.null,recruited_by_role.neq.EQUIPE)',
    });
  });

  it('desligada: a cópia mostra o banco, como sempre', async () => {
    tabela('cmd_clients').find((c) => c.id === COPIA)!.sheet_sync_enabled = false;
    expect(await sheetVisibilityFilter(COPIA)).toEqual({});
  });
});

describe('a planilha é lida ao vivo, e NADA dela vai para o banco', () => {
  it('ler a planilha não escreve nada no banco — nem pessoa, nem Líder, nem resumo', async () => {
    const equipe = await equipeDaPlanilha(COPIA);
    await statusDaPlanilha(COPIA, { naHora: true });

    expect(equipe?.membros.length).toBeGreaterThan(0);
    expect(escritas).toEqual([]);
  });

  it('monta a Equipe de cada Líder na memória, e o Líder que só existe na planilha', async () => {
    const equipe = (await equipeDaPlanilha(COPIA))!;

    expect(equipe.relatorio).toMatchObject({
      ok: true,
      abas: 2,
      lideresEncontrados: ['Félix Silva Targino'],
      lideresCriados: ['Adalberto Souza Lima'],
      pessoas: 3,
    });

    const felix = equipe.membros.filter((m) => m.recruitedBy?.userId === 'u-cp-lider');
    expect(felix.map((m) => m.name)).toEqual(['Maria Souza', 'João Lima']);
    expect(felix[0]).toMatchObject({
      voterId: '100000002720',
      zone: '10',
      section: '147',
      phone: '82999990001',
      reference: 'Irmã do pastor',
      photoVerified: true,
      tier: 'EQUIPE',
      fromSheet: true,
    });

    const adalberto = equipe.membros.find((m) => m.name === 'Adalberto Souza Lima')!;
    expect(adalberto).toMatchObject({ tier: 'LIDER', fromSheet: true });
    expect(adalberto.id.startsWith('planilha-')).toBe(true);
    const ana = equipe.membros.find((m) => m.name === 'Ana Rocha')!;
    expect(ana.recruitedBy?.userId).toBe(adalberto.userId);
  });

  it('mudou a planilha, mudou a tela — sem importar nada', async () => {
    await equipeDaPlanilha(COPIA);
    arquivoDoGoogle = xlsx([
      { nome: 'Félix Silva Targino', linhas: [CABECALHO, ['Pessoa Nova', '', '', '', '', '', '', '']] },
    ]);

    const depois = await statusDaPlanilha(COPIA, { naHora: true });
    expect(depois.pessoas).toBe(1);
    const equipe = (await equipeDaPlanilha(COPIA))!;
    expect(equipe.membros.map((m) => m.name)).toEqual(['Pessoa Nova']);
    expect(escritas).toEqual([]);
  });

  it('dentro de um minuto reaproveita a leitura; "Ler agora" vai ao Google de novo', async () => {
    const url = 'https://docs.google.com/spreadsheets/d/1OutraPlanilhaParaOCache';
    await lerPlanilha(url);
    await lerPlanilha(url);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await lerPlanilha(url, { naHora: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('Líder do banco sem usuário ainda liga com a Equipe dele pela tela', () => {
    const leitura = { em: '2026-09-30T12:00:00.000Z', abas: [lerAbaDoSheets('Bia', [CABECALHO, ['Caio', '', '', '', '', '', '', '']])] };
    const equipe = montarEquipe(leitura, [{ memberId: 'm-bia', name: 'Bia', userId: null, tag: 'NORTE' }], {
      clientId: COPIA,
      estado: 'AL',
      cidade: 'Arapiraca',
    });
    const vinculo = equipe.vinculoDoLider.get('m-bia')!;
    expect(vinculo.startsWith('planilha-')).toBe(true);
    expect(equipe.membros[0].recruitedBy).toMatchObject({ userId: vinculo, name: 'Bia', tag: 'NORTE' });
  });

  it('planilha fechada: a lista do time continua abrindo, e o motivo aparece no cartão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })));
    const url = 'https://docs.google.com/spreadsheets/d/1PlanilhaFechadaNoGoogle';
    tabela('cmd_clients').find((c) => c.id === COPIA)!.sheet_url = url;

    const equipe = await equipeDaPlanilha(COPIA);
    expect(equipe?.membros).toEqual([]);
    const status = await statusDaPlanilha(COPIA, { naHora: true });
    expect(status.ok).toBe(false);
    expect(status.erro).toContain('Qualquer pessoa com o link');
    expect(escritas).toEqual([]);
  });

  it('no time oficial não há planilha: nem ler, nem ligar', async () => {
    expect(await equipeDaPlanilha(OFICIAL)).toBeNull();
    await expect(statusDaPlanilha(OFICIAL)).rejects.toThrow('time duplicado');
    await expect(updateSheetSettings(OFICIAL, { enabled: true, url: LINK })).rejects.toThrow('time duplicado');
    expect(escritas).toEqual([]);
  });

  it('o banco guarda só o interruptor e o link, já limpo', async () => {
    await updateSheetSettings(COPIA, { enabled: true, url: `${LINK}/edit#gid=0` });
    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toMatchObject({ operacao: 'update', tabela: 'cmd_clients' });
    expect((escritas[0].valores as unknown[])[1]).toEqual({ sheet_sync_enabled: true, sheet_url: LINK });
  });
});

describe('as escolas do mapa contam a Equipe da planilha', () => {
  it('soma no pino da escola quem está no banco e quem está na planilha — sem gravar nada', async () => {
    const mapa = await mapOverview(COPIA);

    // Lider do banco (147) + Maria (10/147) + Ana (10/150). João nao tem zona.
    expect(mapa.pollingPlaces).toHaveLength(1);
    const escola = mapa.pollingPlaces[0];
    expect(escola).toMatchObject({ locationId: 'ml-escola', title: 'ESCOLA ESTADUAL EXEMPLO', total: 3 });
    expect(escola.sections).toEqual(
      expect.arrayContaining([
        { zone: '10', section: '147', total: 2 },
        { zone: '10', section: '150', total: 1 },
      ]),
    );
    expect(mapa.totals.pollingPlace).toBe(3);
    expect(escritas).toEqual([]);
  });

  it('escola que só tem gente da planilha ganha pino próprio', async () => {
    db.set('cmd_member_locations', []);
    const mapa = await mapOverview(COPIA);

    expect(mapa.pollingPlaces).toHaveLength(1);
    expect(mapa.pollingPlaces[0]).toMatchObject({ locationId: 'planilha-local:pp-escola', total: 2 });
    expect(escritas).toEqual([]);
  });

  it('"Ver pessoas" da escola lista também quem está na planilha', async () => {
    const lista = await placeMembers('ml-escola', { sheetClientId: COPIA });
    expect(lista.items.map((pessoa) => pessoa.name)).toEqual(['Ana Rocha', 'Félix Silva Targino', 'Maria Souza']);
    expect(lista.total).toBe(3);

    const soDaPlanilha = await placeMembers('planilha-local:pp-escola', { sheetClientId: COPIA });
    expect(soDaPlanilha.items.map((pessoa) => pessoa.name)).toEqual(['Ana Rocha', 'Maria Souza']);
    expect(escritas).toEqual([]);
  });

  it('com a planilha ligada, a Equipe do banco da cópia não aparece em "Ver pessoas"', async () => {
    tabela('cmd_members').find((m) => m.id === 'cp-equipe')!.zone = '10';
    tabela('cmd_member_locations').push({
      id: 'loc-equipe',
      client_id: COPIA,
      member_id: 'cp-equipe',
      location_kind: 'POLLING_PLACE',
      status: 'SUCCESS',
      location_id: 'ml-escola',
      updated_at: '2026-09-30T00:00:00.000Z',
    });
    const lista = await placeMembers('ml-escola', { sheetClientId: COPIA });
    expect(lista.items.map((pessoa) => pessoa.name)).not.toContain('Equipe do Banco');
  });

  it('desligada, a escola conta só o banco', async () => {
    tabela('cmd_clients').find((c) => c.id === COPIA)!.sheet_sync_enabled = false;
    const mapa = await mapOverview(COPIA);
    expect(mapa.pollingPlaces[0].total).toBe(1);
  });

  it('no time oficial, o mapa não muda', async () => {
    const mapa = await mapOverview(OFICIAL);
    expect(mapa.pollingPlaces).toEqual([]);
    expect(escritas).toEqual([]);
  });
});
