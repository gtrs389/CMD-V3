# Planilhas de locais de votação

Aqui fica o CSV dos **locais de votação do TSE**, que abastece a tabela
`cmd_polling_places` (migration 042). É com ele que o sistema descobre a
escola onde cada pessoa vota — por UF + zona + seção —, sem consultar
provedor nenhum e sem custo por cadastro.

O arquivo **não é versionado** (`.gitignore`): é dado público, grande, e vive
melhor fora do repositório. O que é versionado é o comando que o carrega.

## Antes de tudo

Rode a migration `042_locais_de_votacao.sql` no SQL Editor do Supabase — é ela
que cria a tabela de destino. Depois, escolha **um** dos dois caminhos abaixo.

## Caminho 1: pelo terminal (recomendado)

```bash
# confere o arquivo e não grava nada
npm run importar-locais -- supabase/dados/locais-de-votacao.csv --conferir

# carrega de verdade
npm run importar-locais -- supabase/dados/locais-de-votacao.csv
```

Sem caminho, o comando procura `supabase/dados/locais-de-votacao.csv`. Ele usa
`SUPABASE_URL` e `SUPABASE_SECRET_KEY` do ambiente ou do `.env.local` — as
mesmas que a aplicação já usa.

## Caminho 2: pelo painel do Supabase

**Não importe o CSV direto na tabela `cmd_polling_places`.** O importador do
painel entrega o texto cru ao Postgres, e a planilha do TSE vem com coordenada
em vírgula decimal. O erro é este:

```
ERROR: 22P02: invalid input syntax for type double precision: "-9,25912678"
```

Não é só a coordenada: "Seções neste local" é uma lista em texto, o CEP vem com
e sem tracinho, e as colunas têm nome em português. O caminho certo pelo painel
está em **`carga-pelo-painel.sql`**, aqui nesta pasta, em três passos:

1. rode o **PASSO 1** do arquivo (cria `cmd_locais_csv`, tudo texto);
2. no painel: **Table Editor → `cmd_locais_csv` → Insert → Import data from
   CSV**. Como todas as colunas são texto, nada é recusado;
3. rode o **PASSO 2** (converte e grava em `cmd_polling_places`).

O resultado é idêntico ao do comando: mesmas linhas aceitas, mesmas ignoradas.

## Colunas esperadas

As colunas são encontradas **pelo nome**, sem depender da ordem, e acento,
caixa e pontuação não atrapalham. Separador (`,`, `;` ou tabulação), aspas,
BOM do Excel e coordenada com vírgula decimal são reconhecidos sozinhos.

| Coluna | Vira | Obrigatória |
| --- | --- | --- |
| UF | `uf` | sim |
| Cód. município | `city_code` | sim |
| Município | `city` | sim |
| Zona | `zone` | sim |
| Local de votação (escola) | `name` | sim |
| Tipo de local | `place_type` | não |
| Endereço | `address` | não |
| Bairro | `district` | não |
| CEP | `postal_code` | não |
| Latitude | `latitude` | não |
| Longitude | `longitude` | não |
| Qtd. seções | `section_count` | não |
| Seções neste local | `sections` | sim |

Linha sem UF, município, zona ou local é **ignorada**, e o comando diz
quantas foram e mostra as primeiras. Número comprido demais (código de
município com quinze dígitos, zona com oito) também derruba a linha, e de
propósito: ele estouraria a coluna do banco e levaria junto o lote inteiro.

## O que o comando garante

- **Não duplica.** A chave é UF + município + zona + local: rodar de novo, ou
  rodar com a planilha de mais um estado, atualiza no lugar e acrescenta o
  que faltava.
- **Não apaga nada.** Não existe `DELETE` no comando.
- **Junta a mesma escola.** Se a planilha traz o mesmo local em duas linhas
  (uma por faixa de seções), as seções são somadas em uma linha só.
- **Não inventa coordenada.** Local sem latitude/longitude — vazia, com lixo
  (`N/D`) ou zerada — é carregado e encontrado na busca, mas não vira pino no
  mapa.
- **Uma linha torta não derruba a carga.** Ela fica de fora; o resto entra.

Estado por estado funciona: carregue um CSV por UF, na ordem que quiser.
