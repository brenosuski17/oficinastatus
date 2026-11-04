const router = require('express').Router();
const db = require('../db');
const { naoEncontrado, rota } = require('../errors');

// Lista mensagens (filtros opcionais: ordem_id, status)
router.get('/', rota((req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.ordem_id) { filtros.push('m.ordem_id = ?'); params.push(req.query.ordem_id); }
  if (req.query.status) { filtros.push('m.status = ?'); params.push(req.query.status); }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  res.json(
    db.prepare(
      `SELECT m.*, c.nome AS cliente_nome, v.placa, e.tipo AS etapa_tipo
         FROM mensagens m
         JOIN ordens_servico o ON o.id = m.ordem_id
         JOIN veiculos v ON v.id = o.veiculo_id
         JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN etapas e ON e.id = m.etapa_id
         ${where}
        ORDER BY m.id DESC LIMIT 200`
    ).all(...params)
  );
}));

// A oficina clicou em "Enviar pelo WhatsApp": marca como enviada.
router.post('/:id/enviada', rota((req, res) => {
  const r = db
    .prepare("UPDATE mensagens SET status = 'enviada', enviada_em = datetime('now') WHERE id = ? AND direcao = 'saida'")
    .run(req.params.id);
  if (!r.changes) throw naoEncontrado('Mensagem');
  res.json(db.prepare('SELECT * FROM mensagens WHERE id = ?').get(req.params.id));
}));

module.exports = router;
