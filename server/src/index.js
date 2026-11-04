require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');

const PORTA = process.env.PORT || 3333;
app.listen(PORTA, () => {
  console.log(`OficinaStatus API rodando em http://localhost:${PORTA}`);
  if (process.env.FIPE_MOCK === '1') console.log('API FIPE em modo de demonstração (FIPE_MOCK=1).');
});
