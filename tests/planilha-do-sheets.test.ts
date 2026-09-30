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
let seq = 0;

function lista(valor: string): string[] {
  return valor
    .slice(valor.indexOf('(') + 1, -1)
    .split(',')
    .map((item) => item.replace(/^"|"$/g, ''));
}

function casa(row: Row, filtros: Record<string, string> = {}): boolean {
  return Object.entries(filtros).every(([chave, valor]) => {
    if (chave === 'or') return true; // so a trava de leitura usa `or` aqui
    if (valor === 'is.true') return row[chave] === true;
    if (valor === 'is.false') return row[chave] !== true;
    if (valor === 'is.null') return row[chave] == null;
    if (valor.startsWith('eq.')) return String(row[chave]) === valor.slice(3);
    if (valor.startsWith('in.')) return lista(valor).includes(String(row[chave]));
    throw new Error(`filtro nao suportado: ${chave}=${valor}`);
  });
}

vi.mock('@/lib/supabase/rest', async () => {
  const real = await vi.importActual<typeof import('@/lib/supabase/rest')>('@/lib/supabase/rest');
  const selecionar = (t: string, o: { filters?: Record<string, string> } = {}) =>
    tabela(t).filter((row) => casa(row, o.filters)).map((row) => ({ ...row }));
  const inserir = (t: string, valores: Row[]) => {
    const gravadas = valores.map((v) => ({ id: v.id ?? `${t}-${++seq}`, ...v }));
    tabela(t).push(...gravadas);
    return gravadas.map((row) => ({ ...row }));
  };
  return {
    ...real,
    selectRows: async (t: string, o: { filters?: Record<string, string> }) => selecionar(t, o),
    selectOne: async (t: string, o: { filters?: Record<string, string> }) => selecionar(t, o)[0] ?? null,
    insertRowsInChunks: async (t: string, v: Row[]) => inserir(t, v),
    updateRows: async (t: string, f: Record<string, string>, v: Row) => {
      const alvo = tabela(t).filter((row) => casa(row, f));
      for (const row of alvo) Object.assign(row, v);
      return alvo.map((row) => ({ ...row }));
    },
    deleteRows: async (t: string, f: Record<string, string>) => {
      const saem = tabela(t).filter((row) => casa(row, f));
      db.set(t, tabela(t).filter((row) => !saem.includes(row)));
      // Cascata do banco: usuario e vinculo de mapa do integrante apagado.
      const ids = new Set(saem.map((row) => row.id));
      if (t === 'cmd_members') {
        db.set('cmd_users', tabela('cmd_users').filter((u) => !ids.has(u.member_id)));
        db.set('cmd_member_locations', tabela('cmd_member_locations').filter((l) => !ids.has(l.member_id)));
      }
      return saem;
    },
  };
});

const { lerXlsx } = await import('@/lib/server/xlsx');
const { chaveDoNome, idDaPlanilha, lerAbaDoSheets, planejarPlanilha } = await import(
  '@/lib/domain/planilha-do-sheets'
);
const { sheetVisibilityFilter } = await import('@/lib/server/sheet-visibility');
const { syncSheet, updateSheetSettings } = await import('@/lib/server/sheet-sync.service');

const OFICIAL = 'time-oficial';
const COPIA = 'time-copia';
const LINK = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv';

let arquivoDoGoogle: Buffer;

function semear() {
  db.clear();
  seq = 0;
  tabela('cmd_clients').push(
    { id: OFICIAL, is_copy: false, sheet_sync_enabled: false, sheet_url: null, state_uf: 'AL', cities: [] },
    { id: COPIA, is_copy: true, sheet_sync_enabled: true, sheet_url: LINK, state_uf: 'AL', cities: ['Arapiraca'], sheet_sync_lock_at: null },
  );
  tabela('cmd_users').push({ id: 'admin-geral', role: 'ADMIN', client_id: null, member_id: null });
  // Oficial: um Lider e a Equipe dele. Nada disto pode mudar.
  tabela('cmd_members').push(
    { id: 'of-lider', client_id: OFICIAL, name: 'Félix Silva Targino', recruited_by_role: 'CANDIDATE', from_sheet: false },
    { id: 'of-equipe', client_id: OFICIAL, name: 'Equipe do Oficial', recruited_by_role: 'EQUIPE', from_sheet: false },
    // Copia: o mesmo Lider (copiado) e uma Equipe que estava no banco.
    { id: 'cp-lider', client_id: COPIA, name: 'Félix Silva Targino', recruited_by_role: 'CANDIDATE', from_sheet: false },
    { id: 'cp-equipe', client_id: COPIA, name: 'Equipe do Banco', recruited_by_role: 'EQUIPE', recruited_by_user_id: 'u-cp-lider', from_sheet: false },
  );
  tabela('cmd_users').push({ id: 'u-cp-lider', role: 'EQUIPE', client_id: COPIA, member_id: 'cp-lider' });

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

describe('quem aparece na cópia', () => {
  it('no time oficial, nada muda', async () => {
    expect(await sheetVisibilityFilter(OFICIAL)).toEqual({});
  });

  it('ligada: Líderes e o que veio da planilha; a Equipe do banco some', async () => {
    expect(await sheetVisibilityFilter(COPIA)).toEqual({
      or: '(from_sheet.is.true,recruited_by_role.is.null,recruited_by_role.neq.EQUIPE)',
    });
  });

  it('desligada: o que veio da planilha some, e a cópia volta a ser o que era', async () => {
    tabela('cmd_clients').find((c) => c.id === COPIA)!.sheet_sync_enabled = false;
    expect(await sheetVisibilityFilter(COPIA)).toEqual({ from_sheet: 'is.false' });
  });
});

describe('leitura da planilha', () => {
  const admin = { id: 'admin-geral', name: 'Admin Geral' };
  const doOficial = () => structuredClone(tabela('cmd_members').filter((m) => m.client_id === OFICIAL));

  it('o time oficial sai EXATAMENTE como entrou', async () => {
    const antes = doOficial();
    await syncSheet(COPIA, admin);
    await syncSheet(COPIA, admin);
    expect(doOficial()).toEqual(antes);
  });

  it('time oficial é recusado: nem ligar, nem ler', async () => {
    await expect(updateSheetSettings(OFICIAL, { enabled: true, url: LINK })).rejects.toThrow('time duplicado');
    await expect(syncSheet(OFICIAL, admin)).rejects.toThrow('time duplicado');
  });

  it('põe a Equipe da planilha em cada Líder, e cria o Líder que faltava', async () => {
    const relatorio = await syncSheet(COPIA, admin);

    expect(relatorio).toMatchObject({
      ok: true,
      abas: 2,
      lideresEncontrados: ['Félix Silva Targino'],
      lideresCriados: ['Adalberto Souza Lima'],
      pessoas: 3,
    });

    const daPlanilha = tabela('cmd_members').filter((m) => m.client_id === COPIA && m.from_sheet);
    const felix = daPlanilha.filter((m) => m.recruited_by_user_id === 'u-cp-lider');
    expect(felix.map((m) => m.name)).toEqual(['Maria Souza', 'João Lima']);
    expect(felix[0]).toMatchObject({
      voter_id: '100000002720',
      zone: '10',
      section: '147',
      phone: '82999990001',
      reference: 'Irmã do pastor',
      photo_verified: true,
      recruited_by_role: 'EQUIPE',
    });

    const adalberto = daPlanilha.find((m) => m.name === 'Adalberto Souza Lima')!;
    expect(adalberto.recruited_by_role).toBe('ADMIN');
    const usuario = tabela('cmd_users').find((u) => u.member_id === adalberto.id)!;
    expect(usuario.phone).toBeNull();
    expect(daPlanilha.find((m) => m.name === 'Ana Rocha')!.recruited_by_user_id).toBe(usuario.id);
  });

  it('ler de novo troca a fotografia, sem duplicar, e não apaga o que estava no banco da cópia', async () => {
    await syncSheet(COPIA, admin);
    await syncSheet(COPIA, admin);

    const daCopia = tabela('cmd_members').filter((m) => m.client_id === COPIA);
    expect(daCopia.filter((m) => m.from_sheet)).toHaveLength(4); // 3 pessoas + Adalberto
    expect(daCopia.find((m) => m.id === 'cp-equipe')).toBeTruthy();
    expect(daCopia.find((m) => m.id === 'cp-lider')).toBeTruthy();
  });

  it('planilha fechada: a cópia continua como estava e o motivo fica registrado', async () => {
    await syncSheet(COPIA, admin);
    const antes = structuredClone(tabela('cmd_members'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })));

    await expect(syncSheet(COPIA, admin)).rejects.toThrow('Qualquer pessoa com o link');
    expect(tabela('cmd_members')).toEqual(antes);
    const copia = tabela('cmd_clients').find((c) => c.id === COPIA)!;
    expect((copia.sheet_sync_report as { ok: boolean }).ok).toBe(false);
    expect(copia.sheet_sync_lock_at).toBeNull();
  });
});
