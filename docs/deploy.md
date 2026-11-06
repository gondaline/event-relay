# Deploy: a API vem antes do Worker

A API e o Worker dependem um do outro. O Worker só encerra uma mensagem quando a resposta traz o cabeçalho `X-EventRelay-Retry-Handled: true`, enviado pela rota `POST /deliveries/:id/retry`. Esse cabeçalho mostra que a resposta veio mesmo da API, e não de um túnel ou servidor no meio do caminho.

## Ordem do deploy

1. **Atualize a API.** O Worker que já está no ar ignora o cabeçalho, então continua funcionando normalmente.
2. **Confirme que a API envia o cabeçalho.** Um ID inválido não envia nenhum webhook, então este teste é seguro:

   ```bash
   curl -i -X POST -H "Authorization: Bearer <WORKER_AUTH_TOKEN>" <URL_DA_API>/deliveries/abc/retry
   ```

   A resposta deve ser `400` e trazer `X-EventRelay-Retry-Handled: true`.
3. **Faça o deploy do Worker**, com `npx wrangler deploy`, dentro de `retry-worker`.
4. **Repita um teste real de retry**, com um destino que falhe e depois responda 200.

## O que acontece na ordem errada

Com o Worker novo e a API antiga, nenhuma resposta traz o cabeçalho. O Worker então trata todas como desconhecidas e pede nova tentativa:

- As mensagens ficam sendo repetidas até irem para a DLQ, mesmo quando a entrega deu certo.
- Um webhook já entregue não é enviado de novo, porque a API responde `ALREADY_DELIVERED`.

Para desfazer um deploy, siga a ordem inversa: primeiro o Worker, depois a API.
