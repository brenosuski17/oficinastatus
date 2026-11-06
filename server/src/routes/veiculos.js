const router = require('express').Router();
const db = require('../db');
const auth = require('../services/auth');
const placaSvc = require('../services/placa');
const fipe = require('../services/fipe');
const ordens = require('../services/ordens');
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
    carroceria: ['hatch', 'sedan', 'suv', 'picape'].includes(b.carroceria) ? b.carroceria : 'hatch',
  };
}

const SELECT = `
  SELECT v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         (SELECT o.id FROM ordens_servico o WHERE o.veiculo_id = v.id AND o.situacao = 'aberta' ORDER BY o.id DESC LIMIT 1) AS os_aberta,
         (SELECT o.id FROM ordens_servico o WHERE o.veiculo_id = v.id ORDER BY o.id DESC LIMIT 1) AS ultima_os,
         (SELECT COUNT(*) FROM ordens_servico o WHERE o.veiculo_id = v.id) AS total_os
    FROM veiculos v JOIN clientes c ON c.id = v.cliente_id`;

/** Acrescenta a etapa e a data da última OS (cartões de Veículos). */
async function comUltima(v) {
  if (!v?.ultima_os) return v;
  const o = await ordens.buscar(v.ultima_os);
  return { ...v, ultima_os_etapa: o.etapa_atual, ultima_os_data: o.criado_em, ultima_os_avarias: o.qtd_avarias };
}

async function traduzirErro(fn) {
  try { return await fn(); } catch (e) {
    if (e.code === '23505' && /placa/.test(e.constraint)) throw conflito('Já existe um veículo cadastrado com essa placa.');
    if (e.code === '23503') throw requisicaoInvalida('Cliente não encontrado.');
    throw e;
  }
}

router.get('/', rota(async (req, res) => {
  const b = req.query.busca ? `%${req.query.busca}%` : '%';
  const bp = req.query.busca ? `%${placaSvc.normalizarPlaca(req.query.busca)}%` : '%';
  const lista = await db.prepare(`${SELECT} WHERE v.placa ILIKE ? OR v.modelo ILIKE ? OR c.nome ILIKE ? ORDER BY v.id DESC`).all(bp, b, b);
  res.json(await Promise.all(lista.map(comUltima)));
}));

/**
 * Busca pela placa: primeiro no cadastro da oficina; se não houver, consulta a API de placas.
 * Resposta: { cadastrado: veiculo } ou { consulta: { veiculo, fipe_marca } }.
 */
router.get('/placa/:placa', rota(async (req, res) => {
  const placa = placaSvc.normalizarPlaca(req.params.placa);
  if (!placaSvc.PLACA.test(placa)) throw requisicaoInvalida('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
  const local = await db.prepare(`${SELECT} WHERE v.placa = ?`).get(placa);
  if (local) return res.json({ cadastrado: local });
  res.json({ consulta: await placaSvc.consultar(placa) });
}));

router.get('/:id', rota(async (req, res) => {
  const v = await db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id);
  if (!v) throw naoEncontrado('Veículo');
  v.ordens = await db.prepare('SELECT id, problema_relatado, situacao, criado_em, entregue_em FROM ordens_servico WHERE veiculo_id = ? ORDER BY id DESC').all(v.id);
  res.json(v);
}));

const CAMPOS = ['cliente_id', 'placa', 'tipo', 'marca', 'modelo', 'ano_fabricacao', 'ano_modelo', 'combustivel', 'cor', 'quilometragem', 'fipe_codigo', 'fipe_ano_id', 'fipe_valor', 'fipe_mes_referencia', 'fipe_consultado_em', 'origem_dados', 'carroceria'];

router.post('/', rota(async (req, res) => {
  const d = validar(req.body);
  const { lastInsertRowid: id } = await traduzirErro(() =>
    db.prepare(`INSERT INTO veiculos (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`).run(...CAMPOS.map((c) => d[c])));
  res.status(201).json(await db.prepare(`${SELECT} WHERE v.id = ?`).get(id));
}));

router.put('/:id', rota(async (req, res) => {
  const d = validar(req.body);
  const sets = CAMPOS.map((c) => (c.startsWith('fipe_') ? `${c} = COALESCE(?, ${c})` : `${c} = ?`)).join(', ');
  const r = await traduzirErro(() => db.prepare(`UPDATE veiculos SET ${sets} WHERE id = ?`).run(...CAMPOS.map((c) => d[c]), req.params.id));
  if (!r.changes) throw naoEncontrado('Veículo');
  res.json(await db.prepare(`${SELECT} WHERE v.id = ?`).get(req.params.id));
}));

router.delete('/:id', auth.exigir('admin'), rota(async (req, res) => {
  const r = await db.prepare('DELETE FROM veiculos WHERE id = ?').run(req.params.id);
  if (!r.changes) throw naoEncontrado('Veículo');
  res.status(204).end();
}));

module.exports = router;
