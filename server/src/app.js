const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { HttpError } = require('./errors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/veiculos', require('./routes/veiculos'));
app.use('/api/ordens', require('./routes/ordens'));
app.use('/api/mensagens', require('./routes/mensagens'));
app.use('/api/fipe', require('./routes/fipe'));
app.use('/api/publico', require('./routes/publico'));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Em produção, o próprio servidor entrega o front-end compilado (client/dist).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ erro: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;
