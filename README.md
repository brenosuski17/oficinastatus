# OficinaStatus

Sistema de acompanhamento de ordens de serviço para oficina mecânica.

**Problema:** os clientes ligam várias vezes para saber do carro.
**Solução:** cada ordem de serviço (OS) passa por 7 etapas, e cada mudança avisa o cliente por e-mail e pelo bot do Telegram. O cliente acompanha tudo pelo celular e aprova o orçamento item por item, sem precisar ligar.

**Alunos:** Arthur Svidzinski e Breno Suski

| Entrar | Visão geral |
|---|---|
| ![Tela de login](docs/telas/entrar.png) | ![Visão geral da oficina](docs/telas/painel.png) |

| Pátio | Inspeção 3D |
|---|---|
| ![Pátio com os carros em cada etapa](docs/telas/patio.png) | ![Inspeção 3D com as avarias marcadas](docs/telas/vistoria.png) |

| Orçamentos | Mensagens |
|---|---|
| ![Lista de orçamentos](docs/telas/orcamentos.png) | ![Mensagens enviadas aos clientes](docs/telas/mensagens.png) |

| Portal do cliente | Acompanhamento pelo link |
|---|---|
| ![Portal do cliente com o orçamento para aprovar](docs/telas/cliente-portal.png) | ![Página pública de acompanhamento da OS](docs/telas/acompanhamento.png) |

Prints de desktop (1512×945) com os dados do `npm run seed`. A área do cliente também foi feita para o celular: veja `docs/telas/cliente-*.png`.

## Funcionalidades

**Área da oficina** (administrador e mecânico, tema escuro com menu lateral)
- **Visão geral** com faturamento do mês comparado ao anterior, situação das ordens, carros no pátio e últimas inspeções.
- **Pátio** com cada carro na coluna da sua etapa e a "estrada" de progresso de cada OS.
- **Inspeção 3D** em tela cheia: modelo do carro conforme a carroceria (hatch, sedã, SUV ou picape) e a cor cadastrada, vistas prontas (perspectiva, topo, laterais, frente, traseira), giro automático, marcadores e destaque das peças avariadas. Clicar numa peça abre o painel dela para **registrar avaria** ou **adicionar serviço sem avaria** (alinhamento, higienização…). O painel mostra o orçamento parcial e a **prévia do que o cliente vai ver**.
- **Veículos** em cartões com a última inspeção, histórico e atalho para a inspeção 3D.
- **Orçamentos** (ORC-ano-número) com filtro por situação, **Serviços** (catálogo de preços por categoria, editável pelo administrador) e **Histórico** de serviços encerrados.
- **Abertura de OS pela placa:** se o carro já veio antes, aparece na hora. Se for novo, a consulta por placa (PlacaFipe) preenche marca, modelo, ano e cor, e a busca na **API FIPE** traz o valor de referência.
- **7 etapas:** recebido → diagnóstico → orçamento → aprovação → execução (com "aguardando peça") → pronto → entregue. O servidor não deixa pular etapas.
- **Como a inspeção funciona:** um carro em 3D, modelado no próprio sistema, em que o mecânico clica no ponto danificado. A peça é reconhecida sozinha (porta dianteira direita, capô, farol…). Ele escolhe o tipo de avaria e a gravidade, e o sistema sugere os serviços da tabela de preços, com valor e tempo. **Gerar orçamento** transforma as avarias em itens da OS e, se ela estiver no diagnóstico, já o conclui. O cliente vê o carro com os pontos marcados no portal.
- **Orçamento por itens**, com peças e mão de obra separadas.
- **Mecânico responsável:** cada mecânico vê só as OS dele e as que ainda não têm responsável.
- **Fotos** da entrada, do diagnóstico, da execução e da entrega, tiradas direto pelo celular.
- **Mensagens:** cada envio e cada resposta ficam registrados com o status real (na fila, enviada, falha com o motivo ou respondida), com opção de tentar de novo.
- **Equipe e integrações:** convite de mecânicos por link e uma tela com o status de cada serviço externo, com botão de teste.

**Área do cliente**
- Portal com login, que mostra os veículos do cliente, as OS em andamento e o histórico de serviços.
- **Aprovação item por item:** o cliente marca o que quer fazer e vê o total na hora.
- Página de acompanhamento pelo link da mensagem, que funciona sem senha.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js 22.13+, Express, node-postgres (pg), JWT (jsonwebtoken), bcrypt, Nodemailer, Multer |
| Banco de dados | PostgreSQL 17, com migrations versionadas em `server/migrations` |
| Ambiente | Docker Compose (aplicação + PostgreSQL) |
| Front-end | React 19, Vite, Tailwind CSS 4, Motion (animações), Recharts, Lucide, Three.js + React Three Fiber (vistoria 3D) |
| APIs externas | [FIPE da Parallelum](https://github.com/parallelum/fipe-go) · [PlacaFipe](https://doc.placafipe.com.br/api/getplaca.html) · SMTP · [Telegram Bot API](https://core.telegram.org/bots/api) |
| Qualidade | ESLint e GitHub Actions (lint, testes e build a cada push e pull request) |
| Testes | `node:test`, com servidores SMTP e HTTP locais que recebem as mesmas requisições que os serviços reais e um schema descartável do PostgreSQL |

## Como rodar

### Com Docker (ambiente completo)

Pré-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp server/.env.example server/.env        # no Windows: copy server\.env.example server\.env
docker compose up --build                 # sobe o PostgreSQL e a aplicação e aplica as migrations
docker compose exec app node src/seed.js  # opcional, em outro terminal: dados de demonstração
```

Abra **http://localhost:3333**. Os dados e as fotos ficam em volumes do Docker e continuam lá depois de `docker compose down`. O comando `docker compose down -v` apaga tudo.

### Em desenvolvimento

Pré-requisitos: [Node.js](https://nodejs.org) 22 ou superior (versão LTS) e o Docker Desktop, usado só para o banco.

```bash
npm run instalar                          # instala raiz, servidor e cliente
cp server/.env.example server/.env        # no Windows: copy server\.env.example server\.env
docker compose up -d postgres             # PostgreSQL em localhost:5433
npm run migrate                           # cria ou atualiza as tabelas
npm run seed                              # opcional: apaga os dados e cria a demonstração
npm run dev                               # API em :3333 e site em :5173
```

Abra **http://localhost:5173**. O `npm run dev` e a aplicação do Compose usam a porta 3333, então pare um antes de subir o outro (`docker compose stop app`).

- **Sem o seed:** a primeira tela pede para criar a conta do administrador.
- **Com o seed (demonstração):** use a senha `oficina123` em todas as contas.
  - Oficina: `admin@oficina.com` (administrador), `arthur@oficina.com` e `rafael@oficina.com` (mecânicos).
  - Clientes: `ana@cliente.com`, `joao@cliente.com` (OS 12, com orçamento para aprovar), `marcia@cliente.com`, `luciana@cliente.com` e `fernanda@cliente.com` (OS 16, com vistoria 3D e orçamento gerado pelas avarias).
  - No fim, o seed lista as OS aguardando aprovação e os links públicos `/acompanhar/...` de cada uma.

**Aprovar ao vivo na apresentação.** As OS 12 (João, Strada) e 16 (Fernanda, Polo) ficam na etapa de aprovação, e o `server/test/seed.test.js` confere os três caminhos:
1. **Pelo portal:** entre como `fernanda@cliente.com`, abra a OS 16, veja as avarias no carro 3D e toque em **Aprovar**. A OS passa para a etapa de execução, e a tela da oficina mostra a mudança.
2. **Pelo link, sem login:** abra o link `/acompanhar/...` que o seed mostrou, no celular, e aprove por ali.
3. **Pelo Telegram, com o bot configurado:** os avisos do seed vão para chats fictícios. Ao subir o servidor, os da OS 12 falham com *chat not found* e aparecem na tela Mensagens. Entre como `joao@cliente.com`, toque em **Vincular outra conta** (o seed já deixa um vínculo fictício) e mande o `/start` no seu celular. Depois, como admin, em *Mensagens*, toque em **Tentar de novo** no orçamento da OS 12. O orçamento chega com os botões, e tocar em **Aprovar** move a OS.

Para rodar sem Docker como em produção, com um único servidor entregando a API e o site: `npm run build`, `npm run migrate` e depois `npm start`. Acesse http://localhost:3333 e ajuste `APP_URL` no `.env`.

Testes automatizados: `npm test --prefix server`, com o PostgreSQL do Compose no ar. Cada arquivo de teste usa um schema próprio, apagado no final, sem tocar nos seus dados. Para usar outro servidor, defina `TEST_DATABASE_URL`.

Para publicar na nuvem, veja [Deploy no Azure (Container Apps)](#deploy-no-azure-container-apps).

Lint: `npm run lint` (ESLint). A cada push e pull request, o [GitHub Actions](.github/workflows/ci.yml) roda o lint, os testes com um serviço PostgreSQL e o build do site.

### Banco de dados e migrations

A conexão vem de `DATABASE_URL` no `server/.env`. Para usar um banco gerenciado na nuvem, troque esse valor pela string de conexão do provedor (em geral com `?sslmode=require`) e rode `npm run migrate`. Como proteção, o `npm run seed` só apaga um banco remoto com `npm run seed -- --forcar`.

Para mudar o esquema, crie um novo arquivo numerado em `server/migrations`, como `002_nova_coluna.sql`, e rode `npm run migrate`. Cada arquivo roda uma vez, em ordem, e fica registrado na tabela `schema_migrations`. Não edite uma migration já aplicada: o comando recusa o arquivo alterado. O servidor não sobe se houver migrations pendentes.

### Modelo 3D do Golf (opcional)

Na inspeção 3D, os hatches da Volkswagen usam o modelo [**Volkswagen Golf GTI (2025)**](https://sketchfab.com/3d-models/volkswagen-golf-gti-2025-84fe6c2b9feb4c8a854d16f3daf33eab), de [geyges](https://sketchfab.com/geyges), no Sketchfab. A licença Free Standard do Sketchfab proíbe redistribuir o arquivo, por isso `client/public/modelos/golf.glb` está no `.gitignore` e não vem com o repositório. Sem ele, o sistema funciona normalmente e esses veículos aparecem com o carro desenhado, como todos os outros.

Para usar o modelo na sua máquina:

1. Com uma conta no Sketchfab, abra a [página do modelo](https://sketchfab.com/3d-models/volkswagen-golf-gti-2025-84fe6c2b9feb4c8a854d16f3daf33eab) e baixe-o no formato original.
2. Extraia o `.zip`. O arquivo usado é `source/golf_gti_my25_lights_on.glb`.
3. Depois de `npm run instalar`, gere a versão otimizada:

   ```bash
   node client/scripts/otimizar-golf.mjs caminho/para/golf_gti_my25_lights_on.glb
   ```

O script simplifica e comprime o modelo (de cerca de 18 MB para 2,3 MB), separa as peças para o clique da inspeção e grava `client/public/modelos/golf.glb`. Para rodar sem Docker como em produção, gere o arquivo antes do `npm run build`. A imagem do Docker não inclui o modelo, por causa da licença: nela, esses veículos aparecem com o carro desenhado.

## Configurando as integrações (`server/.env`)

O sistema funciona sem nenhuma integração, mas cada uma liga uma parte real do fluxo. Depois de alterar o `.env`, reinicie o servidor e confira em **Integrações**, no menu da oficina, onde há botões de teste.

### E-mail (Gmail)
1. Ative a verificação em duas etapas na conta Google.
2. Crie uma **senha de app** em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Preencha o `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=suaoficina@gmail.com
   SMTP_PASS=a senha de app de 16 letras
   SMTP_FROM=suaoficina@gmail.com
   ```

Com o e-mail ativo, o cliente recebe um aviso a cada etapa. O primeiro aviso já traz o link para ele criar a senha do portal.

### Telegram (bot)
O bot avisa o cliente a cada etapa e pede a aprovação do orçamento com os botões **Aprovar** e **Recusar**. Sem o token, o sistema continua funcionando e as mensagens ficam na fila até o bot ser configurado.

1. No Telegram, abra o [@BotFather](https://t.me/BotFather), envie `/newbot` e siga as instruções. Ele devolve o **token** e o **nome** do bot, que termina em `bot`.
2. Preencha o `.env`. O segredo é um texto longo que você inventa (só A-Z, a-z, 0-9, `_` e `-`):
   ```
   TELEGRAM_TOKEN=...
   TELEGRAM_BOT_USERNAME=nome_do_seu_bot
   TELEGRAM_WEBHOOK_SECRET=...
   ```
3. Com o servidor no ar (`npm run dev`), em outro terminal:
   ```bash
   npm run webhook
   ```
   O comando sobe um túnel do [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) e registra a URL no Telegram com `setWebhook`. O túnel expõe só a porta `WEBHOOK_PORT` (3334), que atende apenas o webhook. A URL muda a cada execução, e o comando registra a nova. Em produção, sem túnel: `npm run webhook -- --url https://seu-dominio`. Nesse modo, o comando confere antes se o domínio entrega o webhook (resposta 401 sem o segredo), recusa `http://` e mostra o `getWebhookInfo` no final.

#### Como funciona
- **Vínculo (opt-in):** o bot só fala com quem iniciou a conversa. O botão **Telegram**, no cadastro do cliente, e **Vincular Telegram**, no portal, geram o link `https://t.me/BOT?start=codigo`, que vale por 7 dias e uma única vez. Ao tocar em Iniciar, o `chat_id` é gravado em `canais_usuario`.
- **Envio:** cada aviso é gravado como `enfileirada` e enviado com `sendMessage` depois do commit. O `message_id` vai para `id_externo`, e o status passa a `enviada`. Cliente sem vínculo fica com `falha` e o motivo; depois de vincular, **Tentar de novo** envia.
- **Orçamento:** os botões aprovam todos os itens ou recusam a OS, marcam a mensagem como `respondida` e chamam `answerCallbackQuery`. Só a mensagem mais recente vale: se o orçamento mudar, os botões antigos deixam de valer. Para aprovar só parte dos itens, o cliente usa o link da mensagem.
- **Webhook `POST /webhook/telegram`:** confere o cabeçalho `X-Telegram-Bot-Api-Secret-Token` (401 se não conferir), responde 200 antes de processar e ignora `update_id` repetido. Toda mensagem e todo clique recebidos ficam em `mensagens`, com o `payload_bruto`.
- **Erros:** no 429, o envio espera o `retry_after` e tenta de novo; erros temporários usam backoff, até 5 tentativas. No 403 (o cliente bloqueou o bot), o vínculo é desativado. A descrição e o código do erro aparecem na tela **Mensagens**.

O Telegram não informa "entregue" nem "lida". O ciclo de cada mensagem é `enfileirada` → `enviada` ou `falha` → `respondida`, esta quando o cliente clica em um botão ou responde à mensagem do bot.

### Consulta por placa (PlacaFipe)
A consulta por placa é um serviço pago, porque não existe API oficial gratuita. Contrate um plano em [placafipe.com.br](https://placafipe.com.br) e preencha `PLACA_API_TOKEN=...`. Sem o token, o cadastro usa a busca em cascata da FIPE (marca → modelo → ano), que é gratuita.

### FIPE (Parallelum)
Funciona sem configurar nada, dentro do limite diário gratuito. Para aumentar o limite, use um token do [fipe.online](https://fipe.online) em `FIPE_TOKEN`.

## Deploy no Azure (Container Apps)

**No ar:** https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io

**Provedor escolhido:** Microsoft Azure, na **conta gratuita** (assinatura *Azure subscription 1*, com **US$ 200** de crédito).
**Caminho:** **serviço de contêiner gerenciado** (caminho 2 do Anexo B.3), com o **Azure Container Apps**.

**Por que o caminho 2:** o grupo começou pelo caminho 1, com uma VM e o Caddy. Mas a assinatura gratuita não libera nenhum tamanho de máquina virtual: na criação da VM, todos os tamanhos voltam com `NotAvailableForSubscription`. O Container Apps recebe a mesma imagem do `Dockerfile` e entrega o endereço público com HTTPS. Os arquivos do caminho 1 (`docker-compose.prod.yml`, `Caddyfile`, `deploy/instalar-vm.sh`) continuam no repositório como alternativa, mas não estão em uso. O Anexo B avisa que este caminho esconde parte da infraestrutura. Por isso a rede do banco ficou explícita, com VNet e Private Endpoint (veja o passo 5), e o domínio próprio continua obrigatório (passo 9).

| Peça | Serviço | Recurso em `rg-oficinastatus` (Brazil South) |
|---|---|---|
| Aplicação | **Azure Container Apps**, plano de consumo, 0,25 vCPU e 0,5 GiB, **1 réplica** | `oficinastatus`, no ambiente `oficinastatus-env` |
| Imagem | **Azure Container Registry Basic**, puxada pela identidade gerenciada do app (papel AcrPull, sem senha) | `oficinastatusbreno` |
| Banco | **Azure Database for PostgreSQL Flexible Server**, Burstable **B1ms**, 32 GB, PostgreSQL 17, sem alta disponibilidade | `oficinastatus-db-breno`, banco `oficina` |
| Rede do banco | **VNet** + **Private Endpoint** + zona DNS privada; **acesso público desligado** | `vnet-oficinastatus`, `pe-oficinastatus-db`, `privatelink.postgres.database.azure.com` |
| Segredos | **Secrets do Container Apps** (`database-url`, `jwt-secret`, `telegram-*`), não ficam em arquivo | no próprio app |
| HTTPS | Certificado gerenciado da Microsoft no domínio `*.azurecontainerapps.io`; HTTP redireciona para HTTPS | ingress do app |
| Logs | Log Analytics (5 GB por mês grátis) | `workspace-rgoficinastatuslwvb` |

String de conexão, **sem a senha**:
```
postgresql://oficina_admin:****@oficinastatus-db-breno.postgres.database.azure.com:5432/oficina?sslmode=require
```

### Como foi feito

Comandos do [Azure CLI](https://learn.microsoft.com/cli/azure/), com `az login` feito. No Windows, se o `az` não estiver no PATH, use `"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`.

#### 1. Grupo e banco
O grupo `rg-oficinastatus` e o servidor `oficinastatus-db-breno` foram criados pelo portal, com *Burstable B1ms*, 32 GB, sem alta disponibilidade e com o administrador `oficina_admin`. O banco da aplicação:
```bash
az postgres flexible-server db create -g rg-oficinastatus -s oficinastatus-db-breno -n oficina
```

#### 2. Registro da imagem (ACR Basic)
A imagem é montada na máquina do grupo e enviada ao registro. O `.dockerignore` deixa de fora o `.env`, o `server/data` e o `golf.glb`, cuja licença proíbe redistribuir.
```bash
az provider register -n Microsoft.App --wait
az provider register -n Microsoft.OperationalInsights --wait
az provider register -n Microsoft.ContainerRegistry --wait
az acr create -g rg-oficinastatus -n oficinastatusbreno --sku Basic -l brazilsouth
docker build -t oficinastatusbreno.azurecr.io/oficinastatus:<commit> .
az acr login -n oficinastatusbreno
docker push oficinastatusbreno.azurecr.io/oficinastatus:<commit>
```

#### 3. Rede: VNet, Private Endpoint e DNS privado
```bash
az network vnet create -g rg-oficinastatus -n vnet-oficinastatus -l brazilsouth --address-prefixes 10.20.0.0/16 \
  --subnet-name snet-containerapps --subnet-prefixes 10.20.0.0/27
az network vnet subnet update -g rg-oficinastatus --vnet-name vnet-oficinastatus -n snet-containerapps --delegations Microsoft.App/environments
az network vnet subnet create -g rg-oficinastatus --vnet-name vnet-oficinastatus -n snet-banco --address-prefixes 10.20.1.0/28
az network private-endpoint create -g rg-oficinastatus -n pe-oficinastatus-db -l brazilsouth --vnet-name vnet-oficinastatus \
  --subnet snet-banco --private-connection-resource-id <id do servidor> --group-id postgresqlServer --connection-name pe-oficinastatus-db
az network private-dns zone create -g rg-oficinastatus -n privatelink.postgres.database.azure.com
az network private-dns link vnet create -g rg-oficinastatus -z privatelink.postgres.database.azure.com -n link-oficinastatus \
  -v vnet-oficinastatus --registration-enabled false
az network private-endpoint dns-zone-group create -g rg-oficinastatus --endpoint-name pe-oficinastatus-db -n padrao \
  --private-dns-zone privatelink.postgres.database.azure.com --zone-name postgres
```
Dentro da VNet, o nome `oficinastatus-db-breno.postgres.database.azure.com` passa a apontar para o IP privado `10.20.1.4`. A `DATABASE_URL` continua a mesma, e o certificado TLS do servidor continua conferindo.

#### 4. Ambiente e aplicação
```bash
az containerapp env create -g rg-oficinastatus -n oficinastatus-env -l brazilsouth \
  --infrastructure-subnet-resource-id <id da snet-containerapps>
az containerapp create -g rg-oficinastatus -n oficinastatus --environment oficinastatus-env \
  --image oficinastatusbreno.azurecr.io/oficinastatus:<commit> \
  --registry-server oficinastatusbreno.azurecr.io --registry-identity system \
  --ingress external --target-port 3333 --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 \
  --secrets telegram-token=… telegram-bot-username=… telegram-webhook-secret=… jwt-secret=<aleatório> \
  --env-vars NODE_ENV=production APP_URL=https://<fqdn> TELEGRAM_TOKEN=secretref:telegram-token \
    TELEGRAM_BOT_USERNAME=secretref:telegram-bot-username TELEGRAM_WEBHOOK_SECRET=secretref:telegram-webhook-secret \
    JWT_SECRET=secretref:jwt-secret
```
- **Uma réplica no máximo:** a fila de envio fica em memória, e as transações são serializadas no processo.
- **Mínimo de uma réplica:** evita a espera da primeira requisição durante a apresentação. Para economizar depois, use `--min-replicas 0`.
- **`JWT_SECRET` fixo:** fica num secret, porque o contêiner não tem disco persistente. Sem ele, cada reinício geraria um segredo novo e deslogaria todo mundo.

A `DATABASE_URL` entra por último. O script [`deploy/definir-banco-azure.ps1`](deploy/definir-banco-azure.ps1) pede a senha no terminal, sem mostrá-la, monta a URL com `sslmode=require` e a grava no secret `database-url`:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\definir-banco-azure.ps1
```
Esse script também cria uma revisão nova do app, que sobe já conectada ao banco.

#### 5. Banco fechado para a internet
```bash
az postgres flexible-server update -g rg-oficinastatus -n oficinastatus-db-breno --public-access Disabled
```
O plano era deixar no firewall do banco só os IPs de saída do app. Só que, no Container Apps de consumo, eles vêm de um **pool regional compartilhado**: o app recebeu **181 IPs** do Brazil South, usados também por aplicativos de outros clientes do Azure, e o pool pode mudar. Liberar esses IPs equivaleria a abrir o banco para outros clientes. Por isso o banco ficou **sem acesso público e sem nenhuma regra de firewall**. O Azure nem aceita mais criar regras (`Firewall rule operations are not supported for a server without public access enabled`), e a única entrada é o Private Endpoint, dentro da VNet do app. Testado de fora: o nome do banco não resolve para um IP público, e a porta 5432 não responde.

A outra opção, um NAT Gateway com um único IP de saída fixo para colocar no firewall, custaria cerca de US$ 37 por mês, e o Anexo B.2 cita o NAT Gateway como caro e desnecessário.

#### 6. Migrations no banco da nuvem
O `CMD` do `Dockerfile` roda `node src/migrar.js` antes de subir o servidor. Na primeira subida, com o banco `oficina` vazio, o log mostra:
```
Migrations aplicadas: 001_inicial.sql, 002_telegram.sql
```
O log completo está em [`docs/deploy/migrations-azure.log`](docs/deploy/migrations-azure.log). Ele foi obtido com:
```bash
az containerapp logs show -g rg-oficinastatus -n oficinastatus --type console --tail 100
```
No Windows, se o comando falhar com `UnicodeEncodeError` por causa do `✔` do log, rode o Python do CLI em modo UTF-8:
```
"C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe" -X utf8 -IBm azure.cli containerapp logs show …
```
**Não rode o seed em produção:** ele apaga os dados e usa a senha `oficina123` em todas as contas.

#### 7. Testes pelo HTTPS (11/11/2026)
| Teste | Resultado |
|---|---|
| `GET /` e `/entrar` | 200, site carregado |
| `GET /api/saude` | 200, `{"ok":true}` |
| `GET /api/auth/estado` (lê o banco) | 200 |
| `http://` | 301 para `https://` |
| `POST /webhook/telegram` sem o segredo | 401 |
| Certificado | `CN=graystone-3f5d3230.brazilsouth.azurecontainerapps.io`, emitido por *Microsoft TLS G2 RSA CA OCSP 04*, TLS 1.3, aceito sem aviso (`Verify return code: 0`) |

Logo depois do deploy, crie o administrador em `/entrar`. Enquanto ele não existir, o primeiro acesso fica aberto a qualquer um que abra o endereço.

#### 8. Atualizar a aplicação
```bash
docker build -t oficinastatusbreno.azurecr.io/oficinastatus:<commit> .
docker push oficinastatusbreno.azurecr.io/oficinastatus:<commit>
az containerapp update -g rg-oficinastatus -n oficinastatus --image oficinastatusbreno.azurecr.io/oficinastatus:<commit>
```
Cada atualização cria uma revisão nova, que aplica as migrations pendentes antes de subir.

#### 9. Domínio próprio (falta)
O Anexo B.3 exige domínio próprio também no caminho 2. O domínio vai sair pelo GitHub Student Developer Pack. Quando sair:
1. **Zona e nameservers:** *DNS zones → Create* no `rg-oficinastatus`. Os **quatro** nameservers do *Overview* (`azure-dns.com`, `.net`, `.org` e `.info`) vão no painel do registrador.
2. **Registros:** num subdomínio, como `www`, crie um **CNAME** para `oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io` e um **TXT** `asuid.www` com o *Custom domain verification ID* do app:
   ```bash
   az containerapp show -g rg-oficinastatus -n oficinastatus --query properties.customDomainVerificationId -o tsv
   ```
   Na raiz (`@`), o CNAME não é permitido: use um **registro A** para o IP estático do ambiente (`az containerapp env show … --query properties.staticIp`) e um TXT `asuid`.
3. **Certificado gerenciado:** é gratuito e o Azure renova sozinho.
   ```bash
   az containerapp hostname add -g rg-oficinastatus -n oficinastatus --hostname www.<domínio>
   az containerapp hostname bind -g rg-oficinastatus -n oficinastatus --hostname www.<domínio> \
     --environment oficinastatus-env --validation-method CNAME
   ```
4. **`APP_URL`:** troque para o domínio novo, com `az containerapp update --set-env-vars APP_URL=https://www.<domínio>`.
5. **Webhook:** registre no domínio definitivo com `npm run webhook -- --url https://www.<domínio>` (usa o token do `server/.env` local, o mesmo do secret).

#### 10. Limitações conhecidas
- **Fotos das OS:** ficam em `server/data/uploads`, no disco do contêiner, e **se perdem a cada nova revisão ou reinício**. Para guardá-las de verdade, seria preciso montar um volume do Azure Files.
- **E-mail (SMTP):** ainda não foi configurado no app. Para ligar, grave os secrets com `az containerapp secret set` e referencie-os nas variáveis com `secretref:`, como nos do Telegram.

### Custo e controle de gasto

Estimativa com a menor configuração de cada peça. Os preços são de referência; confira os de Brazil South na [calculadora de preços](https://azure.microsoft.com/pricing/calculator/).

| Peça | Custo aproximado por mês |
|---|---|
| PostgreSQL B1ms + 32 GB | o maior item: confira na calculadora |
| Container Apps, 1 réplica de 0,25 vCPU e 0,5 GiB | de ~US$ 4, com o app ocioso, a ~US$ 15, com ele ativo o mês todo, já descontada a cota grátis do plano de consumo |
| ACR Basic | ~US$ 5 |
| Private Endpoint + zona DNS privada | ~US$ 8 |
| Log Analytics | dentro dos 5 GB grátis |

- **Alerta de gasto:** em *Cost Management → Budgets → + Add*, no escopo da assinatura *Azure subscription 1*, crie um orçamento mensal de US$ 100 com alertas *Actual* em **25 %, 50 % e 100 %**, que equivalem a US$ 25, 50 e 100, como pede o Anexo B.2. Os custos são avaliados a cada 24 horas, então o alerta não é instantâneo ([tutorial](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)).
- **Para economizar entre as aulas:**
  ```bash
  az containerapp update -g rg-oficinastatus -n oficinastatus --min-replicas 0   # o app dorme sem acesso
  az postgres flexible-server stop -g rg-oficinastatus -n oficinastatus-db-breno
  ```
  O [Azure religa o banco sozinho depois de 7 dias](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server). Parado, o armazenamento e os backups continuam sendo cobrados.
- **No fim do semestre:** `az group delete -n rg-oficinastatus` apaga tudo, depois da apresentação e do artigo.

### Roteiro de pesquisa (B.9)

**1. Como criar a menor instância no seu provedor, e quanto ela custa por mês?**
No caminho 2, a menor instância é uma réplica do Container Apps com 0,25 vCPU e 0,5 GiB, criada com `az containerapp create --cpu 0.25 --memory 0.5Gi` (passo 4). A estimativa está na tabela de custos acima. A menor VM burstable (`Standard_B1s`) não está disponível na assinatura gratuita: devolve `NotAvailableForSubscription`.

**2. Como criar uma instância PostgreSQL gerenciada, e como descobrir o endereço de conexão dela?**
Em *Azure Database for PostgreSQL flexible servers → Create*, com *Burstable B1ms* e 32 GB (passo 1). O endereço é o *Server name* do *Overview*, `oficinastatus-db-breno.postgres.database.azure.com`, na porta 5432. O TLS é obrigatório, daí o `?sslmode=require`. Com a versão atual do pacote `pg`, `require` também confere o certificado do servidor, como mostra o aviso no log das migrations.

**3. Como autorizar apenas a sua aplicação a acessar o banco?**
Com acesso privado, e não por firewall (passo 5). O app roda numa VNet, e o banco só é alcançável por um Private Endpoint nela, com o acesso público desligado. Os IPs de saída do Container Apps de consumo são compartilhados, e a opção *Allow public access from any Azure service* liberaria qualquer recurso do Azure, inclusive de outros clientes. Nunca `0.0.0.0/0`.

**4. Onde fica o serviço de DNS do provedor, e como se cria uma zona para o seu domínio?**
No **Azure DNS**, em *DNS zones → Create*, com o nome do domínio sem `www` (passo 9). A zona custa centavos por mês ([tutorial](https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns)).

**5. Quais nameservers o provedor devolveu, e onde eles são informados no registrador do domínio?**
O Azure devolve quatro, um de cada domínio (`azure-dns.com`, `.net`, `.org` e `.info`), listados no *Overview* da zona. Os quatro vão no painel do registrador, na opção de alterar os servidores DNS. É esse passo que entrega o domínio ao Azure.
- Nameservers e registrador: `<preencher quando o domínio sair>`

**6. O seu caso pede registro A ou CNAME? Por quê?**
**CNAME** num subdomínio (`www`), porque o Container Apps entrega um **nome** (`oficinastatus.graystone-3f5d3230…azurecontainerapps.io`), não um IP da aplicação. A raiz do domínio não aceita CNAME; nela vai um registro A para o IP estático do ambiente. Nos dois casos, o TXT `asuid` prova ao Azure que o domínio é seu.

**7. Qual é o mecanismo de certificado do provedor, e ele funciona na arquitetura que vocês escolheram?**
Funciona. O Container Apps tem **certificado gerenciado gratuito**, que o Azure emite e renova sozinho, para o domínio próprio (passo 9). O endereço `*.azurecontainerapps.io` já vem com o certificado da Microsoft, testado no passo 7. Por isso o Caddy e o Let's Encrypt do caminho 1 não são necessários.

**8. Como configurar um alerta de gasto por e-mail?**
Em *Cost Management → Budgets*, com orçamento mensal e alertas de 25 %, 50 % e 100 % (veja *Custo e controle de gasto*).

**9. Como parar a aplicação e o banco entre uma aula e outra, e o que continua sendo cobrado?**
O app escala para zero com `--min-replicas 0`. Sem réplica rodando, não há cobrança de processamento, mas o ACR, o Private Endpoint e os logs continuam. O banco para com `az postgres flexible-server stop`, e o armazenamento e os backups continuam sendo cobrados.

### Checklist da entrega (B.8)
- [x] Provedor escolhido e justificado (início desta seção)
- [x] Aplicação no ar em https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io, sem túnel
- [x] Banco gerenciado e string de conexão sem a senha
- [x] Banco fechado para a internet: sem acesso público, só pelo Private Endpoint (passo 5)
- [x] Migrations rodando no banco da nuvem: [`docs/deploy/migrations-azure.log`](docs/deploy/migrations-azure.log)
- [x] HTTPS válido no endereço do Azure (passo 7)
- [ ] Domínio próprio, DNS e certificado gerenciado (passo 9)
- [ ] Webhook do Telegram na URL definitiva (passo 9)
- [ ] Alerta de gasto configurado
- [ ] Prints para o relatório: recursos do grupo, Private Endpoint, banco com acesso público desligado, log das migrations, cadeado no navegador e consumo da assinatura

Fontes: [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/) · [Rede do Container Apps](https://learn.microsoft.com/azure/container-apps/networking) · [Private Link no Flexible Server](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-networking-private-link) · [Domínio próprio e certificado gerenciado](https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates) · [Parar o Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server) · [Azure DNS](https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns) · [Orçamentos no Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)

## Estrutura

```
oficinastatus/
├── server/
│   ├── migrations/               # esquema do banco em arquivos SQL numerados
│   ├── src/
│   │   ├── db.js                 # conexão com o PostgreSQL e transações
│   │   ├── migrar.js             # aplica as migrations (npm run migrate)
│   │   ├── config.js             # .env e status das integrações
│   │   ├── app.js                # rotas e tratamento de erros
│   │   ├── seed.js               # dados de demonstração
│   │   ├── routes/               # auth, equipe, clientes, veiculos, ordens, diversos
│   │   └── services/
│   │       ├── ordens.js         # regras das 7 etapas (máquina de estados)
│   │       ├── notificacao.js    # textos de cada aviso
│   │       ├── envio.js          # e-mail (SMTP) e Telegram, com fila e backoff
│   │       ├── telegram.js       # cliente da Bot API
│   │       ├── botTelegram.js    # /start, mensagens recebidas e botões do webhook
│   │       ├── canais.js         # vínculo (opt-in) pelo deep link
│   │       ├── auth.js           # login, JWT, convites e permissões
│   │       ├── placa.js          # consulta por placa (PlacaFipe)
│   │       ├── fipe.js           # API FIPE (Parallelum) com cache
│   │       └── relatorios.js     # indicadores do painel
│   ├── scripts/webhook.js        # npm run webhook: túnel + setWebhook (--url: domínio de produção)
│   ├── .env.example              # variáveis de desenvolvimento
│   ├── .env.production.example   # variáveis de produção, comentadas
│   └── test/                     # fluxo completo, vistoria, Telegram e PostgreSQL pela API
├── client/src/
│   ├── acesso/                   # entrar, primeiro acesso, criar senha
│   ├── oficina/                  # painel, quadro, OS, nova OS, cadastros, equipe, integrações
│   ├── cliente/                  # portal, detalhe da OS, página do link
│   ├── vistoria/                 # carro 3D, detecção da peça, painel de avarias
│   ├── ui/                       # placa Mercosul, trilha de etapas, botões, modais, avisos
│   └── lib/                      # API, login, formatos, etapas
├── deploy/
│   ├── definir-banco-azure.ps1   # grava a DATABASE_URL como secret do Container Apps (pede a senha)
│   └── instalar-vm.sh            # caminho 1 (VM), não usado: prepara uma VM Ubuntu com Docker
├── docs/deploy/                  # log das migrations no banco da nuvem
├── docs/                         # DER, fluxo de estados e telas
├── Dockerfile                    # imagem da aplicação (site + API)
├── docker-compose.yml            # desenvolvimento: aplicação + PostgreSQL
├── docker-compose.prod.yml       # produção: aplicação + Caddy, com banco gerenciado
└── Caddyfile                     # HTTPS automático com Let's Encrypt
```

## Banco de dados

O banco tem as cinco entidades pedidas (`clientes`, `veiculos`, `ordens_servico`, `etapas`, `mensagens`) e mais `canais_usuario`, `comunicacoes` (e-mails e registros do sistema), `usuarios`, `itens_orcamento`, `fotos`, `avarias`, `avaria_servicos` e `catalogo_servicos` (tabela de preços). Detalhes e cardinalidades estão em [docs/der.md](docs/der.md).

![DER](docs/der.png)

## API

Todas as rotas começam com `/api`. As rotas da oficina e do portal exigem o cabeçalho `Authorization: Bearer <token>`. Em caso de erro, a resposta traz `{ "erro": "mensagem" }`.

| Grupo | Rotas principais | Quem acessa |
|---|---|---|
| Acesso | `POST /auth/login`, `POST /auth/configurar`, `GET /auth/eu`, `GET\|POST /auth/convite/:token`, `POST /auth/esqueci` | todos |
| Ordens | `GET /ordens`, `GET /ordens/:id`, `POST /ordens` | equipe |
| Etapas | `POST /ordens/:id/diagnostico` · `/itens` · `/orcamento/enviar` · `/aprovacao` · `/execucao` · `/peca` · `/pronto` · `/entrega` · `/responsavel` · `/fotos` | equipe |
| Cadastros | `/clientes`, `/clientes/:id/convite`, `/clientes/:id/telegram`, `/veiculos`, `GET /veiculos/placa/:placa` | equipe |
| FIPE | `GET /fipe/:tipo/marcas[/:marca/modelos[/:modelo/anos[/:ano]]]` | equipe |
| Vistoria 3D | `GET /ordens/:id/avarias/sugestao?zona=&tipo=&gravidade=`, `POST /ordens/:id/avarias`, `PUT\|DELETE /ordens/:id/avarias/:avaria`, `POST /ordens/:id/avarias/orcamento`, `GET /catalogo`, `PUT /catalogo/:id` (admin) | equipe |
| Mensagens | `GET /mensagens`, `POST /mensagens/telegram\|email/:id/reenviar` | equipe |
| Gestão | `GET /relatorios/painel`, `/equipe`, `GET /integracoes`, `POST /integracoes/teste-email\|teste-telegram`, `POST /integracoes/telegram/vinculo` | admin |
| Webhook (fora de `/api`) | `POST /webhook/telegram` | Telegram (cabeçalho com o segredo) |
| Portal | `GET /portal/resumo`, `GET /portal/ordens/:id`, `POST /portal/ordens/:id/resposta`, `POST /portal/telegram` | cliente |
| Link público | `GET /publico/ordens/:codigo`, `POST /publico/ordens/:codigo/resposta` | qualquer um com o link |

O link público usa um código aleatório, não o número da OS. Assim, ninguém consegue ver a OS de outro cliente trocando o número na URL.

## Decisões de projeto

- **Regras no servidor:** a sequência das etapas e as permissões são validadas no back-end, não só na tela.
- **Envio depois do commit:** as mensagens são gravadas na mesma transação da mudança de etapa e só entram na fila de envio depois do commit. Se a transação for desfeita, nada é enviado. Se o envio falhar, a etapa não se perde, e o erro fica registrado para reenvio.
- **Transações em série:** uma trava do PostgreSQL (`pg_advisory_xact_lock`) faz as transações de escrita rodarem uma de cada vez. Assim, dois pedidos simultâneos não abrem duas OS para o mesmo veículo nem avançam a mesma etapa duas vezes.
- **Front-end sem acesso direto às APIs externas:** o servidor guarda os tokens, faz cache da FIPE e padroniza os erros.
