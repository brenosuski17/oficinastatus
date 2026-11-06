const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { HttpError } = require('./errors');
const diversos = require('./routes/diversos');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use('/api/webhooks/whatsapp', require('./routes/webhook')); // antes do express.json: precisa do corpo original
app.use(express.json({ limit: '1mb' }));

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/equipe', require('./routes/equipe'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/veiculos', require('./routes/veiculos'));
app.use('/api/ordens', require('./routes/ordens'));
app.use('/api/mensagens', diversos.mensagens);
app.use('/api/fipe', diversos.fipe);
app.use('/api/catalogo', diversos.catalogo);
app.use('/api/portal', diversos.portal);
app.use('/api/publico', diversos.publico);
app.use('/api', diversos.admin);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Fotos das OS (nomes aleatórios, não adivinháveis)
fs.mkdirSync(config.uploadsDir, { recursive: true });
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));

// Em produção, o próprio servidor entrega o front-end compilado (client/dist)
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ erro: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'Cada foto pode ter no máximo 8 MB.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;
