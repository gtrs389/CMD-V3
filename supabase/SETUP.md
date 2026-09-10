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
| 1 | `supabase/migrations/001_cmd_initial.sql` | Extensoes, tipos, tabelas `cmd_*`, indices, gatilhos de `updated_at`, RLS, revogacao de acesso para `anon` e `authenticated`, bucket privado `cmd-media`. |
| 2 | Saida de `npm run gerar-hash` (ou `supabase/seed/001_admin.example.sql` preenchido a mao) | Cria o primeiro ADMIN. |

O arquivo `001_cmd_initial.sql` e idempotente: pode ser executado novamente sem
apagar nada. Ele nao contem `DROP` nem qualquer comando destrutivo.

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

Confira que o usuario existe, sem exibir o hash:

```sql
select id, name, email, role, is_active, created_at from public.cmd_users;
```

---

## 3. Conferir o bucket

Em **Storage**, o bucket `cmd-media` deve aparecer como **privado**. As tabelas
guardam apenas o caminho do arquivo e os metadados. Upload, exclusao e geracao
de URL assinada acontecem no servidor, com validacao de tipo
(JPEG, PNG, WEBP) e de tamanho (2 MB).

---

## 4. Pegar as chaves

Em **Project Settings → API**:

- **Project URL** → vira `SUPABASE_URL`
- **Secret key** (antiga `service_role`) → vira `SUPABASE_SECRET_KEY`

A chave secreta ignora RLS. Ela so pode existir no servidor.

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

1. Abra o projeto → **Settings → Environment Variables**.
2. Adicione `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
3. Marque os ambientes **Production**, **Preview** e **Development**.
4. Deixe **Sensitive** ligado na chave secreta.
5. Faca um novo deploy para as variaveis entrarem em vigor.

Sem essas variaveis o sistema falha de forma segura: o login e recusado e o
painel volta para a tela de entrada com o aviso de configuracao ausente.

---

## 6. Conferencia final

1. Abra `/login` e entre com o e-mail e a senha do ADMIN.
2. Crie um cliente. O link de convite aparece uma unica vez, no momento em que
   e gerado: o banco guarda apenas o hash SHA-256 do token.
3. Abra o link em outro aparelho e envie um cadastro.
4. O cadastro deve aparecer na aba **Equipe** do cliente, no painel.

Se precisar do link de novo, use **Gerar novo token** na aba **Convite**. O
endereco anterior deixa de funcionar na hora.

---

## 7. O que este projeto nao usa

- `supabase.auth` em qualquer forma
- tabela `auth.users`
- Auth.js
- usuarios criados pelo painel **Authentication**
- politicas RLS baseadas em `auth.uid()`

As tabelas `cmd_*` ficam com RLS habilitado e **sem nenhuma policy**, e o acesso
de `anon` e `authenticated` e revogado. Somente o servidor do Next.js, com a
chave secreta, consegue ler ou escrever.
