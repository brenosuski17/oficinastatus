// Migrations e comportamentos que dependem do PostgreSQL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarBancoDeTeste } = require('./apoio');

let apagarBanco, api, base, T, db, migracoes;

before(async () => {
  Object.assign(process.env, { JWT_SECRET: 'teste', SMTP_HOST: '', WHATSAPP_TOKEN: '' });
  apagarBanco = await criarBancoDeTeste();
  db = require('../src/db');
  migracoes = require('../src/migrar');
  api = require('../src/app').listen(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
  T = (await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'Admin@Teste.com', senha: 'senhaforte1' })).dados.token;
});
after(async () => { api?.close(); await apagarBanco?.(); });

async function chamar(metodo, rota, corpo, token = T) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
}

async function novoVeiculo(placa, telefone) {
  const c = (await chamar('POST', '/clientes', { nome: `Cliente ${placa}`, telefone })).dados;
  return (await chamar('POST', '/veiculos', { cliente_id: c.id, placa, marca: 'VW', modelo: 'Golf' })).dados;
}

test('migrations rodam uma vez, em ordem, e recusam arquivo alterado', async () => {
  assert.deepEqual(await migracoes.migrar(), []);
  assert.deepEqual(await migracoes.pendentes(), []);
  const { versao } = await db.prepare('SELECT versao FROM schema_migrations').get();
  assert.equal(versao, '001_inicial.sql');

  const original = path.join(__dirname, '..', 'migrations');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  try {
    fs.copyFileSync(path.join(original, '001_inicial.sql'), path.join(pasta, '001_inicial.sql'));
    fs.writeFileSync(path.join(pasta, '002_nova.sql'), 'CREATE TABLE tabela_nova (id INTEGER PRIMARY KEY);');
    assert.deepEqual(await migracoes.pendentes(pasta), ['002_nova.sql']);
    assert.deepEqual(await migracoes.migrar(pasta), ['002_nova.sql']);
    assert.deepEqual(await migracoes.migrar(pasta), []);

    // Uma migration com erro é desfeita por inteiro
    fs.writeFileSync(path.join(pasta, '003_quebrada.sql'), 'CREATE TABLE outra (id INTEGER); SELECT coluna_que_nao_existe;');
    await assert.rejects(migracoes.migrar(pasta));
    assert.equal((await db.prepare("SELECT to_regclass('outra') AS t").get()).t, null);
    fs.rmSync(path.join(pasta, '003_quebrada.sql'));

    fs.appendFileSync(path.join(pasta, '001_inicial.sql'), '\n-- editada depois');
    await assert.rejects(migracoes.migrar(pasta), /foi alterada/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
    await db.exec("DROP TABLE tabela_nova; DELETE FROM schema_migrations WHERE versao = '002_nova.sql'");
  }
});

test('e-mail e buscas não diferenciam maiúsculas', async () => {
  assert.equal((await chamar('POST', '/auth/login', { email: 'admin@TESTE.com', senha: 'senhaforte1' }, null)).status, 200);
  assert.equal((await chamar('POST', '/equipe', { nome: 'Outro', email: 'ADMIN@teste.COM', papel: 'mecanico' })).status, 409);

  await novoVeiculo('BUS1A23', '42911110001');
  assert.equal((await chamar('GET', '/clientes?busca=cliente%20bus')).dados.length, 1);
  assert.equal((await chamar('GET', '/veiculos?busca=GOLF')).dados.length >= 1, true);
  assert.equal((await chamar('GET', '/catalogo?busca=MARTELINHO')).dados.length > 0, true);
});

test('API mantém os formatos do front-end', async () => {
  const v = await novoVeiculo('FMT1A23', '42911110002');
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Teste', previsao_entrega: '2026-12-25' });
  assert.match(o.criado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/); // UTC, sem fuso
  assert.equal(o.previsao_entrega, '2026-12-25');
  assert.equal(o.qtd_itens, 0); // COUNT como número
  await chamar('POST', `/ordens/${o.id}/diagnostico`, { diagnostico: 'ok' });
  const { dados: i } = await chamar('POST', `/ordens/${o.id}/itens`, { tipo: 'peca', descricao: 'Peça', quantidade: 1.5, valor_unitario: 10.1 });
  assert.equal(i.total, 15.15); // NUMERIC como número
  assert.equal(i.itens[0].valor_unitario, 10.1);
  const { dados: env } = await chamar('POST', `/ordens/${o.id}/orcamento/enviar`, {});
  const { dados: apr } = await chamar('POST', `/ordens/${o.id}/aprovacao`, { itens: { [env.itens[0].id]: true } });
  assert.equal(apr.itens[0].aprovado, 1); // o client compara com === 1
  assert.equal((await chamar('GET', '/clientes')).dados.every((c) => typeof c.total_veiculos === 'number'), true);
});

test('ids e dados inválidos não viram erro 500', async () => {
  assert.equal((await chamar('GET', '/ordens/abc')).status, 404);
  assert.equal((await chamar('GET', '/ordens/99999999999')).status, 404);
  assert.equal((await chamar('GET', '/clientes/abc')).status, 404);
  const v = await novoVeiculo('INV1A23', '42911110003');
  assert.equal((await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'x', previsao_entrega: 'data ruim' })).status, 400);
  assert.equal((await chamar('POST', '/veiculos', { cliente_id: 999999, placa: 'INV2A23', marca: 'VW', modelo: 'Gol' })).status, 400);
  assert.equal((await chamar('POST', '/veiculos', { cliente_id: v.cliente_id, placa: 'INV1A23', marca: 'VW', modelo: 'Gol' })).status, 409);
});

test('pedidos simultâneos não abrem duas OS nem avançam a etapa duas vezes', async () => {
  const v = await novoVeiculo('CON1A23', '42911110004');
  const abrir = () => chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Simultâneo' });
  const abertas = await Promise.all([abrir(), abrir(), abrir(), abrir()]);
  assert.deepEqual(abertas.map((r) => r.status).sort(), [201, 409, 409, 409]);

  const os = abertas.find((r) => r.status === 201).dados;
  const diag = () => chamar('POST', `/ordens/${os.id}/diagnostico`, { diagnostico: 'ok' });
  const r = await Promise.all([diag(), diag(), diag()]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409, 409]);
});

test('transação desfeita não grava nada nem dispara o que viria depois do commit', async () => {
  const antes = (await db.prepare('SELECT COUNT(*) n FROM clientes').get()).n;
  let disparou = 0;
  const falha = db.transaction(async () => {
    await db.prepare("INSERT INTO clientes (nome, telefone) VALUES ('Desfeito', '42900000000')").run();
    db.aposCommit(() => { disparou++; });
    throw new Error('falha de propósito');
  });
  await assert.rejects(falha(), /de propósito/);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM clientes').get()).n, antes);
  assert.equal(disparou, 0);

  // Só o trecho interno é desfeito quando o erro é tratado
  const parcial = db.transaction(async () => {
    await db.prepare("INSERT INTO clientes (nome, telefone) VALUES ('Fica', '42900000001')").run();
    const interna = db.transaction(async () => {
      await db.prepare("INSERT INTO clientes (nome, telefone) VALUES ('Sai', '42900000002')").run();
      db.aposCommit(() => { disparou += 10; });
      throw new Error('interna');
    });
    await interna().catch(() => {});
    db.aposCommit(() => { disparou++; });
  });
  await parcial();
  assert.equal(disparou, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM clientes WHERE nome IN ('Fica', 'Sai')").get()).n, 1);
});

test('painel de relatórios funciona com dados', async () => {
  const { status, dados } = await chamar('GET', '/relatorios/painel?meses=3');
  assert.equal(status, 200);
  assert.equal(dados.serie.length, 3);
  assert.match(dados.serie[0].mes, /^\d{4}-\d{2}$/);
  assert.equal(typeof dados.serie[0].abertas, 'number');
  assert.equal(typeof dados.kpis.faturamento_mes, 'number');
});
