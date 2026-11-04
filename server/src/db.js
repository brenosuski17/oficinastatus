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
  nome        TEXT    NOT NULL,
  telefone    TEXT    NOT NULL,              -- somente dígitos, com DDD
  email       TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS veiculos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id           INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  placa                TEXT    NOT NULL UNIQUE,
  tipo                 TEXT    NOT NULL DEFAULT 'cars'
                       CHECK (tipo IN ('cars','motorcycles','trucks')),
  marca                TEXT    NOT NULL,
  modelo               TEXT    NOT NULL,
  ano_modelo           INTEGER,
  combustivel          TEXT,
  cor                  TEXT,
  quilometragem        INTEGER,
  fipe_codigo          TEXT,                  -- código FIPE do modelo
  fipe_ano_id          TEXT,                  -- ex.: "2020-1"
  fipe_valor           TEXT,                  -- ex.: "R$ 85.000,00"
  fipe_mes_referencia  TEXT,
  fipe_consultado_em   TEXT,
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo_id            INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  codigo_publico        TEXT    NOT NULL UNIQUE,   -- usado no link de acompanhamento
  problema_relatado     TEXT    NOT NULL,
  orcamento_descricao   TEXT,
  orcamento_valor       REAL,
  previsao_entrega      TEXT,
  situacao              TEXT    NOT NULL DEFAULT 'aberta'
                        CHECK (situacao IN ('aberta','recusada','finalizada')),
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  entregue_em           TEXT
);

CREATE TABLE IF NOT EXISTS etapas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id      INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('orcamento','aprovacao','execucao','pronto')),
  sequencia     INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','em_andamento','concluida','recusada')),
  observacao    TEXT,
  iniciada_em   TEXT,
  concluida_em  TEXT,
  UNIQUE (ordem_id, tipo)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id      INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  etapa_id      INTEGER REFERENCES etapas(id) ON DELETE SET NULL,
  direcao       TEXT    NOT NULL CHECK (direcao IN ('saida','entrada')),
  canal         TEXT    NOT NULL DEFAULT 'whatsapp',
  conteudo      TEXT    NOT NULL,
  link_envio    TEXT,                          -- link wa.me pronto para envio
  status        TEXT    NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','enviada','recebida')),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  enviada_em    TEXT
);

CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON veiculos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_veiculo   ON ordens_servico(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_etapas_ordem     ON etapas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_ordem  ON mensagens(ordem_id);
`);

module.exports = db;
