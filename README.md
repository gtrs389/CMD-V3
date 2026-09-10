# Nome do Sistema

Primeira etapa de um sistema de cadastro e gerenciamento de equipes.
O ADMIN cadastra clientes, monta o formulário de cada cliente e compartilha um
link individual de convite; quem recebe o link preenche o cadastro pelo celular
e passa a integrar a equipe daquele cliente.

> **O nome é provisório.** Nome, logotipo e textos institucionais ficam em
> `src/config/app.config.ts`. Cores, fontes, raios, sombras e espaçamentos ficam
> no bloco `TOKENS DE IDENTIDADE VISUAL` de `src/app/globals.css`.
> Nenhuma marca definitiva foi criada.

---

## Limitações desta etapa (leia antes de usar)

**Não existe banco de dados.** Nenhum foi instalado ou configurado — nem
Supabase, Firebase, PostgreSQL, MySQL, MongoDB, SQLite, Prisma ou serviço
externo de armazenamento.

Consequências práticas, sem rodeios:

- **Os dados ficam apenas no navegador em que foram digitados** (localStorage).
- Um cadastro enviado pelo celular de outra pessoa **fica no aparelho dela** e
  **não aparece no seu painel**. O link público funciona como demonstração
  dentro do mesmo navegador.
- Limpar os dados do site, usar aba anônima ou trocar de aparelho **apaga ou
  esconde tudo**.
- O armazenamento do navegador tem cota (poucos MB). As fotos são
  redimensionadas e comprimidas antes de salvar, mas ainda assim há limite; o
  sistema avisa quando a cota estoura.
- **O recebimento real de cadastros feitos em outros aparelhos depende de
  backend e banco de dados**, previstos para a etapa seguinte.

A autenticação também é provisória: ver [Autenticação](#autenticação-provisória).

---

## Como executar

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
cp .env.example .env.local     # opcional nesta etapa (ver Autenticação)
npm run dev                    # http://localhost:3000
```

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Sobe o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera os tipos de rota e roda `tsc --noEmit` |
| `npm test` | Testes da camada de regras (Vitest) |
| `npm run verificar` | Lint + tipos + testes + build, em sequência |
| `npm run gerar-hash -- "sua-senha"` | Gera o valor de `ADMIN_PASSWORD_HASH` |

---

## Autenticação provisória

Somente o perfil **ADMIN** tem login e painel. As credenciais vivem em
variáveis de ambiente **do servidor** e nunca chegam ao navegador — nenhuma
delas usa o prefixo `NEXT_PUBLIC_`.

Como funciona:

1. A tela de login envia e-mail e senha para `POST /api/auth/login`.
2. O servidor compara com `ADMIN_EMAIL` e com o hash scrypt em
   `ADMIN_PASSWORD_HASH`, em comparação de tempo constante.
3. Em caso de sucesso emite um cookie `httpOnly`, `SameSite=Lax`, assinado com
   HMAC-SHA256 usando `AUTH_SECRET`, válido por 8 horas.
4. `src/proxy.ts` valida a assinatura antes de renderizar qualquer rota
   administrativa; `src/app/(admin)/layout.tsx` confere de novo no servidor.

### Configuração

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # AUTH_SECRET
npm run gerar-hash -- "sua-senha-forte"                                   # ADMIN_PASSWORD_HASH
```

**Modo de demonstração:** sem `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH`
configurados, o sistema aceita `admin@exemplo.com` / `equipe123`, registra um
aviso no log do servidor e exibe um aviso visível na tela de login. Configure as
variáveis antes de qualquer uso real.

### Perfis

| Perfil | Nesta etapa |
| --- | --- |
| `ADMIN` | Login, painel, CRUD de clientes, construtor de formulário, gestão de equipes e convites |
| `EQUIPE` | Existe nos tipos e na matriz de permissões, **sem login e sem painel**. Acessa apenas o formulário público |

Quem abre o link público não vê clientes, integrantes nem qualquer área
administrativa. Toda verificação passa por `src/lib/permissions/index.ts`.

---

## Rotas

| Rota | Acesso | Descrição |
| --- | --- | --- |
| `/` | Pública | Redireciona para o painel ou para o login |
| `/login` | Pública | Login do ADMIN |
| `/dashboard` | ADMIN | Totais, cadastros recentes e clientes recentes |
| `/clientes` | ADMIN | Lista, busca e CRUD de clientes |
| `/clientes/[id]` | ADMIN | Visão geral, Equipe, Formulário e Link de convite |
| `/convite/[token]` | Pública | Formulário de cadastro da equipe |
| `/api/auth/login` | Pública | Valida credenciais e emite a sessão |
| `/api/auth/logout` | Pública | Encerra a sessão |
| `/api/auth/session` | Pública | Devolve a sessão atual (recuperação visual) |

O token do convite é opaco e aleatório: **nenhum dado pessoal vai para a URL**.

---

## Estrutura

```
src/
├── config/
│   ├── app.config.ts          Nome, logotipo, limites e textos de privacidade
│   └── theme.ts               Tokens lidos por código (movimento, breakpoints)
├── app/
│   ├── globals.css            TOKENS DE IDENTIDADE VISUAL + base + utilitários
│   ├── layout.tsx             Fonte, metadados, viewport e provider de avisos
│   ├── login/                 Tela de login
│   ├── (admin)/               Área protegida (dashboard e clientes)
│   ├── convite/[token]/       Rota pública de cadastro
│   └── api/auth/              Login, logout e leitura de sessão
├── proxy.ts                   Proteção das rotas administrativas
├── components/
│   ├── ui/                    Biblioteca visual (sem regra de negócio)
│   ├── layout/                Casca do painel, sidebar, menu móvel, sessão
│   ├── auth/                  Formulário de login
│   ├── dashboard/             Painel inicial
│   ├── clients/               CRUD, página do cliente e convite
│   ├── fields/                Construtor de formulário e pré-visualização
│   ├── members/               Gestão da equipe
│   ├── form-renderer/         Renderização dos campos dinâmicos
│   ├── common/                Foto e cópia de link
│   └── public/                Página pública de convite
├── hooks/                     Consultas aos repositórios e utilidades de UI
└── lib/
    ├── types/                 Usuário, perfil, cliente, integrante, campo,
    │                          resposta e convite
    ├── permissions/           Matriz central de permissões
    ├── validation/            Schemas zod + validação dinâmica do formulário
    ├── domain/                Regras do construtor de formulário
    ├── repositories/          Interfaces + implementação localStorage
    ├── mock/                  Dados de exemplo
    ├── auth/                  Sessão assinada e verificação de credenciais
    └── utils/                 Telefone, data, imagem, texto, ID, área de transferência
```

### Principais arquivos

| Arquivo | Papel |
| --- | --- |
| `src/config/app.config.ts` | Identidade do sistema em um único lugar |
| `src/app/globals.css` | Tokens visuais e regras de acessibilidade |
| `src/lib/permissions/index.ts` | Matriz de permissões (ponto único de expansão) |
| `src/lib/repositories/types.ts` | Contratos de persistência |
| `src/lib/repositories/index.ts` | Fábrica de repositórios (ponto de troca) |
| `src/lib/validation/dynamic-form.ts` | Schema tipado gerado a partir dos campos |
| `src/lib/domain/form-config.ts` | Regras de campos, ordem e duplicação |
| `src/lib/auth/session.ts` | Assinatura e leitura do cookie de sessão |
| `src/proxy.ts` | Bloqueio das rotas administrativas |

---

## Decisões de arquitetura

**Repositórios assíncronos.** As telas conversam apenas com as interfaces
`ClientRepository` e `MemberRepository`. Todos os métodos já retornam `Promise`,
mesmo lendo do localStorage, justamente para que a troca por HTTP não altere
nenhum componente.

**Campos com ID estável.** Cada campo do formulário tem um ID interno que nunca
muda. As respostas são gravadas por ID, não por título — renomear um campo não
quebra os dados já coletados. Antes de excluir um campo, o sistema informa
quantos integrantes já responderam a ele.

**Campos nativos.** Foto, nome e telefone existem em todo formulário. Podem ser
renomeados e reordenados; nome e telefone não podem ser desativados e o nome
permanece obrigatório, porque identifica o integrante.

**Fotos.** Toda imagem passa por validação de tipo (JPG, PNG, WEBP) e de tamanho,
é redimensionada e comprimida no navegador antes de virar `data URL`, reduzindo
o risco de estourar a cota do localStorage.

**Movimento.** As animações são curtas e o CSS respeita
`prefers-reduced-motion`. O conteúdo de página anima apenas o deslocamento, sem
transparência, para nunca ficar invisível caso o navegador congele a animação
(aba em segundo plano, impressão, captura).

**Responsividade.** Layout verificado de 320 px a 1440 px, sem rolagem
horizontal indevida. Sidebar fixa a partir de `lg`, menu lateral deslizante no
celular, modais como painel inferior em telas pequenas, tabela de equipe apenas
no desktop e cartões no celular, alvos de toque de no mínimo 44 px e respeito às
áreas seguras do iPhone.

---

## Verificações executadas

- `npm run lint` — sem erros
- `npm run typecheck` — sem erros
- `npm test` — 38 testes (telefone, permissões, regras de formulário, validação
  dinâmica e repositórios)
- `npm run build` — build de produção concluído
- Conferência manual em navegador dos fluxos completos: login inválido e válido,
  CRUD de cliente, construtor de campos, reordenação, pré-visualização, cópia do
  link, preenchimento público, aparecimento do integrante na equipe, edição e
  exclusão, persistência após recarregar, desativação e renovação do convite,
  logout e bloqueio das rotas administrativas
- Larguras conferidas: 320, 375, 390, 768, 1024 e 1440 px

---

## Preparado para a próxima etapa

O que já está pronto para receber backend e banco de dados:

1. **Troca de persistência** — substituir as duas linhas de
   `src/lib/repositories/index.ts` por implementações HTTP que respeitem
   `ClientRepository` e `MemberRepository`. Nenhuma tela muda.
2. **Autenticação real** — trocar `verifyCredentials` em
   `src/lib/auth/credentials.ts` por uma consulta à tabela de usuários. A tela de
   login e o cookie de sessão continuam iguais.
3. **Perfil EQUIPE** — acrescentar as permissões em
   `src/lib/permissions/index.ts` e criar as rotas correspondentes; a navegação
   já é filtrada por permissão.
4. **Modelo de dados** — os tipos em `src/lib/types/` mapeiam diretamente para
   tabelas (`users`, `clients`, `client_form_fields`, `members`,
   `member_responses`, `invites`).
5. **Fotos** — o pipeline de validação e compressão já está isolado em
   `src/lib/utils/image.ts`; basta trocar o destino da `data URL` por um upload.
6. **Aviso de privacidade** — a área é configurável por cliente. O texto atual é
   um marcador operacional e **precisa ser revisado por responsável jurídico**
   antes de qualquer uso real.
