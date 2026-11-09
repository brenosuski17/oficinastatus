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

Para publicar na nuvem, veja [Deploy no Azure for Students](#deploy-no-azure-for-students).

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

## Deploy no Azure for Students

**Provedor escolhido:** Microsoft Azure, com o Azure for Students, que não pede cartão de crédito e inclui um Flexible Server de PostgreSQL gratuito por 12 meses.
**Caminho:** máquina virtual com Docker (caminho 1 do Anexo B), que mostra a máquina, o firewall, o DNS e o certificado.

| Peça | Serviço |
|---|---|
| Aplicação | VM Linux **B1s**, com `docker-compose.prod.yml` |
| HTTPS | Caddy na própria VM, com certificado do Let's Encrypt |
| Banco | **Azure Database for PostgreSQL Flexible Server B1MS**, com `sslmode=require` |
| Webhook | `https://<seu-domínio>/webhook/telegram`, URL fixa e sem túnel |

**Atenção ao crédito:** o Anexo B fala em US$ 200, mas a [página do Azure for Students](https://azure.microsoft.com/en-us/free/students) oferece **US$ 100**. Confira o valor da sua conta.

**Falta testar no Azure real:** este roteiro foi escrito a partir da documentação. O `deploy/instalar-vm.sh` foi testado num container Ubuntu 24.04, e o compose de produção foi conferido localmente, com um banco local e sem o Let's Encrypt. Os menus do portal podem ter nomes um pouco diferentes.

### Passo a passo

A ordem importa: o certificado só sai depois que o DNS aponta para a VM, e o DNS precisa do IP da VM. Anote os valores marcados com `<preencher>` à medida que aparecerem: são as respostas do [roteiro B.9](#roteiro-de-pesquisa-b9).

**Antes de criar qualquer recurso:** simule a VM e o banco na [calculadora de preços](https://azure.microsoft.com/pricing/calculator/) e anote o preço (pergunta 1).

#### 1. Alerta de gasto
*Cost Management → Budgets → + Add*, no escopo da assinatura *Azure for Students*.
1. Orçamento mensal (*Monthly*) de **US$ 100**.
2. Três alertas do tipo *Actual*, em **25 %, 50 % e 100 %**, que equivalem a US$ 25, 50 e 100, como pede o Anexo B. Em todos, coloque o seu e-mail.
3. Adicione `azure-noreply@microsoft.com` aos remetentes confiáveis do e-mail.

> **[Print 1: orçamento com os três alertas configurados]**

#### 2. Grupo de recursos
*Resource groups → Create*, com um nome como `oficinastatus-rg`. Escolha uma região permitida pela assinatura: o Azure for Students restringe algumas, e o portal avisa. Crie **tudo** neste grupo e nesta região. No fim do semestre, apagar o grupo apaga tudo.

#### 3. Máquina virtual B1s
*Virtual machines → Create → Azure virtual machine*:
1. **Imagem:** Ubuntu Server 24.04 LTS (x64). **Tamanho:** `Standard_B1s` (1 vCPU, 1 GB). Pode estar em *See all sizes*.
2. **Autenticação:** chave SSH. Usuário `azureuser`. Baixe a chave `.pem` quando o portal oferecer.
3. **Portas de entrada:** SSH (22), HTTP (80) e HTTPS (443).
4. **Disco:** o padrão, sem aumentar. **Rede:** IP público novo com atribuição *Static*.
5. *Review + create*. Depois de criada, em *Networking*, restrinja a regra da porta 22 ao seu IP (*Source: My IP address*).

- IP público da VM: `<preencher>`

> **[Print 2: Overview da VM, com o tamanho B1s, a região e o IP público]**
> **[Print 3: regras de entrada da VM, com 80 e 443 abertas e 22 só para o seu IP]**

#### 4. PostgreSQL Flexible Server B1MS
*Azure Database for PostgreSQL flexible servers → Create*:
1. **Workload type:** *Development*. **Compute + storage:** *Burstable*, **B1ms**, **32 GB**, sem *autogrow*. **Alta disponibilidade:** desligada. **Backup:** 7 dias, sem redundância geográfica.
2. **Versão:** a mais recente oferecida. **Autenticação:** *PostgreSQL authentication only*. Crie um usuário administrador, como `oficinaadmin`, e uma senha forte, diferente da de desenvolvimento.
3. **Networking:** *Public access (allowed IP addresses)*. Em *Firewall rules*, adicione só o IP da VM do passo 3 (veja o passo 5). **Não** marque *Allow public access from any Azure service*.
4. Depois de criado, em *Databases → + Add*, crie o banco `oficina`.
5. Monte a `DATABASE_URL` com o *Server name* do *Overview*:
   ```
   DATABASE_URL=postgresql://oficinaadmin:<senha>@<nome>.postgres.database.azure.com:5432/oficina?sslmode=require
   ```
   Caracteres especiais da senha vão em formato de URL (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).

- *Server name*: `<preencher>`
- String de conexão, **sem a senha**: `postgresql://oficinaadmin:****@<preencher>.postgres.database.azure.com:5432/oficina?sslmode=require`

> **[Print 4: Overview do banco, com o Server name e o tamanho Burstable B1ms]**

#### 5. Banco fechado para a internet
Em *Networking* do servidor, confirme que existe **uma única regra**, com início e fim iguais ao IP da VM. Não pode existir regra `0.0.0.0` a `255.255.255.255`, nem a opção *Allow public access from any Azure service*. Se precisar acessar o banco do seu computador, adicione o seu IP só durante o uso e retire depois.

> **[Print 5: regra de firewall do banco mostrando só o IP da VM]**

#### 6. Zona de DNS, nameservers e registro A
1. *DNS zones → Create*, no mesmo grupo, com o nome do domínio sem `www` (ex.: `oficinastatus.com.br`).
2. No *Overview* da zona, copie os **quatro** nameservers (`ns1-XX.azure-dns.com`, `.net`, `.org` e `.info`).
3. No painel do registrador, troque os servidores DNS do domínio por esses quatro. No Registro.br: *Domínio → DNS → Alterar servidores DNS*.
4. Na zona, *+ Record set*: nome `@`, tipo **A**, TTL **300** segundos, valor igual ao IP da VM.
5. Espere a delegação, que pode levar de minutos a horas, e confira do seu computador:
   ```bash
   nslookup -type=NS <seu-domínio>   # devem aparecer os nameservers do Azure
   nslookup <seu-domínio>            # deve devolver o IP da VM
   ```

- Domínio: `<preencher>` · Registrador: `<preencher>`
- Nameservers: `<preencher os quatro>`

> **[Print 6: zona de DNS com os nameservers e o registro A]**
> **[Print 7: tela do registrador com os nameservers do Azure]**
> **[Print 8: saída do nslookup devolvendo o IP da VM]**

#### 7. Preparar a VM
Do seu computador, entre na VM e rode o script de instalação. Ele cria o swap, instala o Docker e o plugin compose, clona este repositório em `~/oficinastatus` e cria o `server/.env` com `JWT_SECRET` e `TELEGRAM_WEBHOOK_SECRET` aleatórios:
```bash
ssh -i <chave>.pem azureuser@<IP-da-VM>
curl -fsSL https://raw.githubusercontent.com/brenosuski17/oficinastatus/main/deploy/instalar-vm.sh -o instalar-vm.sh
bash instalar-vm.sh
exit   # saia e entre de novo, para o usuário entrar no grupo docker
```

#### 8. Preencher o `.env` de produção
```bash
ssh -i <chave>.pem azureuser@<IP-da-VM>
nano ~/oficinastatus/server/.env
```
Cada variável está comentada no arquivo, que é cópia do [`server/.env.production.example`](server/.env.production.example). O mínimo:

| Variável | Valor |
|---|---|
| `DOMINIO` | o domínio, sem `https://` |
| `APP_URL` | `https://` + o domínio |
| `DATABASE_URL` | a do passo 4, com `?sslmode=require` |
| `TELEGRAM_TOKEN`, `TELEGRAM_BOT_USERNAME` | do @BotFather |
| `NOME_OFICINA`, `TELEFONE_OFICINA`, `ENDERECO_OFICINA` | dados da oficina |

O `server/.env` fica só na VM, com `chmod 600` e fora do Git. O ideal do Anexo B é guardar os segredos no Azure Key Vault; este arquivo é o mínimo aceito, com senha forte e própria de produção.

#### 9. Subir a aplicação (migrations no banco da nuvem)
```bash
cd ~/oficinastatus
docker compose --env-file server/.env -f docker-compose.prod.yml up -d --build   # a primeira vez leva alguns minutos
docker compose --env-file server/.env -f docker-compose.prod.yml logs app        # deve mostrar "Migrations aplicadas: 001_..., ..."
```
O banco está vazio, então as migrations criam o esquema do zero, o que prova o versionamento. **Não rode o seed em produção.**

> **[Print 9: log das migrations rodando no banco da nuvem]**

#### 10. HTTPS pelo Caddy
Com o DNS apontando para a VM e as portas 80 e 443 abertas, o Caddy pede o certificado ao Let's Encrypt na primeira subida. Abra `https://<seu-domínio>` e clique no cadeado. Se o navegador acusar o certificado, veja `docker compose --env-file server/.env -f docker-compose.prod.yml logs caddy`. O erro mais comum é o DNS ainda não apontar para a VM.

Em seguida, crie o administrador em `https://<seu-domínio>/entrar`.

- Emissor do certificado: `<preencher>` (ex.: Let's Encrypt, R11)

> **[Print 10: cadeado no navegador, com o emissor do certificado]**

#### 11. Webhook do Telegram na URL definitiva
```bash
docker compose --env-file server/.env -f docker-compose.prod.yml exec app node scripts/webhook.js --url https://<seu-domínio>
```
O comando confere se o domínio entrega o webhook (resposta 401 sem o segredo), registra o `setWebhook` com o segredo e mostra o `getWebhookInfo`. Para testar, mande `/start` para o bot. O túnel do `npm run webhook` sem `--url` é só para desenvolvimento.

> **[Print 11: getWebhookInfo apontando para https://<seu-domínio>/webhook/telegram]**

#### 12. Conferir e controlar o custo
Repasse o [checklist B.8](#checklist-da-entrega-b8). Em *Cost Management → Cost analysis*, confira o consumo até o momento.

> **[Print 12: consumo da assinatura até o momento]**

Entre uma aula e outra, pare a VM e o banco (pergunta 9). Para voltar: *Start* no banco, *Start* na VM, e os containers sobem sozinhos (`restart: unless-stopped`). As fotos das OS ficam no volume `dados_app`, no disco da VM, sem backup automático. O banco tem os backups do serviço gerenciado.

### Roteiro de pesquisa (B.9)

**1. Como criar a menor instância de máquina virtual no seu provedor, e quanto ela custa por mês?**
Pelo portal, em *Virtual machines → Create* (passo 3). A menor da família burstable usada aqui é a **Standard_B1s** (1 vCPU, 1 GB de RAM). O Azure for Students inclui 750 horas por mês de B1s nos primeiros 12 meses, o que cobre uma VM ligada o mês inteiro. Fora do benefício, e para o disco e o IP, o custo sai do crédito. Mudar o tamanho da VM tira o benefício.
- Preço na calculadora em `<preencher data>`: US$ `<preencher>` por mês, na região `<preencher>`.

**2. Como criar uma instância PostgreSQL gerenciada, e como descobrir o endereço de conexão dela?**
Em *Azure Database for PostgreSQL flexible servers → Create*, com *Burstable B1ms* e 32 GB, que o benefício inclui por 12 meses (passo 4). O endereço é o *Server name* do *Overview*, no formato `<nome>.postgres.database.azure.com`, porta 5432. O TLS é obrigatório, daí o `?sslmode=require`. Com a versão atual do pacote `pg`, `sslmode=require` também confere o certificado do servidor. Se a conexão falhar por causa do certificado, leia a mensagem do erro antes de trocar para `uselibpqcompat=true&sslmode=require`, que criptografa mas não confere o certificado.

**3. Como autorizar apenas a sua aplicação a acessar o banco?**
Com o acesso público restrito por firewall: uma regra só, com o IP público estático da VM (passo 5). Sem a opção *Allow public access from any Azure service*, que liberaria qualquer recurso do Azure, inclusive de outros clientes, e nunca com `0.0.0.0/0`. A alternativa mais fechada é o acesso privado (VNet), que tira o IP público do banco, mas exige configurar a rede virtual e foge do escopo.

**4. Onde fica o serviço de DNS do provedor, e como se cria uma zona para o seu domínio?**
No **Azure DNS**, em *DNS zones → Create*, com o nome do domínio sem `www` (passo 6). A zona custa centavos por mês. Veja o [tutorial da Microsoft](https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns).

**5. Quais nameservers o provedor devolveu, e onde eles são informados no registrador do domínio?**
O Azure devolve quatro, um de cada domínio (`azure-dns.com`, `.net`, `.org` e `.info`), listados no *Overview* da zona. Os **quatro** são informados no painel do registrador, na opção de alterar os servidores DNS. É este passo que entrega o domínio ao Azure.
- Nameservers e registrador: ver o passo 6.

**6. O seu caso pede registro A ou CNAME? Por quê?**
**Registro A**, porque a aplicação está numa VM com IP público estático. CNAME serviria se o provedor entregasse um nome em vez de um IP, como num balanceador ou num serviço de contêiner. Além disso, a raiz do domínio (`@`) não aceita CNAME.

**7. Qual é o mecanismo de certificado do provedor, e ele funciona na arquitetura que vocês escolheram? Se não funcionar, qual é a alternativa?**
Os certificados gerenciados do Azure são do App Service, do Front Door e do Application Gateway. Eles não se instalam numa VM comum, então **não funcionam nesta arquitetura**. A alternativa do Anexo B é o **Let's Encrypt com o Caddy** na própria VM (veja o `Caddyfile`). O Caddy pede e renova o certificado sozinho e guarda o certificado no volume `caddy_dados`, para não pedir de novo a cada reinício. Exige o DNS já apontando para a VM e as portas 80 e 443 abertas.

**8. Como configurar um alerta de gasto por e-mail?**
Em *Cost Management → Budgets*, com um orçamento mensal e alertas por percentual com o seu e-mail (passo 1). Com orçamento de US$ 100, os alertas de 25 %, 50 % e 100 % disparam em US$ 25, 50 e 100. Os custos são avaliados a cada 24 horas, então o alerta não é instantâneo. Veja o [tutorial da Microsoft](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets).

**9. Como parar a VM e o banco entre uma aula e outra, e o que continua sendo cobrado mesmo parado?**
- **VM:** *Stop* no portal, ou `az vm deallocate`. O estado precisa ser **Stopped (deallocated)**. Desligar pelo sistema da VM (`sudo shutdown`) mantém a máquina reservada, e o processamento continua sendo cobrado. Parada, ela ainda cobra o disco e o IP público estático.
- **Banco:** *Stop* no portal, ou `az postgres flexible-server stop`. O [Azure religa o servidor sozinho depois de 7 dias](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server), então pare de novo se a pausa for maior. O armazenamento e os backups continuam sendo cobrados.
- **No fim do semestre:** apague o grupo de recursos inteiro, depois da apresentação e do artigo.

```bash
az vm deallocate -g oficinastatus-rg -n <vm>
az postgres flexible-server stop -g oficinastatus-rg -n <banco>
```

### Checklist da entrega (B.8)
- [ ] Provedor escolhido e justificado (início desta seção)
- [ ] Aplicação no ar em `<preencher a URL>`, sem túnel
- [ ] Banco gerenciado: print 4 e string de conexão sem a senha (passo 4)
- [ ] Banco fechado para a internet: print 5
- [ ] Migrations rodando no banco da nuvem: print 9
- [ ] DNS: `nslookup` devolvendo o IP da VM (print 8)
- [ ] HTTPS válido: cadeado sem aviso e emissor documentado (print 10)
- [ ] Webhook do Telegram na URL definitiva: print 11
- [ ] Caminho de DNS e certificado documentado (perguntas 4 a 7)
- [ ] Controle de custo: prints 1 e 12

Fontes: [Azure for Students](https://azure.microsoft.com/en-us/free/students) · [Parar o Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server) · [Azure DNS](https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns) · [Orçamentos no Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets) · [Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/) · [Caddy](https://caddyserver.com/docs/)

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
├── deploy/instalar-vm.sh         # prepara a VM Ubuntu do Azure (Docker, clone e .env)
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
