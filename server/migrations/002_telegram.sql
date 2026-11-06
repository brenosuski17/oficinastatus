-- Troca o WhatsApp pelo bot do Telegram. canais_usuario e mensagens seguem o modelo do Anexo A.5.

CREATE TYPE plataforma_msg AS ENUM ('telegram', 'discord');
CREATE TYPE status_msg AS ENUM ('enfileirada','enviada','falha','respondida');

-- Todo vínculo precisa de um usuário, e o cliente sem e-mail também pode se vincular ao bot
ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL;

-- A tabela antiga guarda o que não é do bot: e-mails e respostas registradas pelo sistema
ALTER TABLE mensagens RENAME TO comunicacoes;
ALTER TABLE comunicacoes RENAME CONSTRAINT mensagens_pkey TO comunicacoes_pkey;
ALTER SEQUENCE mensagens_id_seq RENAME TO comunicacoes_id_seq;
ALTER INDEX idx_mensagens_ordem RENAME TO idx_comunicacoes_ordem;
ALTER INDEX idx_mensagens_externo RENAME TO idx_comunicacoes_externo;

-- As mensagens antigas de WhatsApp ficam só como arquivo
CREATE TABLE mensagens_whatsapp_arquivo AS SELECT * FROM comunicacoes WHERE canal = 'whatsapp';
DELETE FROM comunicacoes WHERE canal = 'whatsapp';

ALTER TABLE comunicacoes
  DROP COLUMN link_envio,
  DROP COLUMN status_entrega,
  DROP COLUMN status_entrega_em,
  DROP COLUMN erro_codigo,
  DROP CONSTRAINT mensagens_canal_check,
  ADD CONSTRAINT comunicacoes_canal_check CHECK (canal IN ('email','sistema'));

-- vinculo (opt-in) entre o usuario do sistema e o bot
CREATE TABLE canais_usuario (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma     plataforma_msg NOT NULL,
  chat_id        TEXT NOT NULL,                  -- chat.id (TG) ou user id (Discord)
  codigo_convite TEXT,                           -- payload do deep link, se usado
  ativo          BOOLEAN NOT NULL DEFAULT true,
  vinculado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plataforma, chat_id)
);
CREATE INDEX idx_canais_usuario ON canais_usuario (usuario_id);

-- Convite pendente: o chat_id de canais_usuario é obrigatório e só existe depois do /start
CREATE TABLE convites_canal (
  codigo     TEXT PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma plataforma_msg NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_convites_usuario ON convites_canal (usuario_id);

CREATE TABLE mensagens (
  id               BIGSERIAL PRIMARY KEY,
  canal_usuario_id BIGINT REFERENCES canais_usuario(id) ON DELETE CASCADE,
  plataforma       plataforma_msg NOT NULL,
  direcao          TEXT NOT NULL CHECK (direcao IN ('saida','entrada')),
  id_externo       TEXT,                         -- message_id devolvido pela plataforma
  conteudo         TEXT NOT NULL,
  status           status_msg NOT NULL DEFAULT 'enfileirada',
  erro_codigo      TEXT,                         -- ex.: 403
  erro_descricao   TEXT,                         -- ex.: bot was blocked by the user
  payload_bruto    JSONB,                        -- update/interaction cru recebido
  criada_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviada_em       TIMESTAMPTZ,
  respondida_em    TIMESTAMPTZ,
  -- Colunas do sistema, além das do Anexo A.5
  ordem_id         INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
  etapa_id         INTEGER REFERENCES etapas(id) ON DELETE SET NULL,
  reply_markup     JSONB,                        -- botões da mensagem, usados também ao reenviar
  teste            BOOLEAN NOT NULL DEFAULT false  -- teste de Ajustes > Integrações
);
CREATE INDEX ON mensagens (plataforma, id_externo);
CREATE INDEX ON mensagens (status);
CREATE INDEX idx_mensagens_ordem ON mensagens (ordem_id);
CREATE INDEX idx_mensagens_canal ON mensagens (canal_usuario_id);

-- Idempotência: cada update do Telegram é processado uma vez
CREATE TABLE updates_telegram (
  update_id   BIGINT PRIMARY KEY,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico único para as telas: mensagens do bot + e-mails e registros do sistema
CREATE VIEW historico_mensagens AS
  SELECT m.plataforma::text AS canal, m.id, m.ordem_id, m.etapa_id, m.direcao,
         cu.chat_id AS destinatario, NULL::text AS assunto, m.conteudo, m.status::text AS status,
         m.erro_codigo, m.erro_descricao, m.id_externo, m.criada_em, m.enviada_em, m.respondida_em, m.teste,
         COALESCE(m.payload_bruto #>> '{message,from,first_name}', m.payload_bruto #>> '{callback_query,from,first_name}') AS remetente,
         u.nome AS usuario_nome, (m.reply_markup IS NOT NULL)::int AS com_botoes
    FROM mensagens m
    LEFT JOIN canais_usuario cu ON cu.id = m.canal_usuario_id
    LEFT JOIN usuarios u ON u.id = cu.usuario_id
  UNION ALL
  SELECT c.canal, c.id, c.ordem_id, c.etapa_id, c.direcao,
         c.destinatario, c.assunto, c.conteudo,
         CASE c.status WHEN 'pendente' THEN 'enfileirada' WHEN 'falhou' THEN 'falha' WHEN 'recebida' THEN 'respondida' ELSE c.status END,
         NULL, c.erro, c.id_externo, c.criado_em, c.enviada_em, NULL, (c.ordem_id IS NULL AND c.direcao = 'saida'),
         NULL, NULL, 0
    FROM comunicacoes c;
