// Webhook de status da Meta e testes de Integrações guardados na tabela mensagens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const SEGREDO = 'segredo-do-app';
let externo, api, base, T;
let proximaResposta = null;

before(async () => {
  externo = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const { status, corpo } = proximaResposta || { status: 200, corpo: { messages: [{ id: `wamid.${crypto.randomUUID()}` }] } };
      proximaResposta = null;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corpo));
    });
  });
  await new Promise((r) => externo.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    DB_PATH: ':memory:', JWT_SECRET: 'teste', APP_URL: 'http://oficina.test',
    WHATSAPP_API_URL: `http://127.0.0.1:${externo.address().port}`, WHATSAPP_TOKEN: 'token-meta', WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_TEMPLATE: 'atualizacao_os',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'token-verificacao', WHATSAPP_APP_SECRET: SEGREDO,
  });
  api = require('../src/app').listen(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
  T = (await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'admin@teste.com', senha: 'senhaforte1' })).dados.token;
});

after(() => { api?.close(); externo?.close(); });

async function chamar(metodo, rota, corpo, token = T) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: await r.json() };
}

function assinar(texto, segredo = SEGREDO) {
  return `sha256=${crypto.createHmac('sha256', segredo).update(texto).digest('hex')}`;
}
function avisar(statuses, assinatura) {
  const texto = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { statuses } }] }] });
  return fetch(`${base}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinatura ?? assinar(texto) },
    body: texto,
  });
}
const buscarTeste = async (id) => (await chamar('GET', '/mensagens?origem=teste')).dados.find((m) => m.id === id);
async function novoTeste() {
  const { dados } = await chamar('POST', '/integracoes/teste-whatsapp', { telefone: '(42) 99999-1234' });
  return buscarTeste(dados.mensagem_id);
}

test('verificação do cadastro devolve o challenge só com o token certo', async () => {
  const url = (token) => `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc123`;
  const certo = await fetch(url('token-verificacao'));
  assert.equal(certo.status, 200);
  assert.equal(await certo.text(), 'abc123');
  assert.equal((await fetch(url('errado'))).status, 403);
  assert.equal((await fetch(`${base}/webhooks/whatsapp`)).status, 403);
});

test('aviso sem assinatura válida é recusado e não altera a mensagem', async () => {
  const m = await novoTeste();
  const status = [{ id: m.id_externo, status: 'read', timestamp: '1700000000' }];
  assert.equal((await avisar(status, assinar('outro corpo'))).status, 401);
  assert.equal((await avisar(status, assinar(JSON.stringify(status), 'outro segredo'))).status, 401);
  assert.equal((await avisar(status, '')).status, 401);
  assert.equal((await buscarTeste(m.id)).status_entrega, null);
});

test('status avançam, ignorando avisos atrasados e repetidos', async () => {
  const m = await novoTeste();
  assert.equal(m.status, 'enviada');
  assert.equal(m.destinatario, '42999991234');
  assert.equal(m.ordem_id, null);

  assert.equal((await avisar([{ id: m.id_externo, status: 'sent', timestamp: '1700000000' }])).status, 200);
  let atual = await buscarTeste(m.id);
  assert.equal(atual.status_entrega, 'sent');
  assert.equal(atual.status_entrega_em, '2023-11-14 22:13:20');

  await avisar([{ id: m.id_externo, status: 'read', timestamp: '1700000100' }]);
  await avisar([{ id: m.id_externo, status: 'delivered', timestamp: '1700000050' }]);
  atual = await buscarTeste(m.id);
  assert.equal(atual.status_entrega, 'read');
  assert.equal(atual.status_entrega_em, '2023-11-14 22:15:00');
  assert.equal(atual.status, 'enviada');
});

test('falha guarda código e descrição, e reenviar limpa tudo', async () => {
  const m = await novoTeste();
  await avisar([{
    id: m.id_externo, status: 'failed', timestamp: '1700000000',
    errors: [{ code: 131047, title: 'Re-engagement message', message: 'Re-engagement message', error_data: { details: 'Mais de 24 horas desde a última resposta.' } }],
  }]);
  let atual = await buscarTeste(m.id);
  assert.equal(atual.status, 'falhou');
  assert.equal(atual.status_entrega, 'failed');
  assert.equal(atual.erro_codigo, 131047);
  assert.equal(atual.erro, 'Re-engagement message: Mais de 24 horas desde a última resposta.');

  // Aviso atrasado não apaga a falha
  await avisar([{ id: m.id_externo, status: 'sent', timestamp: '1699999999' }]);
  assert.equal((await buscarTeste(m.id)).status, 'falhou');

  const { dados: novo } = await chamar('POST', `/mensagens/${m.id}/reenviar`);
  assert.equal(novo.status, 'enviada');
  assert.equal(novo.status_entrega, null);
  assert.equal(novo.erro, null);
  assert.equal(novo.erro_codigo, null);
  assert.notEqual(novo.id_externo, m.id_externo);
});

test('aviso de mensagem desconhecida ou sem status é aceito sem erro', async () => {
  assert.equal((await avisar([{ id: 'wamid.outra', status: 'read' }])).status, 200);
  const texto = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'x' }] } }] }] });
  const r = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'X-Hub-Signature-256': assinar(texto) }, body: texto });
  assert.equal(r.status, 200);
});

test('teste recusado pela Meta fica guardado com o código do erro', async () => {
  proximaResposta = { status: 400, corpo: { error: { message: '(#131030) Recipient phone number not in allowed list', code: 131030 } } };
  const r = await chamar('POST', '/integracoes/teste-whatsapp', { telefone: '42999991234' });
  assert.equal(r.status, 502);
  assert.match(r.dados.erro, /131030/);
  const [m] = (await chamar('GET', '/mensagens?origem=teste')).dados;
  assert.equal(m.status, 'falhou');
  assert.equal(m.erro_codigo, 131030);
});

test('mecânico não vê os testes de Integrações', async () => {
  const { dados: { usuario: mec } } = await chamar('POST', '/equipe', { nome: 'Mecânico', email: 'mec@teste.com', papel: 'mecanico' });
  const db = require('../src/db');
  const bcrypt = require('bcryptjs');
  db.prepare('UPDATE usuarios SET senha_hash = ?, convite_token = NULL WHERE id = ?').run(bcrypt.hashSync('senhaforte1', 4), mec.id);
  const { dados: login } = await chamar('POST', '/auth/login', { email: 'mec@teste.com', senha: 'senhaforte1' }, null);
  const { dados: lista } = await chamar('GET', '/mensagens', null, login.token);
  assert.deepEqual(lista, []);
});

test('banco antigo é migrado sem perder mensagens', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-migracao-'));
  const arquivo = path.join(pasta, 'antigo.db');
  try {
    const antigo = new DatabaseSync(arquivo);
    antigo.exec(`PRAGMA foreign_keys = OFF;
      CREATE TABLE mensagens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ordem_id      INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
        etapa_id INTEGER, canal TEXT NOT NULL, direcao TEXT NOT NULL, destinatario TEXT, assunto TEXT, conteudo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente', erro TEXT, id_externo TEXT, link_envio TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), enviada_em TEXT
      );
      INSERT INTO mensagens (ordem_id, canal, direcao, conteudo) VALUES (7, 'whatsapp', 'saida', 'antiga');`);
    antigo.close();

    const r = spawnSync(process.execPath, ['-e', "require('./src/db')"], { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH: arquivo }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    // Rodar de novo não pode fazer nada
    assert.equal(spawnSync(process.execPath, ['-e', "require('./src/db')"], { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH: arquivo } }).status, 0);

    const novo = new DatabaseSync(arquivo);
    const colunas = novo.prepare('PRAGMA table_info(mensagens)').all();
    assert.equal(colunas.find((c) => c.name === 'ordem_id').notnull, 0);
    assert.ok(colunas.some((c) => c.name === 'status_entrega'));
    assert.equal(novo.prepare('SELECT ordem_id, conteudo FROM mensagens').get().conteudo, 'antiga');
    assert.ok(novo.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_mensagens_ordem'").get());
    novo.close();
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
