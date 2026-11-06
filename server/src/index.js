require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const app = require('./app');
const config = require('./config');
const auth = require('./services/auth');

const PORTA = process.env.PORT || 3333;
app.listen(PORTA, () => {
  console.log(`\nOficinaStatus API em http://localhost:${PORTA}`);
  const s = config.status();
  for (const [nome, st] of Object.entries(s)) console.log(`  ${st.ativo ? '✔' : '–'} ${nome.padEnd(9)} ${st.detalhe}`);
  if (auth.precisaConfigurar()) console.log(`\n  Primeiro acesso: abra ${config.appUrl()}/entrar para criar o administrador.\n`);
});

// Porta só com o webhook: é ela que o túnel expõe, para o login e a API não ficarem na internet.
const PORTA_WEBHOOK = process.env.WEBHOOK_PORT || 3334;
const soWebhook = express();
soWebhook.disable('x-powered-by');
soWebhook.use('/api/webhooks/whatsapp', require('./routes/webhook'));
soWebhook.listen(PORTA_WEBHOOK, '127.0.0.1', () => console.log(`  Webhook para o túnel em http://localhost:${PORTA_WEBHOOK}/api/webhooks/whatsapp`));
