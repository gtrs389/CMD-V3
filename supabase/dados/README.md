# Planilhas de locais de votação

Aqui fica o CSV dos **locais de votação do TSE**, que abastece a tabela
`cmd_polling_places` (migration 042). É com ele que o sistema descobre a
escola onde cada pessoa vota — por UF + zona + seção —, sem consultar
provedor nenhum e sem custo por cadastro.

O arquivo **não é versionado** (`.gitignore`): é dado público, grande, e vive
melhor fora do repositório. O que é versionado é o comando que o carrega.

## Como carregar

```bash
# confere o arquivo e não grava nada
npm run importar-locais -- supabase/dados/locais-de-votacao.csv --conferir

# carrega de verdade
npm run importar-locais -- supabase/dados/locais-de-votacao.csv
```

Sem caminho, o comando procura `supabase/dados/locais-de-votacao.csv`.

Antes de carregar, rode a migration `042_locais_de_votacao.sql` no SQL Editor
do Supabase — é ela que cria a tabela.

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
quantas foram e mostra as primeiras.

## O que o comando garante

- **Não duplica.** A chave é UF + município + zona + local: rodar de novo, ou
  rodar com a planilha de mais um estado, atualiza no lugar e acrescenta o
  que faltava.
- **Não apaga nada.** Não existe `DELETE` no comando.
- **Junta a mesma escola.** Se a planilha traz o mesmo local em duas linhas
  (uma por faixa de seções), as seções são somadas em uma linha só.
- **Não inventa coordenada.** Local sem latitude/longitude é carregado e
  encontrado na busca, mas não vira pino no mapa.

Estado por estado funciona: carregue um CSV por UF, na ordem que quiser.
