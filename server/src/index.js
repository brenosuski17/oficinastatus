require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
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
