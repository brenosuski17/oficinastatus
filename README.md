# OficinaStatus

Sistema de acompanhamento de ordens de serviço para oficina mecânica.

**Problema:** os clientes ligam várias vezes para saber do carro.
**Solução:** cada ordem de serviço (OS) passa por etapas — orçamento → aprovação → execução → pronto — e cada mudança gera uma mensagem para o cliente com um link de acompanhamento. Pelo link, o cliente vê em que etapa o carro está e aprova ou recusa o orçamento, sem precisar ligar.

**Alunos:** Arthur Svidzinski e Breno Suski

## Funcionalidades

- **Quadro da oficina:** todas as OS abertas em colunas por etapa, com busca por placa, cliente ou modelo.
- **Cadastro de clientes e veículos**, com a placa validada nos padrões antigo e Mercosul.
- **Integração com a API FIPE (Parallelum):** marca, modelo e ano escolhidos em cascata; o valor de referência fica salvo no veículo.
- **Ordens de serviço com 4 etapas**, com regras que impedem pular etapas (ex.: não dá para iniciar o serviço sem aprovação).
- **Notificação a cada etapa:** a mensagem é gerada automaticamente e enviada com um clique pelo WhatsApp (link `wa.me`). Mensagens pendentes ficam numa fila.
- **Aprovação de orçamento pelo cliente**, numa página pública pensada para celular. Se o cliente responder por telefone ou no balcão, a oficina registra a resposta pelo painel.
- **Histórico completo** das etapas e mensagens de saída e de entrada de cada OS.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js 22+, Express, better-sqlite3 |
| Banco de dados | SQLite (arquivo `server/data/oficina.db`, criado automaticamente) |
| Front-end | React 19, React Router, Vite |
| API externa | [API FIPE da Parallelum (v2)](https://github.com/parallelum/fipe-go) |

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 22 ou superior (versão LTS).

```bash
# 1. Instalar as dependências (raiz, servidor e cliente)
npm run instalar

# 2. Criar o arquivo de configuração
cp server/.env.example server/.env      # no Windows: copy server\.env.example server\.env

# 3. (Opcional) Popular o banco com dados de exemplo
npm run seed

# 4. Rodar em modo de desenvolvimento
npm run dev
```

Abra **http://localhost:5173**. A API roda em http://localhost:3333.

Para rodar como em produção, com um único servidor entregando a API e o site:

```bash
npm run build
npm start          # acesse http://localhost:3333 (ajuste APP_URL no .env)
```

### Configuração (`server/.env`)

| Variável | Para que serve |
|---|---|
| `APP_URL` | Endereço do site, usado no link enviado ao cliente. |
| `NOME_OFICINA`, `TELEFONE_OFICINA` | Aparecem nas mensagens e na página do cliente. |
| `FIPE_API_URL` | Endereço da API FIPE (padrão: `https://fipe.parallelum.com.br/api/v2`). |
| `FIPE_TOKEN` | Opcional. Token do [fipe.online](https://fipe.online) para aumentar o limite diário de consultas. |
| `FIPE_MOCK` | `1` para usar respostas simuladas da FIPE (no mesmo formato da API real), útil para apresentar sem internet. |

## Estrutura

```
oficinastatus/
├── server/
│   └── src/
│       ├── db.js                 # esquema do banco (5 tabelas)
│       ├── app.js                # Express: rotas e tratamento de erros
│       ├── seed.js               # dados de exemplo
│       ├── routes/               # clientes, veiculos, ordens, mensagens, fipe, publico
│       └── services/
│           ├── ordens.js         # regras das etapas (máquina de estados)
│           ├── notificacao.js    # textos das mensagens e links do WhatsApp
│           └── fipe.js           # integração com a API FIPE (com cache)
├── client/
│   └── src/
│       ├── pages/                # Quadro, Ordem, NovaOrdem, Veiculos, Clientes, Mensagens, Acompanhar
│       └── components.jsx        # Placa, Trilha de etapas e utilitários
└── docs/
    └── der.md                    # diagrama do banco e fluxo de estados
```

## Banco de dados

Entidades: `clientes`, `veiculos`, `ordens_servico`, `etapas` e `mensagens`.
O diagrama completo e as cardinalidades estão em [docs/der.md](docs/der.md).

![Diagrama entidade-relacionamento](docs/der.png)

## API

Todas as rotas começam com `/api` e trocam JSON. Em caso de erro, a resposta traz `{ "erro": "mensagem" }` com o status HTTP adequado (400, 404, 409, 502).

### Clientes e veículos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/clientes?busca=` | Lista clientes |
| GET | `/clientes/:id` | Cliente com seus veículos |
| POST / PUT / DELETE | `/clientes`, `/clientes/:id` | Cria, edita, exclui |
| GET | `/veiculos?busca=` | Lista veículos |
| GET | `/veiculos/:id` | Veículo com histórico de OS |
| POST / PUT / DELETE | `/veiculos`, `/veiculos/:id` | Cria, edita, exclui |

### Ordens de serviço e etapas

| Método | Rota | Etapa | Notifica o cliente |
|---|---|---|---|
| GET | `/ordens?busca=&etapa=` | — | — |
| GET | `/ordens/resumo` | Contagem por etapa e mensagens pendentes | — |
| GET | `/ordens/:id` | OS com etapas e mensagens | — |
| POST | `/ordens` | Abre a OS → **orçamento** | Abertura + link |
| POST | `/ordens/:id/orcamento` | Orçamento → **aprovação** | Pede aprovação |
| POST | `/ordens/:id/aprovacao` | `{ aprovado: true/false }` registrado pela oficina | Confirmação |
| POST | `/ordens/:id/execucao` | Aprovado → **execução** | Início do serviço |
| POST | `/ordens/:id/pronto` | Execução → **pronto** | Pronto para retirada |
| POST | `/ordens/:id/entrega` | Encerra a OS | — |

### Mensagens

| Método | Rota | Descrição |
|---|---|---|
| GET | `/mensagens?status=&ordem_id=` | Lista mensagens (`pendente`, `enviada`, `recebida`) |
| POST | `/mensagens/:id/enviada` | Marca como enviada |

### Página pública do cliente

| Método | Rota | Descrição |
|---|---|---|
| GET | `/publico/ordens/:codigo` | Andamento da OS (sem dados internos) |
| POST | `/publico/ordens/:codigo/resposta` | `{ aprovado, observacao }`: o cliente aprova ou recusa |

O acesso é pelo `codigo_publico`, um código aleatório, para que ninguém consiga ver a OS de outro cliente trocando o número na URL.

### API FIPE (segunda API)

O front-end não chama a API FIPE diretamente. O servidor faz a consulta, guarda o resultado em cache por 12 horas e padroniza os erros.

| Rota do sistema | Rota na Parallelum |
|---|---|
| `GET /fipe/:tipo/marcas` | `/{tipo}/brands` |
| `GET /fipe/:tipo/marcas/:marca/modelos` | `/{tipo}/brands/{marca}/models` |
| `GET /fipe/:tipo/marcas/:marca/modelos/:modelo/anos` | `.../models/{modelo}/years` |
| `GET /fipe/:tipo/marcas/:marca/modelos/:modelo/anos/:ano` | `.../years/{ano}` (valor de referência) |

`tipo` pode ser `cars`, `motorcycles` ou `trucks`.

## Decisões de projeto

- **Notificação por link `wa.me` em vez de API paga do WhatsApp:** funciona sem custo nem conta comercial. O sistema gera e registra a mensagem; o atendente envia com um clique. Trocar por envio automático (Twilio ou Meta Cloud API) exige mudar apenas `services/notificacao.js`.
- **Etapas como tabela própria:** guardam quando cada etapa começou e terminou e quem aprovou, o que permite mostrar a linha do tempo ao cliente.
- **Regras no back-end:** a sequência das etapas é validada no servidor, não só na tela.
