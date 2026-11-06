const router = require('express').Router();
const db = require('../db');
const auth = require('../services/auth');
const envio = require('../services/envio');
const canais = require('../services/canais');
const config = require('../config');
const { naoEncontrado, requisicaoInvalida, rota } = require('../errors');

router.use(auth.equipe);

function validar({ nome, telefone, email, cpf }) {
  if (!nome?.trim()) throw requisicaoInvalida('Informe o nome do cliente.');
  const tel = String(telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (tel.length < 10 || tel.length > 11) throw requisicaoInvalida('Informe o telefone com DDD, ex.: (42) 99999-9999.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw requisicaoInvalida('E-mail inválido.');
  const c = String(cpf || '').replace(/\D/g, '');
  if (c && c.length !== 11) throw requisicaoInvalida('CPF deve ter 11 dígitos.');
  return { nome: nome.trim(), telefone: tel, email: email?.trim() || null, cpf: c || null };
}

const SELECT = `
  SELECT c.*, COUNT(DISTINCT v.id) AS total_veiculos,
         u.id AS usuario_id, (u.senha_hash IS NOT NULL)::int AS tem_acesso,
         EXISTS (SELECT 1 FROM canais_usuario cu WHERE cu.usuario_id = u.id AND cu.ativo)::int AS telegram_ativo
    FROM clientes c
    LEFT JOIN veiculos v ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON u.cliente_id = c.id`;

router.get('/', rota(async (req, res) => {
  const b = req.query.busca ? `%${req.query.busca}%` : '%';
  res.json(await db.prepare(`${SELECT} WHERE c.nome ILIKE ? OR c.telefone ILIKE ? OR COALESCE(c.email,'') ILIKE ? GROUP BY c.id, u.id ORDER BY c.nome`).all(b, b, b));
}));

router.get('/:id', rota(async (req, res) => {
  const c = await db.prepare(`${SELECT} WHERE c.id = ? GROUP BY c.id, u.id`).get(req.params.id);
  if (!c) throw naoEncontrado('Cliente');
  c.veiculos = await db.prepare('SELECT * FROM veiculos WHERE cliente_id = ? ORDER BY id DESC').all(c.id);
  res.json(c);
}));

const salvar = db.transaction(async (id, d) => {
  if (id) {
    const r = await db.prepare('UPDATE clientes SET nome = ?, telefone = ?, email = ?, cpf = ? WHERE id = ?').run(d.nome, d.telefone, d.email, d.cpf, id);
    if (!r.changes) throw naoEncontrado('Cliente');
  } else {
    id = (await db.prepare('INSERT INTO clientes (nome, telefone, email, cpf) VALUES (?, ?, ?, ?)').run(d.nome, d.telefone, d.email, d.cpf)).lastInsertRowid;
  }
  await auth.garantirContaCliente(id);
  return db.prepare(`${SELECT} WHERE c.id = ? GROUP BY c.id, u.id`).get(id);
});

router.post('/', rota(async (req, res) => res.status(201).json(await salvar(null, validar(req.body)))));
router.put('/:id', rota(async (req, res) => res.json(await salvar(req.params.id, validar(req.body)))));

router.delete('/:id', auth.exigir('admin'), rota(async (req, res) => {
  const r = await db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  if (!r.changes) throw naoEncontrado('Cliente');
  res.status(204).end();
}));

// Gera o link para o cliente criar a senha do portal (e envia por e-mail, se configurado)
router.post('/:id/convite', rota(async (req, res) => {
  const conta = await auth.garantirContaCliente(req.params.id);
  if (!conta) throw requisicaoInvalida('Cadastre um e-mail para o cliente ter acesso ao portal.');
  const link = await auth.gerarConvite(conta.id);
  let email_enviado = false;
  if (config.status().email.ativo) {
    email_enviado = await envio.enviarEmail({
      para: conta.email,
      assunto: `Seu acesso ao portal — ${config.oficina().nome}`,
      titulo: 'Acompanhe seus veículos online',
      texto: `Olá, ${conta.nome.split(' ')[0]}! Crie sua senha para acompanhar os serviços, aprovar orçamentos e ver o histórico dos seus veículos.\nO link vale por 7 dias.`,
      link,
      botao: 'Criar minha senha',
    }).then(() => true).catch(() => false);
  }
  res.json({ link_convite: link, email_enviado });
}));

// Link do bot para o cliente vincular o Telegram
router.post('/:id/telegram', rota(async (req, res) => {
  const u = await db.transaction(() => auth.garantirUsuarioDoCliente(req.params.id))();
  res.json({ link: await canais.gerarLink(u.id), vinculado: Boolean(await canais.ativoDoUsuario(u.id)) });
}));

module.exports = router;
