# Banner do convite (celular)

O formulário público, aberto pelo link de cadastro em telas abaixo de 768px,
exibe aqui o banner oficial do time.

Coloque o arquivo de produção exatamente neste caminho:

    public/banner/convite-mobile.png

Regras:

- use o arquivo original, sem recorte, redimensionamento, recompressão ou
  qualquer reprocessamento;
- a proporção e a resolução são as do próprio arquivo: o componente serve a
  imagem com largura total e altura automática, então nada é esticado nem
  cortado, e não existe borda branca;
- enquanto o arquivo não estiver aqui, o topo da tela mostra a faixa de
  convite de sempre, sem quebrar nada.

A identificação `#TIME {NOME}` e `#{CÓDIGO}` NÃO faz parte da imagem. Ela é
uma camada de texto desenhada por cima, posicionada em porcentagem da própria
imagem, em `src/components/public/InviteBanner.tsx`.
