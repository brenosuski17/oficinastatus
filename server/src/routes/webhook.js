// Webhook da Meta (WhatsApp Cloud API): verificação do cadastro e avisos de status das mensagens.
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const statusWhatsapp = require('../services/statusWhatsapp');

const router = express.Router();

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// A Meta chama este GET ao salvar o webhook no painel e espera receber o challenge de volta.
router.get('/', (req, res) => {
  const { webhookToken } = config.whatsapp();
  const q = req.query;
  if (webhookToken && q['hub.mode'] === 'subscribe' && iguais(q['hub.verify_token'] ?? '', webhookToken)) {
    return res.type('text/plain').send(String(q['hub.challenge'] ?? ''));
  }
  res.sendStatus(403);
});

// A assinatura é calculada sobre os bytes originais, por isso o corpo chega aqui sem passar pelo express.json.
router.post('/', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const { appSecret } = config.whatsapp();
  if (!appSecret) {
    console.error('[webhook] aviso recusado: defina WHATSAPP_APP_SECRET no .env.');
    return res.sendStatus(503); // a Meta tenta de novo mais tarde
  }
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(corpo).digest('hex');
  if (!iguais(req.get('x-hub-signature-256') ?? '', esperado)) {
    console.warn('[webhook] aviso recusado: assinatura inválida.');
    return res.sendStatus(401);
  }
  let dados;
  try { dados = JSON.parse(corpo.toString('utf8')); } catch { return res.sendStatus(400); }
  statusWhatsapp.registrar(dados);
  res.sendStatus(200);
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (!err.status) console.error('[webhook]', err);
  res.sendStatus(err.status || 500);
});

module.exports = router;
