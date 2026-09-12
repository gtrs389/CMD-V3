# Banner do convite (celular)

O formulário público, aberto pelo link de cadastro em telas abaixo de 768px,
exibe o banner oficial do time no topo.

## De onde vem a imagem

O endereço está em `src/components/public/InviteBanner.tsx`, na constante
`INVITE_BANNER_SRC`. Hoje ele aponta para o arquivo publicado no Storage do
projeto:

    https://zpfhqweydlujotqbuwse.supabase.co/storage/v1/object/public/imagem_url/00.png

O navegador baixa o arquivo original, byte a byte. Nada no código recorta,
estica, converte, recomprime ou reprocessa a imagem: o `img` recebe largura
total e altura automática, então a proporção e a resolução são as do próprio
arquivo, e não existe borda branca.

## Para servir de dentro do projeto

Se preferir não depender do Storage, coloque o arquivo original aqui:

    public/banner/convite-mobile.png

e troque `INVITE_BANNER_SRC` para `/banner/convite-mobile.png`. Use o arquivo
como veio, sem redimensionar nem recomprimir.

## A identificação não faz parte da imagem

`#TIME {NOME}` e `#{CÓDIGO}` são uma camada de texto desenhada por cima,
posicionada em porcentagem da própria imagem, no mesmo componente. A imagem
em si nunca é alterada.
