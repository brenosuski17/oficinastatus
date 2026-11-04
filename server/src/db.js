const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'oficina.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS clientes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  telefone    TEXT NOT NULL,                 -- somente dígitos, com DDD
  email       TEXT,
  cpf         TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contas de acesso: equipe da oficina (admin, mecanico) e clientes
CREATE TABLE IF NOT EXISTS usuarios (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nome             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash       TEXT,                      -- NULL até o usuário criar a senha
  papel            TEXT NOT NULL CHECK (papel IN ('admin','mecanico','cliente')),
  cliente_id       INTEGER UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  convite_token    TEXT UNIQUE,               -- link para criar/redefinir senha
  convite_expira   TEXT,
  ativo            INTEGER NOT NULL DEFAULT 1,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS veiculos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id           INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  placa                TEXT NOT NULL UNIQUE,
  tipo                 TEXT NOT NULL DEFAULT 'cars' CHECK (tipo IN ('cars','motorcycles','trucks')),
  marca                TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  ano_fabricacao       INTEGER,
  ano_modelo           INTEGER,
  combustivel          TEXT,
  cor                  TEXT,
  quilometragem        INTEGER,
  fipe_codigo          TEXT,
  fipe_ano_id          TEXT,
  fipe_valor           TEXT,
  fipe_mes_referencia  TEXT,
  fipe_consultado_em   TEXT,
  origem_dados         TEXT NOT NULL DEFAULT 'manual' CHECK (origem_dados IN ('manual','fipe','placa')),
  criado_em            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo_id          INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  mecanico_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  codigo_publico      TEXT NOT NULL UNIQUE,
  problema_relatado   TEXT NOT NULL,
  diagnostico         TEXT,
  km_entrada          INTEGER,
  previsao_entrega    TEXT,
  aguardando_peca     INTEGER NOT NULL DEFAULT 0,
  situacao            TEXT NOT NULL DEFAULT 'aberta' CHECK (situacao IN ('aberta','recusada','finalizada')),
  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  entregue_em         TEXT
);

-- 7 etapas por OS: recebido → diagnostico → orcamento → aprovacao → execucao → pronto → entregue
CREATE TABLE IF NOT EXISTS etapas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id      INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('recebido','diagnostico','orcamento','aprovacao','execucao','pronto','entregue')),
  sequencia     INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','recusada')),
  observacao    TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  iniciada_em   TEXT,
  concluida_em  TEXT,
  UNIQUE (ordem_id, tipo)
);

-- Orçamento por itens (peças e mão de obra); o cliente aprova item por item
CREATE TABLE IF NOT EXISTS itens_orcamento (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id        INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('peca','servico')),
  descricao       TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario  REAL NOT NULL CHECK (valor_unitario >= 0),
  aprovado        INTEGER,                    -- NULL = sem resposta, 1 = aprovado, 0 = recusado
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fotos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id    INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  arquivo     TEXT NOT NULL,
  legenda     TEXT,
  momento     TEXT NOT NULL DEFAULT 'entrada' CHECK (momento IN ('entrada','diagnostico','execucao','entrega')),
  enviada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mensagens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id      INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  etapa_id      INTEGER REFERENCES etapas(id) ON DELETE SET NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp','sistema')),
  direcao       TEXT NOT NULL CHECK (direcao IN ('saida','entrada')),
  destinatario  TEXT,
  assunto       TEXT,
  conteudo      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','falhou','recebida')),
  erro          TEXT,
  id_externo    TEXT,                          -- id retornado pelo provedor (SMTP / Meta)
  link_envio    TEXT,                          -- wa.me, usado quando a API do WhatsApp não está configurada
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  enviada_em    TEXT
);

-- Vistoria 3D: cada ponto marcado no carro é uma avaria, com os serviços escolhidos para ela
CREATE TABLE IF NOT EXISTS avarias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id    INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  numero      INTEGER NOT NULL,                  -- nº exibido no pino (1, 2, 3…)
  zona        TEXT NOT NULL,                     -- peça do carro (porta_dianteira_direita, capo…)
  tipo        TEXT NOT NULL CHECK (tipo IN ('amassado','risco','trinca','quebra','corrosao','pintura')),
  gravidade   TEXT NOT NULL CHECK (gravidade IN ('leve','moderada','grave')),
  pos_x REAL NOT NULL, pos_y REAL NOT NULL, pos_z REAL NOT NULL,  -- ponto no modelo 3D
  nor_x REAL NOT NULL DEFAULT 0, nor_y REAL NOT NULL DEFAULT 1, nor_z REAL NOT NULL DEFAULT 0,
  observacao  TEXT,
  orcada      INTEGER NOT NULL DEFAULT 0,        -- 1 = já virou itens do orçamento
  criado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ordem_id, numero)
);

-- Tabela de preços da oficina: serviços por peça
CREATE TABLE IF NOT EXISTS catalogo_servicos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo    TEXT NOT NULL,                       -- martelinho, recuperacao, pintura…
  zona      TEXT NOT NULL,                       -- grupo de peça (porta_dianteira, capo, para_brisa…)
  nome      TEXT NOT NULL,
  valor     REAL NOT NULL CHECK (valor >= 0),
  minutos   INTEGER NOT NULL DEFAULT 60,
  ativo     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (codigo, zona)
);

CREATE TABLE IF NOT EXISTS avaria_servicos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  avaria_id    INTEGER NOT NULL REFERENCES avarias(id) ON DELETE CASCADE,
  catalogo_id  INTEGER REFERENCES catalogo_servicos(id) ON DELETE SET NULL,
  descricao    TEXT NOT NULL,
  valor        REAL NOT NULL CHECK (valor >= 0),
  minutos      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_avarias_ordem ON avarias(ordem_id);
CREATE INDEX IF NOT EXISTS idx_avaria_serv ON avaria_servicos(avaria_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON veiculos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_veiculo   ON ordens_servico(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_ordens_mecanico  ON ordens_servico(mecanico_id);
CREATE INDEX IF NOT EXISTS idx_etapas_ordem     ON etapas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_itens_ordem      ON itens_orcamento(ordem_id);
CREATE INDEX IF NOT EXISTS idx_fotos_ordem      ON fotos(ordem_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_ordem  ON mensagens(ordem_id);
`);

// Migração: bancos criados antes da vistoria 3D não têm o vínculo item ↔ avaria
if (!db.prepare('PRAGMA table_info(itens_orcamento)').all().some((c) => c.name === 'avaria_id')) {
  db.exec('ALTER TABLE itens_orcamento ADD COLUMN avaria_id INTEGER REFERENCES avarias(id) ON DELETE SET NULL');
}

module.exports = db;

// Preenche a tabela de preços na primeira execução
require('./services/catalogo').garantirCatalogo();
