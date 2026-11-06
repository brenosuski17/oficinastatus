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
  telegram: () => ({
    url: env('TELEGRAM_API_URL', 'https://api.telegram.org').replace(/\/$/, ''),
    token: env('TELEGRAM_TOKEN'),
    botUsername: env('TELEGRAM_BOT_USERNAME').replace(/^@/, ''),
    webhookSecret: env('TELEGRAM_WEBHOOK_SECRET'),
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
  const t = config.telegram();
  return {
    email: { ativo: Boolean(s.host && s.from), detalhe: s.host ? `${s.host}:${s.port} como ${s.from}` : 'Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM no .env' },
    telegram: {
      ativo: Boolean(t.token),
      detalhe: t.token
        ? `Bot ${t.botUsername ? `@${t.botUsername}` : 'sem TELEGRAM_BOT_USERNAME'}, webhook ${t.webhookSecret ? 'protegido por segredo' : 'sem TELEGRAM_WEBHOOK_SECRET'}`
        : 'Sem o token, as mensagens ficam na fila até o bot ser configurado',
    },
    placa: { ativo: Boolean(config.placa().token), detalhe: config.placa().token ? 'PlacaFipe configurada' : 'Defina PLACA_API_TOKEN para preencher o veículo pela placa' },
    fipe: { ativo: true, detalhe: `Parallelum ${config.fipe().token ? 'com token' : 'sem token (limite diário gratuito)'}` },
  };
};

module.exports = config;
