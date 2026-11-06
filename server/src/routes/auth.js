const router = require('express').Router();
const db = require('../db');
const auth = require('../services/auth');
const envio = require('../services/envio');
const config = require('../config');
const { rota, HttpError } = require('../errors');

router.get('/estado', rota(async (req, res) =>
  res.json({ precisa_configurar: await auth.precisaConfigurar(), oficina: config.oficina() })));

// Primeiro acesso: cria o administrador da oficina
router.post('/configurar', rota(async (req, res) => res.status(201).json(await auth.configurar(req.body))));

router.post('/login', rota(async (req, res) => res.json(await auth.login(req.body))));

router.get('/eu', auth.autenticar, rota((req, res) => res.json(auth.publico(req.usuario))));

router.get('/convite/:token', rota(async (req, res) => {
  const u = await auth.lerConvite(req.params.token);
  res.json({ nome: u.nome, email: u.email, papel: u.papel, tem_senha: Boolean(u.senha_hash) });
}));

router.post('/convite/:token', rota(async (req, res) => res.json(await auth.definirSenha(req.params.token, req.body.senha))));

// Esqueci a senha / primeiro acesso do cliente: envia o link por e-mail
router.post('/esqueci', rota(async (req, res) => {
  if (!config.status().email.ativo)
    throw new HttpError(503, 'O envio de e-mail não está configurado. Peça o link de acesso diretamente à oficina.');
  const u = await db.prepare('SELECT * FROM usuarios WHERE lower(email) = lower(?) AND ativo = 1').get(String(req.body.email || '').trim());
  if (u) {
    const link = await auth.gerarConvite(u.id);
    await envio.enviarEmail({
      para: u.email,
      assunto: `Seu acesso — ${config.oficina().nome}`,
      titulo: u.senha_hash ? 'Redefinir sua senha' : 'Criar seu acesso',
      texto: `Olá, ${u.nome.split(' ')[0]}! Use o botão abaixo para ${u.senha_hash ? 'redefinir sua senha' : 'criar sua senha'}. O link vale por 7 dias.\nSe você não pediu, ignore este e-mail.`,
      link,
      botao: u.senha_hash ? 'Redefinir senha' : 'Criar senha',
    }).catch((e) => console.error('[esqueci]', e.message));
  }
  // Resposta igual para e-mails existentes ou não, para não revelar quem tem cadastro
  res.json({ ok: true });
}));

module.exports = router;
