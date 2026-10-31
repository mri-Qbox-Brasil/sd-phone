# Controle remoto (MRI)

Usar o celular do jogo pelo celular de verdade, de qualquer pessoa e em qualquer navegador:
o jogador abre **Ajustes > Controle remoto > Mostrar código**, lê o QR code com a câmera e a
tela do celular do jogo aparece no celular dele, ao vivo, pra usar com o dedo (tocar, arrastar
pra rolar, digitar com o teclado do celular, Voltar, Início, pegar e guardar o celular).

## Como funciona

1. O NUI pede um código (`mri:remote:open`). O servidor gera um token de 128 bits, válido por
   5 minutos e uma vez só, e devolve o caminho `/sd-phone/remote/<token>`.
2. O QR leva à página `mri/remote/index.html`, servida pelo próprio resource no HTTP do
   servidor, com os textos já traduzidos no idioma do celular e a lista de ICE (STUN e o TURN
   da Cloudflare, se o servidor tiver, o mesmo das chamadas de vídeo).
3. A página cria a oferta WebRTC e manda por `POST .../offer`. O servidor segura essa
   requisição, entrega a oferta ao jogador (`mri_sdphone:remote:offer`) e devolve a resposta
   SDP do NUI (`mri_sdphone:remote:answer`). O código não abre mais a página, só serve os
   arquivos da tela (abaixo) até a conexão cair.
4. Dali em diante tudo vai pelo data channel, direto entre os dois aparelhos (P2P). O servidor
   não vê a tela, os toques nem o texto.

O NUI recria o toque como eventos de ponteiro e mouse na tela do celular (`[data-phone-screen]`),
rola a lista sob o dedo (com inércia) e aplica o texto no campo focado. Senha sai do jogo só
como pontos.

## Tela ao vivo

Não é vídeo: o CEF do FiveM não captura a própria tela. O NUI grava o HTML da página com o
[rrweb](https://github.com/rrweb-io/rrweb) (`web/src/mri/remote/mirror.ts`): uma foto inteira
ao conectar e, depois, só o que muda, em lotes de 30 ms, picados em pedaços de 16 KB. O
celular remonta a página num iframe com o replayer do rrweb (`mri/remote/vendor`, MIT) e
recorta só a tela do celular, cuja posição o NUI manda a cada 200 ms. Transição e animação de
CSS rodam no próprio celular, então ficam lisas e o texto fica nítido em qualquer tamanho.

O HTML aponta pra `https://cfx-nui-<resource>/...`, que só o jogo abre. A página troca isso
por `/sd-phone/remote/<token>/f/<resource>/...`, e o servidor entrega o arquivo enquanto
aquela conexão estiver viva. Só fonte, CSS e imagem, de resource ligado, sem `..`. O navegador
passa o host pra minúsculo (`cfx-nui-mri_qwhatzapp`), então o servidor acha o resource sem
diferenciar maiúscula.

Canvas grande (câmera, jogo em canvas) não entra no HTML: vai como vídeo de verdade. A página
já abre a conexão com um canal de vídeo só de recepção; o NUI pega o maior canvas visível na
tela do celular (15% da tela ou mais), manda com `captureStream` a 24 quadros por segundo e diz
qual nó do rrweb ele é. A página põe um `<video>` no lugar desse canvas, com as mesmas classes
e estilo, então os botões por cima (o disparador da câmera) continuam por cima.

A gravação só roda com o celular conectado. Se o celular remoto não der conta (mais de 4 MB
na fila), os eventos são descartados e vai uma foto inteira nova quando a fila esvazia.

## App na tela de início

Ao conectar pelo QR, o servidor salva aquele celular (chave de 128 bits ligada à license do
jogador, no KVP do resource, até 5 por jogador) e a página troca a própria URL por
`/sd-phone/remote/app/<chave>`, com manifest (`display: fullscreen`) e ícone. É esse endereço
que vai pra tela de início. Aberto de lá, ele manda a oferta pra `.../app/<chave>/offer`: se o
dono estiver no servidor, chega no celular do jogo dele e conecta sem QR; se não, a página
mostra que está esperando e tenta de novo a cada 5 segundos. **Ajustes > Controle remoto >
Esquecer celulares salvos** apaga todas as chaves do jogador.

Tela cheia: no iPhone, o app da tela de início abre sem a barra do Safari. No Android, a página
pede tela cheia no primeiro toque e tem o botão no topo. O "Instalar app" do Chrome só aparece
em HTTPS (`sd_phone_remote_url`); em `http://` o caminho é o menu do navegador, e a página
mostra a dica.

## Endereço que vai no QR

Embaixo do QR fica a lista **Rede**, pra o jogador escolher qual endereço vai no código. A
escolha fica salva pros próximos códigos. A lista, na ordem:

- convar `sd_phone_remote_url` (ex.: `set sd_phone_remote_url "https://celular.minhacidade.com"`),
  pra quem põe um domínio com HTTPS na frente do servidor (proxy reverso pra porta do FXServer).
  O caminho `/sd-phone/remote/<token>` é somado no fim.
- `http://<ip>:<porta>` que o jogador usou pra conectar (`GetCurrentServerEndpoint`), se não for
  127.0.0.1.
- cada adaptador de rede IPv4 da máquina do servidor, com o nome do Windows (Wi-Fi, Ethernet,
  vEthernet do WSL...) e a porta do jogo. Rede local vem antes, adaptador virtual por último.

Sem escolha salva, vale o primeiro da lista.

O proxy `*.users.cfx.re` está desativado pela Cfx (`deprecated-...`), por isso não é usado.

## Limites

- P2P sem TURN depende da rede: na mesma Wi-Fi sempre conecta; no 4G contra a casa do jogador
  pode falhar (NAT simétrico). Com `sd_cf_turn_token_id` e `sd_cf_turn_api_token` configurados
  (os mesmos das chamadas de vídeo), passa pelo TURN.
- A porta do FXServer (TCP, a mesma do jogo) precisa estar aberta pra fora, como já está pra
  conectar.
- Vai como vídeo só um canvas por vez (o maior). Canvas pequeno, canvas dentro de app custom,
  `<video>` e imagem em `blob:` ficam vazios no espelho.
- A chave do app é como uma senha: quem tiver a URL controla o celular do jogo enquanto o dono
  estiver online. Celular perdido: Esquecer celulares salvos.

## Arquivos

| Arquivo | O quê |
| --- | --- |
| `mri/server/remote.lua` | sessões, página, sinalização; põe o `SetHttpHandler` do upstream atrás do dele |
| `mri/server/lanip.js` | adaptadores de rede IPv4 do servidor, pra lista Rede |
| `mri/client/remote.lua` | callbacks do NUI, monta os endereços do QR |
| `mri/remote/index.html` | página que abre no celular de verdade |
| `web/src/mri/remote/` | sessão WebRTC, gravação da tela, injeção de toque e texto, página do Ajustes |
| `mri/remote/vendor/` | replayer do rrweb 2.1.7 (MIT) que a página carrega |
| `mri/remote/icons/` | ícones do app (180, 192 e 512) |
