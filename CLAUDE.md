# OficinaStatus

Trabalho de faculdade (engenharia de software) de Breno Suski e Arthur Svidzinski: sistema de ordens de serviço
para oficina mecânica em que o cliente é avisado a cada etapa (e-mail + WhatsApp) e aprova o orçamento pelo celular.
Requisitos do trabalho: entidades mínimas `clientes`, `veiculos`, `ordens_servico`, `etapas`, `mensagens`;
segunda API obrigatória: FIPE (Parallelum). Textos da interface e do código em português do Brasil.

Repositório: https://github.com/brenosuski17/oficinastatus

## Comandos

Requer Node.js 22.13+ (usa o SQLite embutido, `node:sqlite`, via `server/src/sqlite.js`; não há módulo nativo para compilar).

```bash
npm run instalar            # na raiz: instala raiz, server e client
npm run seed                # recria o banco de demonstração (senha oficina123 em todas as contas)
npm run dev                 # API em :3333 + Vite em :5173
npm test --prefix server    # testes de integração (node:test), devem passar sempre
npm run build               # build de produção do client (o server serve client/dist)
```

Contas do seed: admin@oficina.com (admin), arthur@ e rafael@oficina.com (mecânicos),
ana/joao/marcia/luciana/fernanda@cliente.com (clientes). OS 16 (Fernanda, Polo) já tem avarias e orçamento enviado.

## Estrutura

- `server/src/db.js`: esquema SQLite + migrações idempotentes (ALTER/rebuild de tabela). Ao mudar o esquema, adicione
  migração aqui; não apague o banco do usuário.
- `server/src/services/`: regras de negócio. `ordens.js` é a máquina de estados das 7 etapas
  (recebido → diagnostico → orcamento → aprovacao → execucao → pronto → entregue); `notificacao.js` monta os avisos;
  `envio.js` envia (SMTP, WhatsApp Cloud API da Meta, fila após o commit); `avarias.js` + `catalogo.js` são a inspeção 3D
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

SMTP, WhatsApp (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE=atualizacao_os com 3 variáveis; webhook de status
com WHATSAPP_WEBHOOK_VERIFY_TOKEN e WHATSAPP_APP_SECRET, e o túnel expõe só a porta WEBHOOK_PORT, 3334),
PlacaFipe (PLACA_API_TOKEN), FIPE Parallelum (token opcional). Sem chave, o sistema funciona e deixa a mensagem
pendente com botão de envio manual (wa.me). Nunca commitar `.env` nem `server/data/`.

## Próximos passos combinados

- Configurar o WhatsApp real da Meta (o Breno vai criar o app e passar as chaves).
- Trocar os carros procedurais de sedã, SUV e picape por modelos .glb reais (Sketchfab/Poly Haven, licença CC0/CC BY, crédito
  ao autor), como já feito nos hatches da Volkswagen: `client/scripts/otimizar-golf.mjs` gera o .glb e `MODELOS` em
  `carrocerias.js` guarda marcas, medidas e crédito. Manter cor do veículo, clique por peça e marcações de avaria. Preferir
  modelos com peças separadas. O `golf.glb` tem licença Standard do Sketchfab (sem redistribuição): nunca commitar.

## Convenções

- Commits em português, autor brenosuski17.
- Antes de concluir uma mudança: `npm test --prefix server` e `npm run build`.
- Mudanças visuais: conferir no navegador, em desktop e celular.
