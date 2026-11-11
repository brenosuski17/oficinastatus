# Roteiro da apresentação (5 minutos)

OficinaStatus, de Arthur Svidzinski e Breno Suski: o cliente da oficina recebe um aviso a cada etapa da OS, pelo
Telegram e por e-mail, e aprova o orçamento pelo celular.

**Endereço:** https://oficinastatus.com.br. Se o domínio não estiver no ar, use
https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io, que é o mesmo app.

## Antes de começar (5 minutos antes)

- [ ] **App acordado e no ar:** abrir o site. Com uma réplica sempre ligada, ele responde na hora. Conferir `/api/saude` → `{"ok":true}`.
- [ ] **Abas abertas:**
  - o admin logado em *Pátio*;
  - o link público da OS 16 no celular;
  - um terminal com os comandos da seção 2;
  - o portal do Azure no grupo `rg-oficinastatus`.
- [ ] **Telegram:** no celular, conversa com o `@oficinastatus_breno_bot` aberta.
- [ ] **Senhas:** são as que vocês definiram com o `deploy/trocar-senhas.ps1`. A `oficina123` não vale mais.

## 1. O problema e a solução (0:00 a 0:30)

"O cliente liga várias vezes para saber do carro. No OficinaStatus, cada OS passa por 7 etapas, de recebido a
entregue. Cada mudança avisa o cliente pelo bot do Telegram e por e-mail, e o orçamento é aprovado por um botão no
Telegram ou pelo link, sem ligação."

## 2. Onde roda: os requisitos de publicação (0:30 a 1:15)

Mostrar rapidamente, sem ler:

```bash
nslookup oficinastatus.com.br         # devolve o IP do ambiente do Azure (A); www é CNAME para o Container Apps
curl -I https://oficinastatus.com.br  # 200, com HTTPS válido (mostrar o cadeado no navegador e o emissor)
curl -i -X POST https://oficinastatus.com.br/webhook/telegram   # 401: sem o segredo, o webhook recusa
```

1. **Aplicação:** Azure Container Apps (caminho 2 do Anexo B), porque a assinatura gratuita não libera nenhum tamanho de VM.
2. **Banco:** PostgreSQL Flexible Server gerenciado, **sem acesso público**. A única entrada é um Private Endpoint dentro da VNet do app.
3. **Migrations:** rodaram no banco vazio da nuvem, no `docs/deploy/migrations-azure.log`.
4. **Segredos:** ficam nos secrets do Container Apps, e não em arquivo.
5. **Custo:** orçamento de US$ 100 com alertas em 25, 50 e 100 %.

## 3. Demonstração ao vivo (1:15 a 4:00)

1. **Login (admin).** *Pátio*: cada carro na coluna da sua etapa.
2. **Abrir a OS 16** (Fernanda, Polo, aguardando aprovação). A *estrada* mostra as 7 etapas, e o servidor não deixa pular nenhuma.
3. **Inspeção 3D:**
   - abrir a inspeção da OS 16 e girar o carro;
   - mostrar as 4 avarias marcadas nas peças;
   - passar o mouse e clicar numa peça: o sistema reconhece sozinho a porta dianteira direita, o farol e assim por diante;
   - mostrar o crédito do modelo no canto. São modelos do Sketchfab com licença CC BY e CC BY-SA, um por carroceria, pintados com a cor cadastrada do veículo.
4. **Orçamento:** gerado a partir das avarias, com peças e mão de obra. Mostrar a *Prévia do cliente*.
5. **Aprovar pelo Telegram** (OS 12, João, Strada):
   - entrar como `joao@cliente.com` e tocar em **Vincular outra conta**. Abrir o link no celular e mandar `/start`; o `chat_id` fica em `canais_usuario`;
   - como admin, em *Mensagens*, tocar em **Tentar de novo** no orçamento da OS 12;
   - o orçamento chega no Telegram com os botões **Aprovar** e **Recusar**. Tocar em **Aprovar**;
   - na oficina, a OS 12 vai para *Execução*. Em *Mensagens*, o orçamento fica com o status **respondida**.
6. **Plano B, se o Telegram falhar:** abrir o link público da OS 16 no celular e aprovar por ali.

## 4. Por dentro (4:00 a 4:45)

- **Mensagens:** toda mensagem enviada ou recebida fica em `mensagens`, com os nomes da tabela do Anexo A.5. Ela guarda o `id_externo` (o `message_id`) e o `payload_bruto`, e o status segue o ciclo `enfileirada → enviada / falha → respondida`.
- **Webhook:**
  - confere o cabeçalho `X-Telegram-Bot-Api-Secret-Token`;
  - responde 200 antes de processar;
  - ignora `update_id` repetido;
  - no erro 429, espera o `retry_after`; no 403, desativa o vínculo.
- **Segunda API:** a FIPE da Parallelum traz o valor de referência na abertura da OS.
- **Qualidade:** GitHub Actions roda lint, os 40 testes de integração e o build a cada push.

## 5. Fechamento (4:45 a 5:00)

"Está publicado com domínio, HTTPS e banco gerenciado fechado. O cliente acompanha e aprova pelo Telegram, sem
precisar ligar."

## Perguntas prováveis

**Por que Container Apps e não uma VM?**
A assinatura gratuita do Azure devolveu `NotAvailableForSubscription` para todos os tamanhos de VM. O Anexo B aceita
o caminho 2, e o domínio próprio continua obrigatório, o que foi feito.

**Como só a aplicação acessa o banco?**
O banco está com o acesso público desligado e não tem nenhuma regra de firewall. O app fica numa VNet, e o banco
tem um Private Endpoint nela (IP privado 10.20.1.4). A regra por IP não servia: os IPs de saída do Container Apps
(181) são um pool compartilhado com outros clientes do Azure.

**Onde ficam os segredos?**
Nos secrets do Container Apps: `database-url`, `jwt-secret` e `telegram-*`. A senha do banco foi digitada num
script que não mostra nem grava. Nada disso vai para o Git.

**A ou CNAME?**
A raiz não aceita CNAME, então usa registro A para o IP estático do ambiente. O `www` usa CNAME para o endereço
do Container Apps. Os TXT `asuid` provam ao Azure que o domínio é nosso.

**Quem emite o certificado?**
O certificado gerenciado do Container Apps, que é gratuito e renovado pelo Azure. O emissor está anotado no README.

**Telegram não informa "lido". Como vocês sabem que o cliente viu?**
Pelo status `respondida`, que vem do clique no botão. É o que o Anexo A.2.1 pede.

**E se o cliente bloquear o bot?**
O Telegram devolve 403, o vínculo é desativado e a mensagem fica como `falha`, com o motivo, na tela *Mensagens*.

**E o 429?**
O envio espera o `retry_after` e tenta de novo. Erros temporários usam backoff, com até 5 tentativas.

**As migrations rodaram mesmo na nuvem?**
Sim. O app roda as migrations antes de subir, e o log da primeira subida com o banco vazio está em
`docs/deploy/migrations-azure.log`.

**Quanto custa?**
O maior item é o banco B1ms. O ACR Basic sai por cerca de US$ 5 por mês e o Private Endpoint, por cerca de US$ 8.
Com uma réplica ligada, o Container Apps fica entre US$ 4 e 15. Para economizar entre as aulas, dá para pôr o app
com zero réplicas e parar o banco.

**De onde vêm os carros 3D?**
Do Sketchfab, com licença CC BY 4.0 (Golf, Creta e Hilux) e CC BY-SA 4.0 (Corolla). O crédito aparece na tela, e
as licenças estão no README. O script `otimizar-modelo.mjs` deixa cada um com 1,5 a 2,5 MB e separa as peças para
o clique.
