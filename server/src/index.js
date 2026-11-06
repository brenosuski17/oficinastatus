require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const app = require('./app');
const config = require('./config');
const auth = require('./services/auth');
const catalogo = require('./services/catalogo');
const { pendentes } = require('./migrar');

async function iniciar() {
  const faltam = await pendentes();
  if (faltam.length) throw new Error(`Faltam migrations (${faltam.join(', ')}). Rode: npm run migrate`);
  await catalogo.garantirCatalogo();
  const primeiroAcesso = await auth.precisaConfigurar();

  const PORTA = process.env.PORT || 3333;
  app.listen(PORTA, () => {
    console.log(`\nOficinaStatus API em http://localhost:${PORTA}`);
    const s = config.status();
    for (const [nome, st] of Object.entries(s)) console.log(`  ${st.ativo ? '✔' : '–'} ${nome.padEnd(9)} ${st.detalhe}`);
    if (primeiroAcesso) console.log(`\n  Primeiro acesso: abra ${config.appUrl()}/entrar para criar o administrador.\n`);
  });

  // Porta só com o webhook: é ela que o túnel expõe, para o login e a API não ficarem na internet.
  const PORTA_WEBHOOK = process.env.WEBHOOK_PORT || 3334;
  const soWebhook = express();
  soWebhook.disable('x-powered-by');
  soWebhook.use('/api/webhooks/whatsapp', require('./routes/webhook'));
  soWebhook.listen(PORTA_WEBHOOK, '127.0.0.1', () => console.log(`  Webhook para o túnel em http://localhost:${PORTA_WEBHOOK}/api/webhooks/whatsapp`));
}

iniciar().catch((e) => {
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(e.code))
    console.error('Não foi possível conectar ao PostgreSQL. Confira DATABASE_URL no server/.env e, em desenvolvimento, rode: docker compose up -d postgres');
  else console.error(e.message);
  process.exit(1);
});
