# OficinaStatus

Trabalho de faculdade (engenharia de software) de Breno Suski e Arthur Svidzinski: sistema de ordens de serviço
para oficina mecânica em que o cliente é avisado a cada etapa (e-mail + bot do Telegram) e aprova o orçamento pelo celular.
Requisitos do trabalho: entidades mínimas `clientes`, `veiculos`, `ordens_servico`, `etapas`, `mensagens`;
segunda API obrigatória: FIPE (Parallelum). Textos da interface e do código em português do Brasil.

Repositório: https://github.com/brenosuski17/oficinastatus

## Comandos

Requer Node.js 22.13+ e PostgreSQL (`DATABASE_URL` no `server/.env`; em desenvolvimento, o do Docker Compose em `localhost:5433`).
A porta 5432 desta máquina é de um PostgreSQL instalado no Windows, que o projeto não usa.

```bash
npm run instalar            # na raiz: instala raiz, server e client
docker compose up -d postgres   # sobe só o banco (necessário para dev, migrate, seed e testes)
npm run migrate             # aplica as migrations de server/migrations
npm run seed                # apaga os dados e cria a demonstração (senha oficina123 em todas as contas)
npm run webhook             # sobe o cloudflared e registra a URL no Telegram (com npm run dev rodando)
npm run dev                 # API em :3333 + Vite em :5173
npm test --prefix server    # testes de integração (node:test), devem passar sempre; usam um schema descartável
npm run build               # build de produção do client (o server serve client/dist)
npm run lint                # ESLint em server e client; roda no CI (.github/workflows/ci.yml) com os testes e o build
docker compose up --build   # ambiente completo: aplicação em :3333 + PostgreSQL
docker compose --env-file server/.env -f docker-compose.prod.yml up -d --build   # caminho 1 (VM + Caddy), não usado em produção
```

Contas do seed: admin@oficina.com (admin), arthur@ e rafael@oficina.com (mecânicos),
ana/joao/marcia/luciana/fernanda@cliente.com (clientes). OS 12 (João, Strada) e OS 16 (Fernanda, Polo, com avarias) ficam
aguardando aprovação para o Aprovar ao vivo (roteiro no README; `server/test/seed.test.js` garante).

## Estrutura

- `server/migrations/`: esquema em arquivos SQL numerados, aplicados por `server/src/migrar.js`. Ao mudar o esquema, crie um
  novo arquivo; nunca edite uma migration já aplicada nem apague o banco do usuário.
- `server/src/db.js`: conexão `pg` e `await db.prepare(sql).get/all/run(...)` com `?` nos parâmetros. `db.transaction` usa a mesma
  conexão em tudo que roda dentro dela e serializa as transações; `db.aposCommit` agenda o que depende do commit (fila de envio).
  A API mantém os formatos do front-end: datas UTC "AAAA-MM-DD HH:MM:SS", flags 0/1 e NUMERIC/COUNT como número.
- `server/src/services/`: regras de negócio. `ordens.js` é a máquina de estados das 7 etapas
  (recebido → diagnostico → orcamento → aprovacao → execucao → pronto → entregue); `notificacao.js` monta os avisos;
  `envio.js` envia (SMTP, Telegram, fila após o commit, backoff no 429); `telegram.js` é o cliente da Bot API, `botTelegram.js` trata o
  webhook (/start, mensagens, botões) e `canais.js` faz o vínculo; `avarias.js` + `catalogo.js` são a inspeção 3D
  e a tabela de preços; `relatorios.js` alimenta a Visão geral.
- `server/src/routes/`: rotas Express finas que chamam os services.
- `client/src/oficina/`: área da equipe (tema escuro, classe `.tema-escuro` no Layout).
- `client/src/cliente/`: portal do cliente e página pública `/acompanhar/:codigo` (tema claro).
- `client/src/vistoria/`: inspeção 3D (Three.js + React Three Fiber). `carrocerias.js` define os perfis hatch/sedan/suv/picape
  e a detecção de peça por coordenada; `Carro3D.jsx` desenha o carro e realça a peça por shader (a lógica de zona em GLSL
  precisa espelhar a de JS); `Inspecao.jsx` é a tela cheia; `Editor.jsx` registra avaria/serviço.
- `client/src/index.css`: tokens de cor (Tailwind 4 `@theme`). Use os tokens (`bg-superficie`, `text-tinta-2`,
  `border-linha`…), não cores fixas, para o tema escuro funcionar.

## Integrações (server/.env, ver .env.example e README)

SMTP, Telegram (TELEGRAM_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET; webhook em POST /webhook/telegram, e o túnel
expõe só a porta WEBHOOK_PORT, 3334),
PlacaFipe (PLACA_API_TOKEN), FIPE Parallelum (token opcional). Sem token, o sistema funciona e deixa a mensagem na fila;
cliente sem vínculo fica com `falha` e o motivo.
`mensagens` e `canais_usuario` seguem os nomes do Anexo A.5 do documento do projeto (a correção procura por eles): não renomeie.
E-mails e registros do sistema ficam em `comunicacoes`, e a view `historico_mensagens` junta tudo para as telas. Nunca commitar `.env` nem `server/data/` (o `oficina.db` antigo, do SQLite, ficou lá só como cópia).

## Próximos passos combinados

- Feito em 11/11/2026: domínio oficinastatus.com.br e www no Container Apps, com certificado gerenciado, `APP_URL` e webhook
  do Telegram no domínio. A zona fica no DNS do Registro.br (modo avançado, nameservers `d.sec.dns.br` e `e.sec.dns.br`;
  README, Deploy, passo 9). Faltam os prints do checklist, as tags por aula com a release `v1.0.0`, e o Prometheus com o Grafana.

## Modelos 3D

Um .glb por carroceria em `client/public/modelos/` (hatch, sedan, suv, picape), do Sketchfab com CC BY / CC BY-SA (créditos
e licenças no README, "Modelos 3D"; o crédito aparece na tela). `client/scripts/otimizar-modelo.mjs <carroceria> original.glb`
gera o arquivo e grava as medidas em `client/src/vistoria/medidas-modelos.json`; `inspecionar-modelo.mjs` ajuda a configurar
um modelo novo. Manter cor do veículo, clique por peça e marcações de avaria. O `golf.glb` antigo tem licença Standard do
Sketchfab (sem redistribuição): nunca commitar nem colocar na imagem.

## Convenções

- Commits em português, autor brenosuski17.
- Antes de concluir uma mudança: `npm run lint`, `npm test --prefix server` e `npm run build`.
- Mudanças visuais: conferir no navegador, em desktop e celular.
- Produção é no Azure (README, "Deploy no Azure (Container Apps)"), na conta gratuita "Azure subscription 1" (não é Azure for Students;
  a assinatura não libera VMs): Container Apps `oficinastatus` + ACR `oficinastatusbreno` + PostgreSQL Flexible Server
  `oficinastatus-db-breno` sem acesso público, só por Private Endpoint na `vnet-oficinastatus`, tudo em `rg-oficinastatus`
  (Brazil South). Segredos são secrets do Container Apps, nunca arquivo. PostgreSQL gerenciado, nunca banco em container.
  Não alterar recursos reais do Azure ou do Telegram sem o Breno pedir.
