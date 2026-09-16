# CMD — Configuracao do Supabase

Passo a passo para ligar o **Cadastro Mobilizacao Digital (CMD)** ao seu projeto
Supabase. Nada aqui usa Supabase Authentication: nao crie usuarios no painel
**Authentication**, nao use `auth.users` nem politicas com `auth.uid()`.

Todo acesso ao banco acontece no servidor do Next.js, com a chave secreta.
Nenhuma tela consulta o Supabase diretamente.

---

## 1. Ordem exata dos SQLs

Abra **SQL Editor** no painel do Supabase e execute, nesta ordem:

| Ordem | Arquivo | O que faz |
| --- | --- | --- |
| 1 | `supabase/migrations/001_cmd_initial.sql` | Tipos, tabelas `cmd_*`, constraints, indices, gatilhos de `updated_at`, RLS, revogacao de acesso de `PUBLIC`/`anon`/`authenticated` e concessao ao `service_role`. |
| 2 | Saida de `npm run gerar-hash` (ou `supabase/seed/001_admin.example.sql` preenchido a mao) | Cria o primeiro ADMIN e revoga as sessoes antigas dele. |

O arquivo `001_cmd_initial.sql` roda inteiro dentro de uma transacao (`begin` /
`commit`): ou tudo e aplicado, ou nada e. Ele e idempotente, pode ser executado
novamente sem apagar nada, e nao contem `DROP` nem qualquer comando destrutivo.

O bucket de fotos **nao** e criado por SQL. Depois da migration, siga o
passo 3.

---

## 2. Gerar o hash da senha do ADMIN

Na sua maquina, dentro do projeto, em um terminal interativo:

```bash
npm install
npm run gerar-hash
```

O comando pergunta, nesta ordem:

1. **E-mail do administrador**
2. **Nome exibido** (opcional, o padrao e "Administrador")
3. **Senha**, com digitacao oculta
4. **Confirmacao da senha**, tambem oculta

Ao final ele imprime um bloco `insert into public.cmd_users ...` ja com o hash
`scrypt`. Copie esse bloco inteiro e execute no **SQL Editor**.

Regras:

- **Nao passe a senha por argumento.** O comando recusa qualquer argumento: uma
  senha na linha de comando fica no historico do terminal e visivel na lista de
  processos da maquina.
- O comando exige um terminal interativo. Sem TTY (pipe, redirecionamento ou
  automacao) ele para, porque nao teria como ocultar a digitacao.
- A senha nao aparece na tela, nao e gravada em disco e nao entra em nenhum log.
- A senha em texto puro nunca vai para o banco, para o repositorio nem para o
  navegador.
- O hash tem o formato `scrypt$<salt-hex>$<hash-hex>`, com salt aleatorio por
  usuario.
- Rodar o comando de novo para o mesmo e-mail troca a senha (o `on conflict`
  atualiza o hash e destrava a conta).

O SQL gerado roda dentro de uma transacao. Alem de criar ou atualizar o ADMIN,
ele **revoga todas as sessoes abertas desse usuario**: trocar a senha derruba
qualquer cookie que ainda estivesse valendo.

Confira que o usuario existe, sem exibir o hash:

```sql
select id, name, email, role, is_active, created_at from public.cmd_users;
```

---

## 3. Criar o bucket privado das fotos

A migration nao mexe em `storage.buckets`. Escrever direto nessa tabela
contorna a logica do proprio Storage e pode divergir entre versoes do Supabase.
Use a API oficial.

### Opcao A: pelo comando (recomendada)

Com `SUPABASE_URL` e `SUPABASE_SECRET_KEY` ja definidos em `.env.local` ou no
ambiente:

```bash
npm run configurar-storage
```

O comando cria o bucket se ele nao existir e, se ja existir, confere e corrige
as configuracoes. E idempotente: pode ser executado quantas vezes for preciso,
sem apagar nada e sem tocar em nenhum arquivo ja enviado. A chave nunca e
exibida.

Ao final ele imprime o estado do bucket:

```
  bucket ............ cmd-media
  privado ........... sim
  limite por arquivo  2 MB
  tipos aceitos ..... image/jpeg, image/png, image/webp
```

### Opcao B: pelo painel

Se preferir nao rodar o comando, faca em **Storage → New bucket**:

| Campo | Valor |
| --- | --- |
| Name | `cmd-media` |
| Public bucket | **desmarcado** |
| Restrict file size | ligado, `2` MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

Se o bucket ja existir, ajuste em **Storage → cmd-media → Configuration**.

Nao crie nenhuma policy de Storage: sem policy, `anon` e `authenticated` nao
acessam nada. As tabelas guardam apenas o caminho do arquivo e os metadados.
Upload, exclusao e geracao de URL assinada acontecem no servidor.

---

## 4. Pegar as chaves

Em **Project Settings → API**:

- **Project URL** → vira `SUPABASE_URL`
- **Secret key** (`sb_secret_...`) → vira `SUPABASE_SECRET_KEY`

A chave secreta ignora RLS. Ela so pode existir no servidor.

Nao use a chave publicavel (`sb_publishable_...`): o sistema a recusa na
inicializacao, porque ela nao consegue fazer o trabalho administrativo e
falharia de forma silenciosa por RLS.

Projetos antigos ainda mostram a chave `service_role` em formato JWT. Ela
continua funcionando por `SUPABASE_SERVICE_ROLE_KEY`, apenas como reserva
legada. As duas formas sao aceitas: a chave e sempre enviada no cabecalho
`apikey`, e o `Authorization: Bearer` so acompanha as chaves antigas, que sao
JWT de fato.

---

## 5. Variaveis de ambiente

| Variavel | Obrigatoria | Para que serve |
| --- | --- | --- |
| `SUPABASE_URL` | sim | Endereco https do projeto Supabase. |
| `SUPABASE_SECRET_KEY` | sim | Chave secreta do projeto. Somente no servidor. |
| `SUPABASE_SERVICE_ROLE_KEY` | nao | Aceita apenas como reserva legada de `SUPABASE_SECRET_KEY`. |

Nenhuma delas pode ter o prefixo `NEXT_PUBLIC_`. Com o prefixo, o valor seria
embutido no pacote enviado ao navegador.

### Local

```bash
cp .env.example .env.local
# preencha SUPABASE_URL e SUPABASE_SECRET_KEY
npm run dev
```

### Vercel

> **A chave do banco de producao vai somente no ambiente Production.**
> Preview e Development apontam para projetos Supabase separados, ou ficam sem
> configuracao. Nunca reutilize a chave de producao nesses ambientes.

Por que isso importa: qualquer branch gera um deploy de Preview, e qualquer
pessoa com acesso ao repositorio pode abrir um. Uma chave de producao ali da
acesso total ao banco real, com RLS ignorado, a partir de codigo que ainda nao
foi revisado.

**Producao**

1. Abra o projeto → **Settings → Environment Variables**.
2. Adicione `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
3. Marque **apenas** o ambiente **Production**.
4. Deixe **Sensitive** ligado na chave secreta.
5. Faca um novo deploy para as variaveis entrarem em vigor.

**Preview e Development**

Escolha uma das duas:

- **Projeto Supabase separado** (recomendado para quem testa em Preview): crie
  outro projeto no Supabase, rode nele a migration, o `npm run gerar-hash` e o
  `npm run configurar-storage`, e cadastre as variaveis desse projeto marcando
  somente **Preview** e **Development**.
- **Sem configuracao**: nao cadastre as variaveis nesses ambientes. Os deploys
  de Preview sobem, mas recusam qualquer login e exibem o aviso de configuracao
  ausente, que e o comportamento seguro.

Se a chave de producao ja tiver sido usada em Preview ou Development, gere uma
nova chave secreta no Supabase, atualize apenas o ambiente Production e revogue
a anterior.

Sem essas variaveis o sistema falha de forma segura: o login e recusado e o
painel volta para a tela de entrada com o aviso de configuracao ausente.

---

## 6. Dominios

O sistema e servido em TRES enderecos, e cada um tem uma porta so dele. Hoje
eles sao:

| Endereco | Para que serve |
| --- | --- |
| `7061696e656c2061646d.appdemo.sbs` | SO o ADMIN geral entra por aqui. E o unico endereco que serve a tela de e-mail e senha. |
| `painel.appdemo.sbs` | Por onde o Administrador do time e a equipe entram, pelo link de acesso do proprio time + telefone. Nao ha tela de e-mail e senha aqui. |
| `www.appdemo.sbs` | SO OS CADASTROS: Formulario 1 e Formulario 2, os links que vao por WhatsApp. Ninguem entra no sistema por este endereco. |

Aponte os tres para o mesmo deploy (na Vercel, **Settings -> Domains**). Nao e
um endereco por projeto: e o mesmo projeto respondendo aos tres, e quem separa
os papeis e `src/proxy.ts`, a cada requisicao.

**Nao e preciso configurar variavel nenhuma** para esse desenho: sem
`CMD_PANEL_HOST` e `CMD_ADMIN_HOST`, valem os rotulos `painel.` e
`7061696e656c2061646d.`. As variaveis existem so para quem usa outros rotulos.

### Quando o dominio mudar

O CODIGO NAO MUDA. `src/lib/domain/hosts.ts` nunca soube qual e o dominio: ele
trabalha com os rotulos e deduz um endereco do outro (`painel.x` vira `www.x`),
qualquer que seja o dominio abaixo deles. O que precisa ser feito e:

1. apontar os tres enderecos novos para o deploy, e emitir os certificados;
2. conferir **Configuracoes -> "Entrada pelo dominio publico"**, no painel do
   ADMIN. Os dois campos dali ficam gravados no banco e MANDAM na frente da
   deducao — preenchidos com o dominio velho, todo convite novo sairia
   apontando para um dominio que nao responde mais, e nenhum acerto de DNS
   consertaria isso. Deixar os dois em branco tambem resolve: vazio quer
   dizer "deduza", e a deducao ja da o dominio certo sozinha;
3. se a troca ja aconteceu com enderecos gravados, rode a migration de troca
   correspondente (a `037_troca_de_dominio.sql` fez isso para
   `convitetimebezerra.com` -> `appdemo.sbs`).

O endereco `*.vercel.app` da propria publicacao continua aceitando o login do
ADMIN. Essa e a SAIDA DE EMERGENCIA: se o DNS do endereco exclusivo cair ou
ainda nao estiver no ar, o ADMIN entra por ele.

---

## 7. Conferencia final

1. Confira que o bucket existe: `npm run configurar-storage` deve terminar com
   "Storage configurado".
2. Abra `/login` e entre com o e-mail e a senha do ADMIN.
3. Crie um cliente. O link de convite aparece uma unica vez, no momento em que
   e gerado: o banco guarda apenas o hash SHA-256 do token.
4. Abra o link em outro aparelho e envie um cadastro.
5. O cadastro deve aparecer na aba **Equipe** do cliente, no painel.

Se precisar do link de novo, use **Gerar novo token** na aba **Convite**. O
endereco anterior deixa de funcionar na hora.

---

## 8. O que este projeto nao usa

- `supabase.auth` em qualquer forma
- tabela `auth.users`
- Auth.js
- usuarios criados pelo painel **Authentication**
- politicas RLS baseadas em `auth.uid()`

As tabelas `cmd_*` ficam com RLS habilitado e **sem nenhuma policy**, e o acesso
de `anon` e `authenticated` e revogado. Somente o servidor do Next.js, com a
chave secreta, consegue ler ou escrever.
