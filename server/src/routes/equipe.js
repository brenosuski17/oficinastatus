const router = require('express').Router();
const db = require('../db');
const auth = require('../services/auth');
const envio = require('../services/envio');
const config = require('../config');
const { rota, requisicaoInvalida, conflito, naoEncontrado } = require('../errors');

const LISTA = `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.senha_hash IS NOT NULL AS tem_senha, u.criado_em,
                      (SELECT COUNT(*) FROM ordens_servico o WHERE o.mecanico_id = u.id AND o.situacao = 'aberta') AS os_abertas
                 FROM usuarios u WHERE u.papel IN ('admin','mecanico')`;

// Lista de mecânicos (para atribuir OS) — qualquer pessoa da equipe
router.get('/mecanicos', auth.equipe, rota((req, res) =>
  res.json(db.prepare(`${LISTA} AND u.ativo = 1 ORDER BY u.nome`).all())));

router.use(auth.somenteAdmin);

router.get('/', rota((req, res) => res.json(db.prepare(`${LISTA} ORDER BY u.ativo DESC, u.nome`).all())));

async function enviarConvite(u, link) {
  if (!config.status().email.ativo) return false;
  try {
    await envio.enviarEmail({
      para: u.email,
      assunto: `Convite para a equipe — ${config.oficina().nome}`,
      titulo: 'Você foi adicionado à equipe',
      texto: `Olá, ${u.nome.split(' ')[0]}! Você recebeu acesso ao sistema da ${config.oficina().nome} como ${u.papel === 'admin' ? 'administrador' : 'mecânico'}.\nCrie sua senha pelo botão abaixo. O link vale por 7 dias.`,
      link,
      botao: 'Criar minha senha',
    });
    return true;
  } catch (e) {
    console.error('[convite]', e.message);
    return false;
  }
}

router.post('/', rota(async (req, res) => {
  const { nome, email, papel } = req.body;
  if (!nome?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) throw requisicaoInvalida('Informe nome e um e-mail válido.');
  if (!['admin', 'mecanico'].includes(papel)) throw requisicaoInvalida('Papel deve ser admin ou mecânico.');
  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.trim())) throw conflito('Já existe um acesso com este e-mail.');
  const { lastInsertRowid } = db.prepare('INSERT INTO usuarios (nome, email, papel) VALUES (?, ?, ?)').run(nome.trim(), email.trim(), papel);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
  const link = auth.gerarConvite(u.id);
  res.status(201).json({ usuario: auth.publico(u), link_convite: link, email_enviado: await enviarConvite(u, link) });
}));

router.put('/:id', rota((req, res) => {
  const u = db.prepare("SELECT * FROM usuarios WHERE id = ? AND papel IN ('admin','mecanico')").get(req.params.id);
  if (!u) throw naoEncontrado('Usuário');
  const papel = req.body.papel ?? u.papel;
  const ativo = req.body.ativo ?? Boolean(u.ativo);
  if (!['admin', 'mecanico'].includes(papel)) throw requisicaoInvalida('Papel inválido.');
  if (u.id === req.usuario.id && (!ativo || papel !== 'admin')) throw conflito('Você não pode remover o seu próprio acesso de administrador.');
  db.prepare('UPDATE usuarios SET nome = ?, papel = ?, ativo = ? WHERE id = ?').run(req.body.nome?.trim() || u.nome, papel, ativo ? 1 : 0, u.id);
  res.json(auth.publico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id)));
}));

router.post('/:id/convite', rota(async (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) throw naoEncontrado('Usuário');
  const link = auth.gerarConvite(u.id);
  res.json({ link_convite: link, email_enviado: await enviarConvite(u, link) });
}));

module.exports = router;
