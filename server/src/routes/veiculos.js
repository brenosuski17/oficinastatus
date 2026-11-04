const router = require('express').Router();
const db = require('../db');
const auth = require('../services/auth');
const placaSvc = require('../services/placa');
const fipe = require('../services/fipe');
const { naoEncontrado, requisicaoInvalida, conflito, rota } = require('../errors');

router.use(auth.equipe);

function validar(b) {
  const placa = placaSvc.normalizarPlaca(b.placa);
  if (!placaSvc.PLACA.test(placa)) throw requisicaoInvalida('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
  if (!b.cliente_id) throw requisicaoInvalida('Selecione o dono do veículo.');
  if (!b.marca?.trim() || !b.modelo?.trim()) throw requisicaoInvalida('Informe marca e modelo.');
  const tipo = b.tipo || 'cars';
  if (!fipe.TIPOS.includes(tipo)) throw requisicaoInvalida('Tipo de veículo inválido.');
  const int = (v) => (v === '' || v == null ? null : parseInt(v, 10));
  return {
    cliente_id: b.cliente_id, placa, tipo,
    marca: b.marca.trim(), modelo: b.modelo.trim(),
    ano_fabricacao: int(b.ano_fabricacao), ano_modelo: int(b.ano_modelo),
    combustivel: b.combustivel || null, cor: b.cor?.trim() || null, quilometragem: int(b.quilometragem),
    fipe_codigo: b.fipe_codigo || null, fipe_ano_id: b.fipe_ano_id || null,
    fipe_valor: b.fipe_valor || null, fipe_mes_referencia: b.fipe_mes_referencia || null,
    fipe_consultado_em: b.fipe_valor ? new Date().toISOString() : null,
    origem_dados: ['manual', 'fipe', 'placa'].includes(b.origem_dados) ? b.origem_dados : b.fipe_valor ? 'fipe' : 'manual',
  };
}

const SELECT = `
  SELECT v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         (SELECT o.id FROM ordens_servico o WHERE o.veiculo_id = v.id AND o.situacao = 'aberta') AS os_aberta
    FROM veiculos v JOIN clientes c ON c.id = v.cliente_id`;

function traduzirErro(fn) {
  try { return fn(); } catch (e) {
    if (/UNIQUE.*placa/.test(e.message)) throw conflito('Já existe um veículo cadastrado com essa placa.');
    if (/FOREIGN KEY/.test(e.message)) throw requisicaoInvalida('Cliente não encontrado.');
    throw e;
  }
}

router.get('/', rota((req, res) => {
  const b = req.query.busca ? `%${req.query.busca}%` : '%';
  const bp = req.query.busca ? `%${placaSvc.normalizarPlaca(req.query.busca)}%` : '%';
  res.json(db.prepare(`${SELECT} WHERE v.placa LIKE ? OR v.modelo LIKE ? OR c.nome LIKE ? ORDER BY v.id DESC`).all(bp, b, b));
}));

/**
 * Busca pela placa: primeiro no cadastro da oficina; se não houver, consulta a API de placas.
 * Resposta: { cadastrado: veiculo } ou { consulta: { veiculo, fipe_marca } }.
 */
router.get('/placa/:placa', rota(async (req, res) => {
  const placa = placaSvc.normalizarPlaca(req.params.placa);
  if (!placaSvc.PLACA.test(placa)) throw requisicaoInvalida('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
  const local = db.prepare(`${SELECT} WHERE v.placa = ?`).get(placa);
  if (local) return res.json({ cadastrado: local });
  res.json({ consulta: await placaSvc.consultar(placa) });
}));

router.get('/:id', rota((req, res) => {
  const v = db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id);
  if (!v) throw naoEncontrado('Veículo');
  v.ordens = db.prepare('SELECT id, problema_relatado, situacao, criado_em, entregue_em FROM ordens_servico WHERE veiculo_id = ? ORDER BY id DESC').all(v.id);
  res.json(v);
}));

const CAMPOS = 'cliente_id, placa, tipo, marca, modelo, ano_fabricacao, ano_modelo, combustivel, cor, quilometragem, fipe_codigo, fipe_ano_id, fipe_valor, fipe_mes_referencia, fipe_consultado_em, origem_dados';

router.post('/', rota((req, res) => {
  const d = validar(req.body);
  const id = traduzirErro(() =>
    db.prepare(`INSERT INTO veiculos (${CAMPOS}) VALUES (${CAMPOS.split(', ').map((c) => '@' + c).join(', ')})`).run(d).lastInsertRowid);
  res.status(201).json(db.prepare(`${SELECT} WHERE v.id = ?`).get(id));
}));

router.put('/:id', rota((req, res) => {
  const d = { ...validar(req.body), id: req.params.id };
  const sets = CAMPOS.split(', ').map((c) => (c.startsWith('fipe_') ? `${c} = COALESCE(@${c}, ${c})` : `${c} = @${c}`)).join(', ');
  const r = traduzirErro(() => db.prepare(`UPDATE veiculos SET ${sets} WHERE id = @id`).run(d));
  if (!r.changes) throw naoEncontrado('Veículo');
  res.json(db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id));
}));

router.delete('/:id', auth.exigir('admin'), rota((req, res) => {
  const r = db.prepare('DELETE FROM veiculos WHERE id = ?').run(req.params.id);
  if (!r.changes) throw naoEncontrado('Veículo');
  res.status(204).end();
}));

module.exports = router;
