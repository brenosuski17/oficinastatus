// Rotas menores: mensagens, FIPE, relatórios, integrações, portal do cliente e página pública.
const express = require('express');
const db = require('../db');
const auth = require('../services/auth');
const ordens = require('../services/ordens');
const fipe = require('../services/fipe');
const envio = require('../services/envio');
const relatorios = require('../services/relatorios');
const config = require('../config');
const { rota, naoEncontrado, requisicaoInvalida, proibido, conflito } = require('../errors');

// ------------------------------------------------------------- mensagens
const mensagens = express.Router();
mensagens.use(auth.equipe);
mensagens.get('/', rota((req, res) => {
  const where = [];
  const p = [];
  if (req.query.status) { where.push('m.status = ?'); p.push(req.query.status); }
  if (req.query.canal) { where.push('m.canal = ?'); p.push(req.query.canal); }
  if (req.usuario.papel === 'mecanico') { where.push('(o.mecanico_id IS NULL OR o.mecanico_id = ?)'); p.push(req.usuario.id); }
  res.json(db.prepare(
    `SELECT m.*, c.nome AS cliente_nome, v.placa, e.tipo AS etapa_tipo
       FROM mensagens m JOIN ordens_servico o ON o.id = m.ordem_id
       JOIN veiculos v ON v.id = o.veiculo_id JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN etapas e ON e.id = m.etapa_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 300`
  ).all(...p));
}));
// Envio manual pelo WhatsApp Web (quando a API da Meta não está configurada)
mensagens.post('/:id/enviada', rota((req, res) => {
  const r = db.prepare("UPDATE mensagens SET status = 'enviada', enviada_em = datetime('now') WHERE id = ? AND direcao = 'saida' AND link_envio IS NOT NULL").run(req.params.id);
  if (!r.changes) throw naoEncontrado('Mensagem');
  res.json(db.prepare('SELECT * FROM mensagens WHERE id = ?').get(req.params.id));
}));
// Tenta de novo uma mensagem que falhou
mensagens.post('/:id/reenviar', rota(async (req, res) => {
  const m = db.prepare("SELECT * FROM mensagens WHERE id = ? AND direcao = 'saida'").get(req.params.id);
  if (!m) throw naoEncontrado('Mensagem');
  if (m.link_envio) throw conflito('Esta mensagem é enviada manualmente pelo WhatsApp.');
  db.prepare("UPDATE mensagens SET status = 'pendente', erro = NULL WHERE id = ?").run(m.id);
  const o = db.prepare('SELECT o.codigo_publico, c.nome FROM ordens_servico o JOIN veiculos v ON v.id = o.veiculo_id JOIN clientes c ON c.id = v.cliente_id WHERE o.id = ?').get(m.ordem_id);
  const link = `${config.appUrl()}/acompanhar/${o.codigo_publico}`;
  await envio.despachar(m.id, { email: { link, titulo: m.assunto }, parametros: [o.nome.split(' ')[0], m.conteudo.split('\n')[0], link] });
  res.json(db.prepare('SELECT * FROM mensagens WHERE id = ?').get(m.id));
}));

// ------------------------------------------------------------- FIPE (proxy)
const fipeR = express.Router();
fipeR.use(auth.equipe);
fipeR.get('/:tipo/marcas', rota(async (req, res) => res.json(await fipe.marcas(req.params.tipo))));
fipeR.get('/:tipo/marcas/:marca/modelos', rota(async (req, res) => res.json(await fipe.modelos(req.params.tipo, req.params.marca))));
fipeR.get('/:tipo/marcas/:marca/modelos/:modelo/anos', rota(async (req, res) => res.json(await fipe.anos(req.params.tipo, req.params.marca, req.params.modelo))));
fipeR.get('/:tipo/marcas/:marca/modelos/:modelo/anos/:ano', rota(async (req, res) =>
  res.json(await fipe.valor(req.params.tipo, req.params.marca, req.params.modelo, req.params.ano))));

// ------------------------------------------------------------- relatórios e integrações (admin)
const admin = express.Router();
admin.get('/relatorios/painel', auth.somenteAdmin, rota((req, res) => res.json(relatorios.painel(req.usuario, Number(req.query.meses) || 6))));
admin.get('/integracoes', auth.equipe, rota((req, res) => res.json({ ...config.status(), app_url: config.appUrl(), oficina: config.oficina() })));
admin.post('/integracoes/teste-email', auth.somenteAdmin, rota(async (req, res) => {
  if (!config.status().email.ativo) throw requisicaoInvalida('Configure o SMTP no .env primeiro.');
  const para = req.body.para || req.usuario.email;
  const id = await envio.enviarEmail({ para, assunto: 'Teste de e-mail — OficinaStatus', texto: 'Se você recebeu esta mensagem, o envio de e-mails está funcionando.', titulo: 'Envio de e-mail funcionando' });
  res.json({ ok: true, para, id });
}));
admin.post('/integracoes/teste-whatsapp', auth.somenteAdmin, rota(async (req, res) => {
  if (!config.status().whatsapp.ativo) throw requisicaoInvalida('Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env primeiro.');
  if (!req.body.telefone) throw requisicaoInvalida('Informe o número de destino.');
  const id = await envio.enviarWhatsApp({ telefone: req.body.telefone, texto: 'Teste do OficinaStatus: o envio pelo WhatsApp está funcionando.', parametros: ['Teste', 'o envio pelo WhatsApp está funcionando.', config.appUrl()] });
  res.json({ ok: true, id });
}));

// ------------------------------------------------------------- portal do cliente (logado)
const portal = express.Router();
portal.use(auth.autenticar, auth.exigir('cliente'));
portal.get('/resumo', rota((req, res) => {
  const cliente = db.prepare('SELECT id, nome, email, telefone FROM clientes WHERE id = ?').get(req.usuario.cliente_id);
  const veiculos = db.prepare('SELECT id, placa, marca, modelo, ano_modelo, cor, tipo, fipe_valor, fipe_mes_referencia, quilometragem FROM veiculos WHERE cliente_id = ? ORDER BY id').all(req.usuario.cliente_id);
  const lista = ordens.listar(req.usuario).map((o) => ({
    id: o.id, veiculo_id: o.veiculo_id, placa: o.placa, etapa_atual: o.etapa_atual, situacao: o.situacao, aguardando_peca: o.aguardando_peca,
    problema_relatado: o.problema_relatado, total: ['recebido', 'diagnostico', 'orcamento'].includes(o.etapa_atual) ? null : o.total,
    total_aprovado: o.total_aprovado, previsao_entrega: o.previsao_entrega, criado_em: o.criado_em, atualizado_em: o.atualizado_em, entregue_em: o.entregue_em,
    etapas: o.etapas.map(({ tipo, status }) => ({ tipo, status })),
  }));
  res.json({ cliente, veiculos, ordens: lista, oficina: config.oficina() });
}));
function ordemDoCliente(req) {
  const o = ordens.buscar(req.params.id);
  if (o.cliente_id !== req.usuario.cliente_id) throw proibido();
  return o;
}
portal.get('/ordens/:id', rota((req, res) => res.json({ ...ordens.visaoCliente(ordemDoCliente(req)), oficina: config.oficina() })));
portal.post('/ordens/:id/resposta', rota((req, res) => {
  const o = ordemDoCliente(req);
  ordens.responderOrcamento(o.id, { itens: req.body.itens, observacao: req.body.observacao, origem: 'cliente' }, req.usuario);
  res.json({ ...ordens.visaoCliente(o), oficina: config.oficina() });
}));

// ------------------------------------------------------------- página pública (link enviado ao cliente)
const publico = express.Router();
publico.get('/ordens/:codigo', rota((req, res) => res.json({ ...ordens.visaoCliente(ordens.porCodigo(req.params.codigo)), oficina: config.oficina() })));
publico.post('/ordens/:codigo/resposta', rota((req, res) => {
  const o = ordens.porCodigo(req.params.codigo);
  ordens.responderOrcamento(o.id, { itens: req.body.itens, observacao: req.body.observacao, origem: 'cliente' }, null);
  res.json({ ...ordens.visaoCliente(o), oficina: config.oficina() });
}));

module.exports = { mensagens, fipe: fipeR, admin, portal, publico };
