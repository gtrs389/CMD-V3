import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  can,
  canReachClient,
  canReachMember,
  hasPanelAccess,
  permissionsOf,
  ROLE_LABELS,
} from '@/lib/permissions';
import { homePathFor, TEAM_HOME_PATH, FIRST_ACCESS_PATH } from '@/lib/auth/constants';
import {
  NO_RECRUITER_KEY,
  RECRUITED_BY_LABEL,
  recruiterKey,
  recruiterOptions,
  recruiterText,
  UNKNOWN_RECRUITER,
} from '@/lib/domain/recruitment';
import { isValidEmail, normalizeEmail } from '@/lib/utils/email';
import { publicSubmissionSchema } from '@/lib/validation/server.schema';
import type { Member, Recruiter, SessionUser } from '@/lib/types';

/**
 * Hierarquia de recrutamento e acesso da EQUIPE.
 *
 * Reproduz o exemplo obrigatorio: Marina (candidata) cadastra Joao; Joao
 * cadastra Ana; Ana cadastra Carlos. Nenhum dado real e nenhuma chamada paga
 * sao usados.
 */

const ADMIN: SessionUser = {
  id: 'u-admin',
  name: 'Administradora',
  email: 'admin@exemplo.test',
  role: 'ADMIN',
  candidateId: null,
  memberId: null,
  mustChangePassword: false,
};

/** Marina Alves, candidata da operacao A. */
const MARINA: SessionUser = {
  id: 'u-marina',
  name: 'Marina Alves',
  email: 'marina@exemplo.test',
  role: 'CANDIDATE',
  candidateId: 'cli-a',
  memberId: null,
  mustChangePassword: false,
};

/** Joao Silva, EQUIPE, cadastrado pelo link de Marina. */
const JOAO: SessionUser = {
  id: 'u-joao',
  name: 'João Silva',
  email: 'joao@exemplo.test',
  role: 'EQUIPE',
  candidateId: 'cli-a',
  memberId: 'm-joao',
  mustChangePassword: false,
};

/** Ana, EQUIPE, cadastrada pelo link de Joao. */
const ANA: SessionUser = {
  id: 'u-ana',
  name: 'Ana Ribeiro',
  email: 'ana@exemplo.test',
  role: 'EQUIPE',
  candidateId: 'cli-a',
  memberId: 'm-ana',
  mustChangePassword: false,
};

/** Candidato B: outra candidatura, nada em comum com a operacao A. */
const CANDIDATO_B: SessionUser = {
  ...MARINA,
  id: 'u-b',
  name: 'Candidato B',
  email: 'b@exemplo.test',
  candidateId: 'cli-b',
};

/** Integrante da operacao A, com o dono do link que o cadastrou. */
function membro(id: string, recruiter: string | null, clientId = 'cli-a') {
  return { clientId, recruitedByUserId: recruiter };
}

const JOAO_MEMBRO = membro('m-joao', MARINA.id);
const IRMA_DE_JOAO = membro('m-bruna', MARINA.id);
const ANA_MEMBRO = membro('m-ana', JOAO.id);
const CARLOS_MEMBRO = membro('m-carlos', ANA.id);
const OUTRA_CANDIDATURA = membro('m-outro', 'u-b-equipe', 'cli-b');
const SEM_ORIGEM = membro('m-antigo', null);

describe('hierarquia de recrutamento', () => {
  it('ADMIN vê todos os candidatos e todos os níveis', () => {
    for (const alvo of [
      JOAO_MEMBRO,
      IRMA_DE_JOAO,
      ANA_MEMBRO,
      CARLOS_MEMBRO,
      OUTRA_CANDIDATURA,
      SEM_ORIGEM,
    ]) {
      expect(canReachMember(ADMIN, alvo)).toBe(true);
    }
  });

  it('candidato vê toda a própria operação, em qualquer nível', () => {
    // Cadastrados diretamente por ela e pela equipe inteira.
    expect(canReachMember(MARINA, JOAO_MEMBRO)).toBe(true);
    expect(canReachMember(MARINA, ANA_MEMBRO)).toBe(true);
    expect(canReachMember(MARINA, CARLOS_MEMBRO)).toBe(true);
    expect(canReachMember(MARINA, SEM_ORIGEM)).toBe(true);
  });

  it('candidato A não alcança candidato B', () => {
    expect(canReachMember(MARINA, OUTRA_CANDIDATURA)).toBe(false);
    expect(canReachClient(MARINA, 'cli-b')).toBe(false);
    expect(canReachClient(CANDIDATO_B, 'cli-a')).toBe(false);
  });

  it('EQUIPE vê somente quem se cadastrou pelo próprio link', () => {
    // Joao vê Ana, que usou o link dele.
    expect(canReachMember(JOAO, ANA_MEMBRO)).toBe(true);
    // Ana vê Carlos, que usou o link dela.
    expect(canReachMember(ANA, CARLOS_MEMBRO)).toBe(true);
  });

  it('EQUIPE não vê irmãos, descendentes nem outra candidatura', () => {
    // Irmao: cadastrado pela mesma pessoa que cadastrou Joao.
    expect(canReachMember(JOAO, IRMA_DE_JOAO)).toBe(false);
    // Descendente do proprio recrutado: Carlos entrou pelo link de Ana.
    expect(canReachMember(JOAO, CARLOS_MEMBRO)).toBe(false);
    // Quem cadastrou Joao tambem nao aparece para ele.
    expect(canReachMember(JOAO, JOAO_MEMBRO)).toBe(false);
    // Registro sem origem conhecida nao vira de ninguem.
    expect(canReachMember(JOAO, SEM_ORIGEM)).toBe(false);
    // Outra candidatura, nunca.
    expect(canReachMember(JOAO, OUTRA_CANDIDATURA)).toBe(false);
    expect(canReachMember(ANA, OUTRA_CANDIDATURA)).toBe(false);
    // Ana tambem nao alcanca quem esta acima dela.
    expect(canReachMember(ANA, ANA_MEMBRO)).toBe(false);
    expect(canReachMember(ANA, JOAO_MEMBRO)).toBe(false);
  });

  it('EQUIPE não alcança o registro do candidato nem outra operação', () => {
    expect(canReachClient(JOAO, 'cli-a')).toBe(false);
    expect(canReachClient(JOAO, 'cli-b')).toBe(false);
  });

  it('trocar o identificador do integrante não amplia o acesso', () => {
    // Mesmo `memberId`, operacao diferente: continua negado.
    expect(canReachMember(JOAO, { ...ANA_MEMBRO, clientId: 'cli-b' })).toBe(false);
    // Sessao forjada sem operacao nao alcanca nada.
    expect(canReachMember({ ...JOAO, candidateId: null }, ANA_MEMBRO)).toBe(false);
    expect(canReachMember(null, ANA_MEMBRO)).toBe(false);
    expect(canReachMember(JOAO, null)).toBe(false);
  });
});

describe('perfil EQUIPE', () => {
  it('é exibido como Equipe e entra no painel', () => {
    expect(ROLE_LABELS.EQUIPE).toBe('Equipe');
    expect(hasPanelAccess(JOAO)).toBe(true);
    expect(can(JOAO, 'team.access')).toBe(true);
  });

  it('não recebe nenhuma permissão de escrita nem de visão global', () => {
    const proibidas = [
      'admin.access',
      'dashboard.view',
      'client.list',
      'client.view',
      'client.create',
      'client.update',
      'client.delete',
      // Area interna do formulario: exclusiva do ADMIN.
      'form.view',
      'form.manage',
      'invite.manage',
      'member.create',
      'member.update',
      'member.delete',
      'verification.view',
      'verification.retry',
      'device.view',
      'map.view',
      'map.resolve',
      'settings.view',
      'settings.manage',
    ] as const;

    for (const permissao of proibidas) expect(can(JOAO, permissao)).toBe(false);
  });

  it('copia o próprio link, mas não ativa, desativa nem renova', () => {
    expect(can(JOAO, 'invite.view')).toBe(true);
    expect(can(JOAO, 'invite.manage')).toBe(false);
  });

  it('o candidato não herda a área da equipe', () => {
    expect(can(MARINA, 'team.access')).toBe(false);
    expect(permissionsOf('EQUIPE')).not.toContain('settings.view');
  });

  it('entra direto em Minha mobilização', () => {
    expect(homePathFor(JOAO)).toBe(TEAM_HOME_PATH);
    expect(homePathFor(MARINA)).toBe('/candidatos/cli-a');
    expect(homePathFor(ADMIN)).toBe('/dashboard');
    // Senha temporaria em uso: o unico destino e a troca obrigatoria.
    expect(homePathFor({ ...JOAO, mustChangePassword: true })).toBe(FIRST_ACCESS_PATH);
  });
});

describe('rótulo "Cadastrado por"', () => {
  const marinaRecruiter: Recruiter = {
    userId: MARINA.id,
    name: 'Marina Alves',
    role: 'CANDIDATE',
    photo: null,
  };
  const joaoRecruiter: Recruiter = {
    userId: JOAO.id,
    name: 'João Silva',
    role: 'EQUIPE',
    photo: null,
  };

  it('usa o rótulo pedido na interface', () => {
    expect(RECRUITED_BY_LABEL).toBe('Cadastrado por');
  });

  it('mostra nome e perfil do responsável', () => {
    expect(recruiterText(marinaRecruiter)).toBe('Marina Alves · Candidato');
    expect(recruiterText(joaoRecruiter)).toBe('João Silva · Equipe');
  });

  it('preserva o histórico quando o recrutador é excluído', () => {
    // O identificador some, o snapshot permanece.
    expect(recruiterText({ ...joaoRecruiter, userId: null })).toBe(
      'João Silva · Equipe (acesso removido)',
    );
  });

  it('não atribui registro antigo a ninguém', () => {
    expect(recruiterText(null)).toBe(UNKNOWN_RECRUITER);
    expect(recruiterText(null)).toBe('Cadastro anterior ao rastreamento');
    expect(recruiterKey({ recruitedBy: null })).toBe(NO_RECRUITER_KEY);
  });

  it('agrupa o filtro por responsável', () => {
    const membros = [
      { recruitedBy: marinaRecruiter },
      { recruitedBy: joaoRecruiter },
      { recruitedBy: joaoRecruiter },
      { recruitedBy: null },
    ] as Pick<Member, 'recruitedBy'>[];

    const opcoes = recruiterOptions(membros);
    expect(opcoes).toHaveLength(3);
    expect(opcoes[0]).toMatchObject({ label: 'João Silva · Equipe', count: 2 });
    expect(opcoes.map((opcao) => opcao.key)).toContain(NO_RECRUITER_KEY);

    // Recrutador excluido continua agrupado pelo snapshot, nao some da lista.
    const semUsuario = recruiterKey({ recruitedBy: { ...joaoRecruiter, userId: null } });
    expect(semUsuario).toBe('nome:João Silva:EQUIPE');
  });
});

describe('e-mail de acesso', () => {
  it('normaliza em minúsculas e sem espaços nas pontas', () => {
    expect(normalizeEmail('  Joao.Silva@Exemplo.TEST ')).toBe('joao.silva@exemplo.test');
    expect(normalizeEmail(null)).toBe('');
  });

  it('aceita só endereço com formato válido', () => {
    expect(isValidEmail('joao@exemplo.test')).toBe(true);
    expect(isValidEmail('JOAO@EXEMPLO.TEST')).toBe(true);
    expect(isValidEmail('joao@@exemplo.test')).toBe(false);
    expect(isValidEmail('joao@exemplo')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });

  it('é obrigatório no envio público e chega normalizado', () => {
    const base = {
      name: 'João Silva',
      phone: '11987654321',
      responses: [],
      consentAt: null,
    };

    const semEmail = publicSubmissionSchema.safeParse(base);
    expect(semEmail.success).toBe(false);

    const invalido = publicSubmissionSchema.safeParse({ ...base, email: 'joao@exemplo' });
    expect(invalido.success).toBe(false);

    const valido = publicSubmissionSchema.safeParse({
      ...base,
      email: '  Joao@Exemplo.TEST ',
    });
    expect(valido.success).toBe(true);
    expect(valido.data?.email).toBe('joao@exemplo.test');
  });

  it('ignora qualquer responsável forjado no corpo da requisição', () => {
    const parsed = publicSubmissionSchema.safeParse({
      name: 'Forjado',
      email: 'forjado@exemplo.test',
      phone: '11987654321',
      responses: [],
      consentAt: null,
      // Tentativas de escolher o responsavel e a operacao pelo navegador.
      recruiterUserId: 'u-admin',
      recruitedBy: 'u-marina',
      clientId: 'cli-b',
      role: 'ADMIN',
    });

    expect(parsed.success).toBe(true);
    // O esquema nao tem nenhum destes campos: eles simplesmente nao existem
    // no que chega ao servico. O responsavel vem do token do link.
    expect(parsed.data).not.toHaveProperty('recruiterUserId');
    expect(parsed.data).not.toHaveProperty('recruitedBy');
    expect(parsed.data).not.toHaveProperty('clientId');
    expect(parsed.data).not.toHaveProperty('role');
  });
});

/* -------------------------------------------------------------------------
   Protecao no servidor, com sessao e banco simulados
   ------------------------------------------------------------------------- */

interface MembroSimulado {
  client_id: string;
  recruited_by_user_id: string | null;
}

const estado: { user: SessionUser | null; membros: Record<string, MembroSimulado> } = {
  user: null,
  membros: {
    'm-joao': { client_id: 'cli-a', recruited_by_user_id: 'u-marina' },
    'm-bruna': { client_id: 'cli-a', recruited_by_user_id: 'u-marina' },
    'm-ana': { client_id: 'cli-a', recruited_by_user_id: 'u-joao' },
    'm-carlos': { client_id: 'cli-a', recruited_by_user_id: 'u-ana' },
    'm-outro': { client_id: 'cli-b', recruited_by_user_id: 'u-b-equipe' },
  },
};

vi.mock('@/lib/server/auth.service', () => ({
  currentUser: async () => estado.user,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (_table: string, options: { filters?: Record<string, string> }) => {
    const id = (options.filters?.id ?? '').replace('eq.', '');
    const row = estado.membros[id];
    return row ? { id, ...row } : null;
  },
  selectRows: async () => [],
}));

const { requireClientAccess, requireMemberAccess, requirePermission, requireTeamSession } =
  await import('@/lib/server/guard');

/** Codigo HTTP da falha, para conferir 401/403 sem depender da mensagem. */
async function statusOf(action: () => Promise<unknown>): Promise<number> {
  try {
    await action();
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

describe('proteção no servidor', () => {
  beforeEach(() => {
    estado.user = null;
  });

  it('recusa sem sessão', async () => {
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-ana'))).toBe(401);
    expect(await statusOf(() => requireTeamSession())).toBe(401);
  });

  it('deixa a EQUIPE abrir apenas a ficha dos próprios recrutados', async () => {
    estado.user = JOAO;

    expect(await statusOf(() => requireMemberAccess('member.view', 'm-ana'))).toBe(200);
    // Irmao, descendente, quem o cadastrou e outra candidatura: todos negados.
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-bruna'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-carlos'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-joao'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-outro'))).toBe(403);
  });

  it('recusa a EQUIPE em rota de escrita, de candidato ou de dado sensível', async () => {
    estado.user = JOAO;

    expect(await statusOf(() => requireClientAccess('client.view', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.update', 'm-ana'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.delete', 'm-ana'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('device.view', 'm-ana'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('verification.view', 'm-ana'))).toBe(403);
    expect(await statusOf(() => requirePermission('settings.view'))).toBe(403);
    expect(await statusOf(() => requirePermission('map.view'))).toBe(403);
    expect(await statusOf(() => requirePermission('invite.manage'))).toBe(403);
  });

  it('deixa o candidato alcançar todos os níveis da própria operação', async () => {
    estado.user = MARINA;

    for (const id of ['m-joao', 'm-bruna', 'm-ana', 'm-carlos']) {
      expect(await statusOf(() => requireMemberAccess('member.view', id))).toBe(200);
    }
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-outro'))).toBe(403);
  });

  it('mantém o ADMIN alcançando qualquer integrante', async () => {
    estado.user = ADMIN;

    for (const id of ['m-joao', 'm-ana', 'm-carlos', 'm-outro']) {
      expect(await statusOf(() => requireMemberAccess('member.view', id))).toBe(200);
    }
  });

  it('a área da equipe exige sessão EQUIPE com integrante e operação', async () => {
    estado.user = JOAO;
    expect(await statusOf(() => requireTeamSession())).toBe(200);

    estado.user = MARINA;
    expect(await statusOf(() => requireTeamSession())).toBe(403);

    estado.user = ADMIN;
    expect(await statusOf(() => requireTeamSession())).toBe(403);

    // Sessao EQUIPE sem vinculo completo nao abre a area.
    estado.user = { ...JOAO, memberId: null };
    expect(await statusOf(() => requireTeamSession())).toBe(403);
  });

  it('bloqueia tudo enquanto a senha temporária não for trocada', async () => {
    estado.user = { ...JOAO, mustChangePassword: true };

    expect(await statusOf(() => requireTeamSession())).toBe(403);
    expect(await statusOf(() => requireMemberAccess('member.view', 'm-ana'))).toBe(403);
  });
});
