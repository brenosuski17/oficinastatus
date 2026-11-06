const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { naoAutorizado, proibido, requisicaoInvalida, conflito, naoEncontrado } = require('../errors');

const VALIDADE_TOKEN = '12h';
const VALIDADE_CONVITE_DIAS = 7;

const publico = (u) =>
  u && { id: u.id, nome: u.nome, email: u.email, papel: u.papel, cliente_id: u.cliente_id, ativo: Boolean(u.ativo), tem_senha: Boolean(u.senha_hash) };

function emitirToken(u) {
  return jwt.sign({ sub: u.id, papel: u.papel }, config.jwtSecret(), { expiresIn: VALIDADE_TOKEN });
}

function validarSenha(senha) {
  if (!senha || senha.length < 8) throw requisicaoInvalida('A senha precisa ter pelo menos 8 caracteres.');
}

async function precisaConfigurar() {
  return (await db.prepare("SELECT COUNT(*) n FROM usuarios WHERE papel = 'admin'").get()).n === 0;
}

/** Cria o primeiro administrador (só funciona com o sistema vazio). */
const configurar = db.transaction(async ({ nome, email, senha }) => {
  if (!(await precisaConfigurar())) throw conflito('O sistema já foi configurado.');
  if (!nome?.trim() || !email?.trim()) throw requisicaoInvalida('Informe nome e e-mail.');
  validarSenha(senha);
  const { lastInsertRowid } = await db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, 'admin')")
    .run(nome.trim(), email.trim(), bcrypt.hashSync(senha, 10));
  const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
  return { token: emitirToken(u), usuario: publico(u) };
});

async function login({ email, senha }) {
  const u = await db.prepare('SELECT * FROM usuarios WHERE lower(email) = lower(?)').get(String(email || '').trim());
  if (!u || !u.senha_hash || !bcrypt.compareSync(String(senha || ''), u.senha_hash))
    throw naoAutorizado('E-mail ou senha incorretos.');
  if (!u.ativo) throw proibido('Este acesso foi desativado. Fale com a oficina.');
  return { token: emitirToken(u), usuario: publico(u) };
}

/** Gera (ou renova) o link para o usuário criar/redefinir a senha. */
async function gerarConvite(usuarioId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await db.prepare(
    `UPDATE usuarios SET convite_token = ?, convite_expira = now() + interval '${VALIDADE_CONVITE_DIAS} days' WHERE id = ?`
  ).run(token, usuarioId);
  return `${config.appUrl()}/criar-senha/${token}`;
}

async function lerConvite(token) {
  const u = await db
    .prepare('SELECT * FROM usuarios WHERE convite_token = ? AND convite_expira > now()')
    .get(token);
  if (!u) throw naoEncontrado('Link de acesso inválido ou expirado. Peça um novo');
  return u;
}

async function definirSenha(token, senha) {
  const u = await lerConvite(token);
  validarSenha(senha);
  await db.prepare('UPDATE usuarios SET senha_hash = ?, convite_token = NULL, convite_expira = NULL WHERE id = ?')
    .run(bcrypt.hashSync(senha, 10), u.id);
  const atualizado = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  return { token: emitirToken(atualizado), usuario: publico(atualizado) };
}

/** Garante que o cliente tenha uma conta (criada quando ele tem e-mail). */
async function garantirContaCliente(clienteId) {
  const c = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
  if (!c?.email) return null;
  const u = await db.prepare('SELECT * FROM usuarios WHERE cliente_id = ?').get(clienteId);
  if (u) {
    if ((u.email || '').toLowerCase() !== c.email.toLowerCase() || u.nome !== c.nome)
      await db.prepare('UPDATE usuarios SET email = ?, nome = ? WHERE id = ?').run(c.email, c.nome, u.id);
    return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  }
  const existe = await db.prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(c.email);
  if (existe) throw conflito('Já existe um acesso com este e-mail.');
  const { lastInsertRowid } = await db
    .prepare("INSERT INTO usuarios (nome, email, papel, cliente_id) VALUES (?, ?, 'cliente', ?)")
    .run(c.nome, c.email, clienteId);
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
}

/** Usuário do cliente para o vínculo com o bot. Quem não tem e-mail ganha um usuário sem acesso ao portal. */
async function garantirUsuarioDoCliente(clienteId) {
  const conta = await garantirContaCliente(clienteId);
  if (conta) return conta;
  const u = await db.prepare('SELECT * FROM usuarios WHERE cliente_id = ?').get(clienteId);
  if (u) return u;
  const c = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
  if (!c) throw naoEncontrado('Cliente');
  const { lastInsertRowid } = await db.prepare("INSERT INTO usuarios (nome, papel, cliente_id) VALUES (?, 'cliente', ?)").run(c.nome, clienteId);
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
}

// ---------------- Middlewares ----------------
async function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(naoAutorizado());
  let sub;
  try {
    ({ sub } = jwt.verify(token, config.jwtSecret()));
  } catch {
    return next(naoAutorizado('Sua sessão expirou. Entre novamente.'));
  }
  try {
    const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(sub);
    if (!u || !u.ativo) return next(naoAutorizado('Sessão inválida. Entre novamente.'));
    req.usuario = u;
    next();
  } catch (e) {
    next(e);
  }
}

const exigir = (...papeis) => (req, res, next) =>
  papeis.includes(req.usuario?.papel) ? next() : next(proibido());

const equipe = [autenticar, exigir('admin', 'mecanico')];
const somenteAdmin = [autenticar, exigir('admin')];

module.exports = {
  publico, login, configurar, precisaConfigurar, gerarConvite, lerConvite, definirSenha,
  garantirContaCliente, garantirUsuarioDoCliente, validarSenha, autenticar, exigir, equipe, somenteAdmin,
};
