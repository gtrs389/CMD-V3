# Cadastro Mobilização Digital (CMD)

Sistema de cadastro e gerenciamento de equipes. O ADMIN cadastra clientes, monta
o formulário de cada cliente e compartilha um link individual de convite; quem
recebe o link preenche o cadastro pelo celular, de qualquer aparelho, e o
registro aparece no painel do ADMIN.

Nos espaços compactos o sistema aparece como **CMD**; o nome completo fica no
login e nos títulos principais. Nome, logotipo e textos institucionais ficam em
`src/config/app.config.ts`. A paleta e os demais tokens visuais ficam no bloco
`TOKENS DE IDENTIDADE VISUAL` de `src/app/globals.css`.

---

## Banco de dados

A fonte oficial dos dados é o **Supabase**. Todo acesso acontece no servidor do
Next.js, por Route Handlers e serviços `server-only`. **Nenhuma tela ou
componente cliente consulta o Supabase diretamente.**

O projeto **não usa Supabase Authentication** em nenhum ponto: nada de
`supabase.auth`, `auth.users`, Auth.js, usuários criados pelo painel
Authentication ou políticas baseadas em `auth.uid()`. Usuários, níveis de
acesso, senhas e sessões vivem nas tabelas `cmd_users` e `cmd_sessions`.

O `localStorage` permanece apenas para o rascunho temporário do formulário
público, apagado assim que o cadastro é enviado.

Antes de rodar, siga [`supabase/SETUP.md`](supabase/SETUP.md): ele traz a ordem
exata dos SQLs, como gerar o hash do primeiro ADMIN e como configurar as
variáveis na Vercel.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `cmd_users` | Usuários do painel. Senha em `scrypt$salt$hash` |
| `cmd_sessions` | Sessões ativas. Guarda apenas o hash SHA-256 do token do cookie |
| `cmd_clients` | Clientes e configuração do formulário público |
| `cmd_form_fields` | Campos do formulário, com `system_key` nos campos nativos |
| `cmd_members` | Integrantes cadastrados |
| `cmd_member_responses` | Respostas por campo, referenciadas pelo ID estável |
| `cmd_invites` | Convites. Guarda apenas o hash SHA-256 do token do link |

Todas ficam com RLS habilitado e **sem nenhuma policy**, e o acesso de `anon` e
`authenticated` é revogado. As fotos vão para o bucket privado `cmd-media`: as
tabelas guardam somente o caminho e os metadados, e o navegador recebe URLs
assinadas geradas no servidor.

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
| --- | --- | --- |
| `SUPABASE_URL` | sim | Endereço https do projeto Supabase |
| `SUPABASE_SECRET_KEY` | sim | Chave secreta. Somente no servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | não | Reserva legada de `SUPABASE_SECRET_KEY` |

Nenhuma usa o prefixo `NEXT_PUBLIC_`. Sem elas o sistema falha de forma segura:
o login é recusado e a tela de entrada exibe o aviso de configuração ausente.

---

## Como executar

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
cp .env.example .env.local     # preencha SUPABASE_URL e SUPABASE_SECRET_KEY
npm run dev                    # http://localhost:3000
```

Execute os SQLs de `supabase/` antes do primeiro login. Veja
[`supabase/SETUP.md`](supabase/SETUP.md).

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
| `npm run gerar-hash` | Pergunta e-mail e senha (oculta) e imprime o `INSERT` do ADMIN |

---

## Autenticação própria

Somente o perfil **ADMIN** tem login e painel nesta etapa. A autenticação é
própria, sobre `cmd_users` e `cmd_sessions`.

Como funciona:

1. A tela de login envia e-mail e senha para `POST /api/auth/login`.
2. O servidor busca o usuário em `cmd_users` e confere a senha com `scrypt`,
   salt aleatório por usuário e comparação em tempo constante. O `scrypt` roda
   mesmo quando o e-mail não existe, para o tempo de resposta não denunciar
   nada.
3. Em caso de sucesso é gerado um token de sessão criptograficamente seguro.
   O banco guarda **apenas o hash SHA-256** do token; o valor original vai para
   um cookie `httpOnly`, `Secure` em produção, `SameSite=Lax`, válido por 8
   horas.
4. Cada rota administrativa confere a sessão no servidor antes de qualquer
   operação, via `requirePermission` em `src/lib/server/guard.ts`. O
   `src/proxy.ts` apenas melhora a navegação olhando a presença do cookie.

Proteções:

- `password_hash` nunca é devolvido ao navegador.
- Login inválido responde sempre com a mesma mensagem genérica.
- Cinco tentativas seguidas bloqueiam a conta por 15 minutos.
- Logout revoga a sessão no banco e limpa as sessões expiradas.
- **Não existe login padrão.** O antigo `admin@exemplo.com / equipe123` foi
  removido; sem as variáveis do Supabase, nenhum login é aceito.

### Primeiro administrador

```bash
npm run gerar-hash
```

O comando pergunta o e-mail, o nome exibido e a senha. A senha é digitada de
forma oculta e confirmada em seguida. Ao final ele imprime o `INSERT` pronto
para colar no SQL Editor do Supabase.

A senha não é aceita por argumento e o comando exige um terminal interativo:
uma senha na linha de comando ficaria no histórico do terminal e visível na
lista de processos. Ela também não aparece na tela, não é gravada em disco e não
entra em log algum, nem vai para o banco, para o repositório ou para o
navegador.

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
| `/api/auth/login` | Pública | Valida credenciais e abre a sessão |
| `/api/auth/logout` | Pública | Revoga a sessão e limpa o cookie |
| `/api/auth/session` | Pública | Devolve a sessão atual (recuperação visual) |
| `/api/clients` | ADMIN | Lista e cria clientes |
| `/api/clients/[id]` | ADMIN | Lê, atualiza e exclui um cliente |
| `/api/clients/[id]/form` | ADMIN | Atualiza campos, privacidade e textos |
| `/api/clients/[id]/invite` | ADMIN | Ativa/desativa e renova o convite |
| `/api/clients/[id]/members` | ADMIN | Equipe de um cliente |
| `/api/members` | ADMIN | Lista e cadastra integrantes pelo painel |
| `/api/members/[id]` | ADMIN | Atualiza e exclui um integrante |
| `/api/public/convite/[token]` | Pública | Resolve o convite pelo token do link |
| `/api/public/convite/[token]/membros` | Pública | Recebe o cadastro do formulário |

O token do convite é opaco e aleatório: **nenhum dado pessoal vai para a URL**.
O banco guarda apenas o hash SHA-256 dele, por isso o endereço completo aparece
uma única vez, no momento em que é gerado. Para obter um link visível de novo,
use **Gerar novo token** — o anterior deixa de funcionar na hora.

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
│   └── api/                   Route Handlers: auth, clientes, integrantes
│                              e as rotas públicas do convite
├── proxy.ts                   Redirecionamento das rotas administrativas
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
    ├── repositories/          Interfaces + implementação HTTP (fonte oficial)
    │                          e a implementação local de referência
    ├── supabase/              Cliente PostgREST, Storage privado e variáveis
    ├── server/                Serviços server-only, guarda de permissão e
    │                          respostas de erro das rotas
    ├── mock/                  Dados de exemplo
    ├── auth/                  Senha scrypt, tokens e sessão do servidor
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
| `src/lib/server/auth.service.ts` | Login, sessão e revogação sobre `cmd_users`/`cmd_sessions` |
| `src/lib/server/guard.ts` | Confere sessão e permissão em toda rota administrativa |
| `src/lib/supabase/rest.ts` | Único caminho até o banco, sempre no servidor |
| `src/lib/supabase/storage.ts` | Upload, exclusão e URL assinada do bucket privado |
| `src/lib/validation/server.schema.ts` | Zod de tudo que chega ao servidor |
| `supabase/migrations/001_cmd_initial.sql` | Estrutura completa do banco |
| `src/proxy.ts` | Redirecionamento das rotas administrativas |

---

## Decisões de arquitetura

**Repositórios assíncronos.** As telas conversam apenas com as interfaces
`ClientRepository` e `MemberRepository`. A implementação ativa fala com as rotas
de API do próprio Next.js, que são o único caminho até o Supabase. A troca de
persistência não alterou nenhum componente de tela.

**Campos com ID estável.** Cada campo do formulário tem um ID interno que nunca
muda. As respostas são gravadas por ID, não por título — renomear um campo não
quebra os dados já coletados. Antes de excluir um campo, o sistema informa
quantos integrantes já responderam a ele.

**Campos nativos.** Foto, nome e telefone existem em todo formulário. Podem ser
renomeados e reordenados; nome e telefone não podem ser desativados e o nome
permanece obrigatório, porque identifica o integrante.

**Fotos.** A imagem é validada (JPG, PNG, WEBP), redimensionada e comprimida no
navegador. O servidor valida tipo e tamanho outra vez, grava o arquivo no bucket
privado `cmd-media` e guarda no banco apenas o caminho e os metadados. O
navegador só recebe URLs assinadas, com validade curta.

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
- `npm run build` — build de produção concluído, sem avisos
- Conferência de que nenhuma chave secreta aparece no pacote enviado ao
  navegador

**Não verificado nesta etapa:** o banco não foi executado nem testado
remotamente. Os SQLs de `supabase/` precisam ser aplicados no seu projeto
Supabase e o fluxo ponta a ponta conferido no navegador, conforme o passo 6 de
[`supabase/SETUP.md`](supabase/SETUP.md).

---

## Próximos passos

1. **Perfil EQUIPE** — acrescentar as permissões em
   `src/lib/permissions/index.ts` e criar as rotas correspondentes; a navegação
   já é filtrada por permissão e `cmd_users.role` já aceita `EQUIPE`.
2. **Gestão de usuários pelo painel** — criar e desativar ADMINs pela interface,
   reaproveitando `src/lib/auth/password.ts`.
3. **Exportação de dados** — CSV da equipe de um cliente, direto do servidor.
