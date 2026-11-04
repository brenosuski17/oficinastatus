const router = require('express').Router();
const db = require('../db');
const fipe = require('../services/fipe');
const { naoEncontrado, requisicaoInvalida, conflito, rota } = require('../errors');

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/; // padrão antigo (ABC1234) e Mercosul (ABC1D23)

function validar(b) {
  const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PLACA.test(placa)) throw requisicaoInvalida('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
  if (!b.cliente_id) throw requisicaoInvalida('Selecione o cliente dono do veículo.');
  if (!b.marca?.trim() || !b.modelo?.trim()) throw requisicaoInvalida('Informe marca e modelo.');
  const tipo = b.tipo || 'cars';
  if (!fipe.TIPOS.includes(tipo)) throw requisicaoInvalida('Tipo de veículo inválido.');
  const int = (v) => (v === '' || v == null ? null : parseInt(v, 10));
  return {
    cliente_id: b.cliente_id,
    placa,
    tipo,
    marca: b.marca.trim(),
    modelo: b.modelo.trim(),
    ano_modelo: int(b.ano_modelo),
    combustivel: b.combustivel || null,
    cor: b.cor?.trim() || null,
    quilometragem: int(b.quilometragem),
    fipe_codigo: b.fipe_codigo || null,
    fipe_ano_id: b.fipe_ano_id || null,
    fipe_valor: b.fipe_valor || null,
    fipe_mes_referencia: b.fipe_mes_referencia || null,
    fipe_consultado_em: b.fipe_valor ? new Date().toISOString() : null,
  };
}

const SELECT = `
  SELECT v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone
    FROM veiculos v JOIN clientes c ON c.id = v.cliente_id`;

function tratarPlacaDuplicada(fn) {
  try {
    return fn();
  } catch (e) {
    if (String(e.message).includes('UNIQUE') && String(e.message).includes('placa'))
      throw conflito('Já existe um veículo cadastrado com essa placa.');
    if (String(e.message).includes('FOREIGN KEY')) throw requisicaoInvalida('Cliente não encontrado.');
    throw e;
  }
}

router.get('/', rota((req, res) => {
  const b = req.query.busca ? `%${req.query.busca}%` : '%';
  res.json(
    db.prepare(`${SELECT} WHERE v.placa LIKE ? OR v.modelo LIKE ? OR c.nome LIKE ? ORDER BY v.id DESC`)
      .all(b, b, b)
  );
}));

router.get('/:id', rota((req, res) => {
  const v = db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id);
  if (!v) throw naoEncontrado('Veículo');
  v.ordens = db
    .prepare('SELECT id, problema_relatado, situacao, orcamento_valor, criado_em FROM ordens_servico WHERE veiculo_id = ? ORDER BY id DESC')
    .all(v.id);
  res.json(v);
}));

router.post('/', rota((req, res) => {
  const d = validar(req.body);
  const id = tratarPlacaDuplicada(() =>
    db.prepare(
      `INSERT INTO veiculos (cliente_id, placa, tipo, marca, modelo, ano_modelo, combustivel, cor, quilometragem,
                             fipe_codigo, fipe_ano_id, fipe_valor, fipe_mes_referencia, fipe_consultado_em)
       VALUES (@cliente_id, @placa, @tipo, @marca, @modelo, @ano_modelo, @combustivel, @cor, @quilometragem,
               @fipe_codigo, @fipe_ano_id, @fipe_valor, @fipe_mes_referencia, @fipe_consultado_em)`
    ).run(d).lastInsertRowid
  );
  res.status(201).json(db.prepare(`${SELECT} WHERE v.id = ?`).get(id));
}));

router.put('/:id', rota((req, res) => {
  const d = { ...validar(req.body), id: req.params.id };
  const r = tratarPlacaDuplicada(() =>
    db.prepare(
      `UPDATE veiculos SET cliente_id=@cliente_id, placa=@placa, tipo=@tipo, marca=@marca, modelo=@modelo,
              ano_modelo=@ano_modelo, combustivel=@combustivel, cor=@cor, quilometragem=@quilometragem,
              fipe_codigo=COALESCE(@fipe_codigo, fipe_codigo), fipe_ano_id=COALESCE(@fipe_ano_id, fipe_ano_id),
              fipe_valor=COALESCE(@fipe_valor, fipe_valor),
              fipe_mes_referencia=COALESCE(@fipe_mes_referencia, fipe_mes_referencia),
              fipe_consultado_em=COALESCE(@fipe_consultado_em, fipe_consultado_em)
        WHERE id=@id`
    ).run(d)
  );
  if (!r.changes) throw naoEncontrado('Veículo');
  res.json(db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id));
}));

router.delete('/:id', rota((req, res) => {
  const r = db.prepare('DELETE FROM veiculos WHERE id = ?').run(req.params.id);
  if (!r.changes) throw naoEncontrado('Veículo');
  res.status(204).end();
}));

module.exports = router;
