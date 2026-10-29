# Controle remoto (MRI)

Usar o celular do jogo pelo celular de verdade, de qualquer pessoa e em qualquer navegador:
o jogador abre **Ajustes > Controle remoto > Mostrar código**, lê o QR code com a câmera e a
tela do celular dele vira um touchpad do celular do jogo (tocar, arrastar pra rolar, digitar
com o teclado do celular, Voltar, Início, pegar e guardar o celular).

## Como funciona

1. O NUI pede um código (`mri:remote:open`). O servidor gera um token de 128 bits, válido por
   5 minutos e uma vez só, e devolve o caminho `/sd-phone/remote/<token>`.
2. O QR leva à página `mri/remote/index.html`, servida pelo próprio resource no HTTP do
   servidor, com os textos já traduzidos no idioma do celular e a lista de ICE (STUN e o TURN
   da Cloudflare, se o servidor tiver, o mesmo das chamadas de vídeo).
3. A página cria a oferta WebRTC e manda por `POST .../offer`. O servidor segura essa
   requisição, entrega a oferta ao jogador (`mri_sdphone:remote:offer`) e devolve a resposta
   SDP do NUI (`mri_sdphone:remote:answer`). O código morre aí.
4. Dali em diante tudo vai pelo data channel, direto entre os dois aparelhos (P2P). O servidor
   não vê os toques nem o texto.

O NUI recria o toque como eventos de ponteiro e mouse na tela do celular (`[data-phone-screen]`),
rola a lista sob o dedo (com inércia) e aplica o texto no campo focado. Senha sai do jogo só
como pontos.

## Endereço que vai no QR

Na ordem:

- convar `sd_phone_remote_url` (ex.: `set sd_phone_remote_url "https://celular.minhacidade.com"`),
  pra quem põe um domínio com HTTPS na frente do servidor (proxy reverso pra porta do FXServer).
  O caminho `/sd-phone/remote/<token>` é somado no fim.
- senão, `http://<ip>:<porta>` que o jogador usou pra conectar (`GetCurrentServerEndpoint`).
  Jogador no mesmo PC do servidor (127.0.0.1) recebe o IP da rede local da máquina.

O proxy `*.users.cfx.re` está desativado pela Cfx (`deprecated-...`), por isso não é usado.

## Limites

- P2P sem TURN depende da rede: na mesma Wi-Fi sempre conecta; no 4G contra a casa do jogador
  pode falhar (NAT simétrico). Com `sd_cf_turn_token_id` e `sd_cf_turn_api_token` configurados
  (os mesmos das chamadas de vídeo), passa pelo TURN.
- A porta do FXServer (TCP, a mesma do jogo) precisa estar aberta pra fora, como já está pra
  conectar.
- Não espelha a imagem da tela: o jogador olha o monitor e usa o celular como touchpad.

## Arquivos

| Arquivo | O quê |
| --- | --- |
| `mri/server/remote.lua` | sessões, página, sinalização; põe o `SetHttpHandler` do upstream atrás do dele |
| `mri/server/lanip.js` | IP da rede local, pro jogador no mesmo PC do servidor |
| `mri/client/remote.lua` | callbacks do NUI, monta a URL do QR |
| `mri/remote/index.html` | página que abre no celular de verdade |
| `web/src/mri/remote/` | sessão WebRTC, injeção de toque e texto, página do Ajustes |
