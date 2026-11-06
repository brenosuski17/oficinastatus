// Configuração central lida do .env, com o status de cada integração externa.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const env = (k, padrao = '') => (process.env[k] ?? padrao).toString().trim();

function segredoJwt() {
  if (env('JWT_SECRET')) return env('JWT_SECRET');
  // Sem JWT_SECRET no .env: gera um e guarda em data/, para os logins sobreviverem a reinícios.
  const arq = path.join(__dirname, '..', 'data', '.jwt_secret');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(arq, 'utf8');
}

const config = {
  appUrl: () => env('APP_URL', 'http://localhost:5173').replace(/\/$/, ''),
  oficina: () => ({
    nome: env('NOME_OFICINA', 'OficinaStatus'),
    telefone: env('TELEFONE_OFICINA').replace(/\D/g, ''),
    endereco: env('ENDERECO_OFICINA'),
  }),
  jwtSecret: segredoJwt,
  uploadsDir: path.join(__dirname, '..', 'data', 'uploads'),

  smtp: () => ({
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE') === 'true' || env('SMTP_PORT') === '465',
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM') || env('SMTP_USER'),
    ignorarTls: env('SMTP_IGNORAR_TLS') === 'true',
  }),
  whatsapp: () => ({
    url: env('WHATSAPP_API_URL', 'https://graph.facebook.com').replace(/\/$/, ''),
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    versao: env('WHATSAPP_API_VERSION', 'v21.0'),
    template: env('WHATSAPP_TEMPLATE'),
    idioma: env('WHATSAPP_TEMPLATE_IDIOMA', 'pt_BR'),
    webhookToken: env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
  }),
  placa: () => ({
    url: env('PLACA_API_URL', 'https://api.placafipe.com.br').replace(/\/$/, ''),
    token: env('PLACA_API_TOKEN'),
  }),
  fipe: () => ({
    url: env('FIPE_API_URL', 'https://fipe.parallelum.com.br/api/v2').replace(/\/$/, ''),
    token: env('FIPE_TOKEN'),
  }),
};

config.status = () => {
  const s = config.smtp();
  const w = config.whatsapp();
  return {
    email: { ativo: Boolean(s.host && s.from), detalhe: s.host ? `${s.host}:${s.port} como ${s.from}` : 'Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM no .env' },
    whatsapp: {
      ativo: Boolean(w.token && w.phoneNumberId),
      detalhe: w.token && w.phoneNumberId
        ? `API oficial da Meta (${w.versao})${w.template ? `, modelo "${w.template}"` : ', texto livre (janela de 24h)'}, webhook de status ${w.webhookToken && w.appSecret ? 'configurado' : 'sem configurar'}`
        : 'Sem a API, as mensagens ficam prontas para envio com um clique pelo WhatsApp Web',
    },
    placa: { ativo: Boolean(config.placa().token), detalhe: config.placa().token ? 'PlacaFipe configurada' : 'Defina PLACA_API_TOKEN para preencher o veículo pela placa' },
    fipe: { ativo: true, detalhe: `Parallelum ${config.fipe().token ? 'com token' : 'sem token (limite diário gratuito)'}` },
  };
};

module.exports = config;
