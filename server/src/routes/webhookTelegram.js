// POST /webhook/telegram: só aceita o que vem do Telegram, responde 200 e processa em seguida.
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const bot = require('../services/botTelegram');

const router = express.Router();

function origemValida(req) {
  const { webhookSecret } = config.telegram();
  if (!webhookSecret) return false;
  const recebido = Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token') ?? '');
  const esperado = Buffer.from(webhookSecret);
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

router.post('/', (req, res, next) => (origemValida(req) ? next() : res.sendStatus(401)), express.json({ limit: '1mb' }), (req, res) => {
  res.sendStatus(200);
  bot.receber(req.body);
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => res.sendStatus(err.status || 500));

module.exports = router;
