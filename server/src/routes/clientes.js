const router = require('express').Router();
const db = require('../db');
const { naoEncontrado, requisicaoInvalida, rota } = require('../errors');

function validar({ nome, telefone, email }) {
  if (!nome?.trim()) throw requisicaoInvalida('Informe o nome do cliente.');
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 13) throw requisicaoInvalida('Informe um telefone com DDD (ex.: 42 99999-9999).');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw requisicaoInvalida('E-mail inválido.');
  return { nome: nome.trim(), telefone: tel, email: email?.trim() || null };
}

router.get('/', rota((req, res) => {
  const b = req.query.busca ? `%${req.query.busca}%` : '%';
  res.json(
    db.prepare(
      `SELECT c.*, COUNT(v.id) AS total_veiculos
         FROM clientes c LEFT JOIN veiculos v ON v.cliente_id = c.id
        WHERE c.nome LIKE ? OR c.telefone LIKE ?
        GROUP BY c.id ORDER BY c.nome`
    ).all(b, b)
  );
}));

router.get('/:id', rota((req, res) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!c) throw naoEncontrado('Cliente');
  c.veiculos = db.prepare('SELECT * FROM veiculos WHERE cliente_id = ? ORDER BY id DESC').all(c.id);
  res.json(c);
}));

router.post('/', rota((req, res) => {
  const d = validar(req.body);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO clientes (nome, telefone, email) VALUES (?, ?, ?)')
    .run(d.nome, d.telefone, d.email);
  res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(lastInsertRowid));
}));

router.put('/:id', rota((req, res) => {
  const d = validar(req.body);
  const r = db
    .prepare('UPDATE clientes SET nome = ?, telefone = ?, email = ? WHERE id = ?')
    .run(d.nome, d.telefone, d.email, req.params.id);
  if (!r.changes) throw naoEncontrado('Cliente');
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', rota((req, res) => {
  const r = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  if (!r.changes) throw naoEncontrado('Cliente');
  res.status(204).end();
}));

module.exports = router;
