# Proteção contra SSRF

SSRF acontece quando alguém faz o servidor chamar um endereço que não deveria alcançar, como um serviço interno ou os metadados de uma nuvem. O EventRelay envia requisições para URLs cadastradas, por isso precisa dessa proteção.

## O que é verificado

| Regra | Onde |
|---|---|
| Somente `http://` e `https://` | Cadastro e envio |
| Sem usuário ou senha na URL | Cadastro |
| Bloqueio de endereços locais, privados e reservados, em IPv4 e IPv6 | Cadastro e envio |
| O domínio é resolvido no DNS, e todos os IPs devolvidos precisam ser públicos | Cadastro e envio |
| Redirecionamentos não são seguidos | Envio |

A checagem de endereços está em [`src/utils/isSafeUrl.js`](../src/utils/isSafeUrl.js). Os testes estão em [`test/ssrf.test.js`](../test/ssrf.test.js) e rodam com `npm test`.

## Desenvolvimento local

URLs locais ficam bloqueadas por padrão. Para testar com o `test-server`, adicione ao `.env`:

```
ALLOW_PRIVATE_URLS=true
```

Com esse valor, as checagens de endereço e de DNS são desligadas. A configuração é ignorada quando `NODE_ENV=production`, então o ambiente de produção precisa definir `NODE_ENV=production`.

## Limitações conhecidas

- **DNS rebinding:** o EventRelay consulta o DNS para validar o destino, e o `fetch` consulta de novo ao enviar. Um domínio malicioso pode responder com um IP público na primeira consulta e com um IP interno na segunda. Eliminar isso exigiria fixar o IP validado na conexão ou usar um proxy de saída.
- **Rede interna:** a aplicação não substitui o isolamento da rede. Em produção, um firewall de saída deve impedir o acesso a serviços internos, mesmo que uma checagem falhe.
- **Serviços públicos:** um endereço público que encaminha requisições para uma rede interna não é detectado, porque o bloqueio só enxerga o IP de destino.
- **Destinos que redirecionam:** como redirecionamentos não são seguidos, o endpoint precisa ser cadastrado com a URL final. Uma resposta 3xx é registrada como falha.
- **Bloqueio durante o envio:** um envio bloqueado é registrado como `FAILED`, sem código HTTP, igual a um destino sem resposta. Por isso, ele segue as regras atuais de retry até o limite de tentativas, sem nunca chamar o destino.
- **Falha de DNS:** se o DNS não responder, a URL é recusada, já que não há como verificá-la. No cadastro isso resulta em erro 400.
- **Tempo de resposta:** a consulta de DNS pode levar até 3 segundos antes do envio, que tem seu próprio timeout de 5 segundos.
