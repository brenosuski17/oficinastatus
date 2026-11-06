// Vínculo (opt-in) entre o usuário do sistema e o bot do Telegram, pelo deep link t.me/BOT?start=codigo.
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { requisicaoInvalida } = require('../errors');

const VALIDADE_DIAS = 7;

/** Cria um convite novo (o anterior deixa de valer) e devolve o link. */
async function gerarLink(usuarioId) {
  const { botUsername } = config.telegram();
  if (!botUsername) throw requisicaoInvalida('Defina TELEGRAM_BOT_USERNAME no .env para gerar o link do Telegram.');
  const codigo = crypto.randomBytes(16).toString('hex');
  await db.prepare("DELETE FROM convites_canal WHERE usuario_id = ? AND plataforma = 'telegram'").run(usuarioId);
  await db.prepare(
    `INSERT INTO convites_canal (codigo, usuario_id, plataforma, expira_em)
     VALUES (?, ?, 'telegram', now() + interval '${VALIDADE_DIAS} days') RETURNING codigo`
  ).run(codigo, usuarioId);
  return `https://t.me/${botUsername}?start=${codigo}`;
}

/** Grava o chat_id do convite. Devolve o canal, ou undefined se o código for inválido ou tiver expirado. */
const vincular = db.transaction(async (codigo, chatId) => {
  const convite = await db.prepare("SELECT * FROM convites_canal WHERE codigo = ? AND plataforma = 'telegram' AND expira_em > now()").get(codigo);
  if (!convite) return undefined;
  await db.prepare("UPDATE canais_usuario SET ativo = false WHERE usuario_id = ? AND plataforma = 'telegram'").run(convite.usuario_id);
  const canal = await db.prepare(
    `INSERT INTO canais_usuario (usuario_id, plataforma, chat_id, codigo_convite)
     VALUES (?, 'telegram', ?, ?)
     ON CONFLICT (plataforma, chat_id) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id, codigo_convite = EXCLUDED.codigo_convite, ativo = true, vinculado_em = now()
     RETURNING *`
  ).get(convite.usuario_id, String(chatId), codigo);
  await db.prepare('DELETE FROM convites_canal WHERE codigo = ?').run(codigo);
  return canal;
});

const ativoDoUsuario = (usuarioId) => db.prepare(
  "SELECT * FROM canais_usuario WHERE usuario_id = ? AND plataforma = 'telegram' AND ativo ORDER BY vinculado_em DESC LIMIT 1"
).get(usuarioId);

const ativoDoCliente = (clienteId) => db.prepare(
  `SELECT cu.* FROM canais_usuario cu JOIN usuarios u ON u.id = cu.usuario_id
    WHERE u.cliente_id = ? AND cu.plataforma = 'telegram' AND cu.ativo ORDER BY cu.vinculado_em DESC LIMIT 1`
).get(clienteId);

const porChat = (chatId) => db.prepare(
  `SELECT cu.*, u.cliente_id FROM canais_usuario cu JOIN usuarios u ON u.id = cu.usuario_id
    WHERE cu.plataforma = 'telegram' AND cu.chat_id = ?`
).get(String(chatId));

const desativar = (canalId) => db.prepare('UPDATE canais_usuario SET ativo = false WHERE id = ?').run(canalId);

module.exports = { gerarLink, vincular, ativoDoUsuario, ativoDoCliente, porChat, desativar };
