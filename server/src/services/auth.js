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

function precisaConfigurar() {
  return db.prepare("SELECT COUNT(*) n FROM usuarios WHERE papel = 'admin'").get().n === 0;
}

/** Cria o primeiro administrador (só funciona com o sistema vazio). */
function configurar({ nome, email, senha }) {
  if (!precisaConfigurar()) throw conflito('O sistema já foi configurado.');
  if (!nome?.trim() || !email?.trim()) throw requisicaoInvalida('Informe nome e e-mail.');
  validarSenha(senha);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, 'admin')")
    .run(nome.trim(), email.trim(), bcrypt.hashSync(senha, 10));
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
  return { token: emitirToken(u), usuario: publico(u) };
}

function login({ email, senha }) {
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email || '').trim());
  if (!u || !u.senha_hash || !bcrypt.compareSync(String(senha || ''), u.senha_hash))
    throw naoAutorizado('E-mail ou senha incorretos.');
  if (!u.ativo) throw proibido('Este acesso foi desativado. Fale com a oficina.');
  return { token: emitirToken(u), usuario: publico(u) };
}

/** Gera (ou renova) o link para o usuário criar/redefinir a senha. */
function gerarConvite(usuarioId) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare(
    `UPDATE usuarios SET convite_token = ?, convite_expira = datetime('now', '+${VALIDADE_CONVITE_DIAS} days') WHERE id = ?`
  ).run(token, usuarioId);
  return `${config.appUrl()}/criar-senha/${token}`;
}

function lerConvite(token) {
  const u = db
    .prepare("SELECT * FROM usuarios WHERE convite_token = ? AND convite_expira > datetime('now')")
    .get(token);
  if (!u) throw naoEncontrado('Link de acesso inválido ou expirado. Peça um novo');
  return u;
}

function definirSenha(token, senha) {
  const u = lerConvite(token);
  validarSenha(senha);
  db.prepare('UPDATE usuarios SET senha_hash = ?, convite_token = NULL, convite_expira = NULL WHERE id = ?')
    .run(bcrypt.hashSync(senha, 10), u.id);
  const atualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  return { token: emitirToken(atualizado), usuario: publico(atualizado) };
}

/** Garante que o cliente tenha uma conta (criada quando ele tem e-mail). */
function garantirContaCliente(clienteId) {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
  if (!c?.email) return null;
  let u = db.prepare('SELECT * FROM usuarios WHERE cliente_id = ?').get(clienteId);
  if (u) {
    if (u.email.toLowerCase() !== c.email.toLowerCase() || u.nome !== c.nome)
      db.prepare('UPDATE usuarios SET email = ?, nome = ? WHERE id = ?').run(c.email, c.nome, u.id);
    return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  }
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(c.email);
  if (existe) throw conflito('Já existe um acesso com este e-mail.');
  const { lastInsertRowid } = db
    .prepare("INSERT INTO usuarios (nome, email, papel, cliente_id) VALUES (?, ?, 'cliente', ?)")
    .run(c.nome, c.email, clienteId);
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
}

// ---------------- Middlewares ----------------
function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(naoAutorizado());
  try {
    const { sub } = jwt.verify(token, config.jwtSecret());
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(sub);
    if (!u || !u.ativo) return next(naoAutorizado('Sessão inválida. Entre novamente.'));
    req.usuario = u;
    next();
  } catch {
    next(naoAutorizado('Sua sessão expirou. Entre novamente.'));
  }
}

const exigir = (...papeis) => (req, res, next) =>
  papeis.includes(req.usuario?.papel) ? next() : next(proibido());

const equipe = [autenticar, exigir('admin', 'mecanico')];
const somenteAdmin = [autenticar, exigir('admin')];

module.exports = {
  publico, login, configurar, precisaConfigurar, gerarConvite, lerConvite, definirSenha,
  garantirContaCliente, validarSenha, autenticar, exigir, equipe, somenteAdmin,
};
