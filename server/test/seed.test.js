// Demonstração: o seed deixa OS na aprovação, e o Aprovar ao vivo funciona pelo portal, pelo link e pelo Telegram.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarBancoDeTeste, servidorTelegram, TOKEN } = require('./apoio');

const SEGREDO = 'segredo_do_webhook';
let falso, apagarBanco, api, raiz, db, bot, envio, seed, admin;

before(async () => {
  falso = await servidorTelegram();
  Object.assign(process.env, {
    JWT_SECRET: 'teste', APP_URL: 'http://oficina.test', SMTP_HOST: '',
    TELEGRAM_API_URL: falso.url, TELEGRAM_TOKEN: '', TELEGRAM_BOT_USERNAME: 'oficina_teste_bot', TELEGRAM_WEBHOOK_SECRET: SEGREDO,
  });
  apagarBanco = await criarBancoDeTeste();
  db = require('../src/db');
  bot = require('../src/services/botTelegram');
  envio = require('../src/services/envio');
  seed = require('../src/seed');
  await seed.popular(); // como no npm run seed: sem token, nada sai
  await envio.ocioso(); // a fila roda depois do commit: o token só pode voltar quando ela terminar
  process.env.TELEGRAM_TOKEN = TOKEN; // a apresentação, com o bot configurado
  api = require('../src/app').listen(0);
  raiz = `http://127.0.0.1:${api.address().port}`;
  admin = await entrar('admin@oficina.com');
});

after(async () => { await envio.ocioso(); api?.close(); falso?.fechar(); await apagarBanco?.(); });

async function chamar(metodo, rota, corpo, token) {
  const r = await fetch(`${raiz}/api${rota}`, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
}
async function entrar(email) {
  const r = await chamar('POST', '/auth/login', { email, senha: seed.SENHA });
  assert.equal(r.status, 200, `login de ${email}`);
  return r.dados.token;
}
const etapa = async (ordemId, tipo) => (await db.prepare('SELECT status FROM etapas WHERE ordem_id = ? AND tipo = ?').get(ordemId, tipo)).status;
const todosOsItens = async (ordemId) => Object.fromEntries(
  (await db.prepare('SELECT id FROM itens_orcamento WHERE ordem_id = ?').all(ordemId)).map((i) => [i.id, true]));
const daCliente = async (email) => (await seed.aguardandoAprovacao()).find((o) => o.email === email);

let proximoUpdate = 9000;
async function enviarUpdate(update) {
  const r = await fetch(`${raiz}/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SEGREDO },
    body: JSON.stringify({ update_id: proximoUpdate++, ...update }),
  });
  assert.equal(r.status, 200);
  await bot.ocioso();
  await envio.ocioso();
}

test('o seed deixa OS aguardando aprovação, com orçamento e link público', async () => {
  const lista = await seed.aguardandoAprovacao();
  assert.deepEqual(lista.map((o) => o.email).sort(), ['fernanda@cliente.com', 'joao@cliente.com']);
  for (const o of lista) {
    assert.equal(await etapa(o.id, 'aprovacao'), 'em_andamento');
    assert.ok(Object.keys(await todosOsItens(o.id)).length > 0, `OS ${o.id} sem itens`);
    const publico = await chamar('GET', `/publico/ordens/${o.codigo_publico}`);
    assert.equal(publico.status, 200);
  }
  const fernanda = await daCliente('fernanda@cliente.com');
  assert.equal(fernanda.id, 16, 'o README e a apresentação citam a OS 16');
  assert.ok((await db.prepare('SELECT COUNT(*) n FROM avarias WHERE ordem_id = ?').get(fernanda.id)).n > 0);
});

test('Aprovar ao vivo pelo portal do cliente (OS 16, Fernanda)', async () => {
  const o = await daCliente('fernanda@cliente.com');
  const token = await entrar('fernanda@cliente.com');
  assert.equal((await chamar('GET', `/portal/ordens/${o.id}`, null, token)).status, 200);
  const r = await chamar('POST', `/portal/ordens/${o.id}/resposta`, { itens: await todosOsItens(o.id) }, token);
  assert.equal(r.status, 200);
  assert.equal(await etapa(o.id, 'aprovacao'), 'concluida');
  assert.equal(await etapa(o.id, 'execucao'), 'pendente'); // o mecânico é quem inicia
});

test('Aprovar ao vivo pelo Telegram: vincular o João, reenviar o orçamento e tocar em Aprovar', async () => {
  const o = await daCliente('joao@cliente.com');

  // Ao subir o servidor com o bot real, a fila vai para os chats fictícios do seed, e o Telegram recusa
  const naFila = (await db.prepare("SELECT COUNT(*) n FROM mensagens WHERE direcao = 'saida' AND status = 'enfileirada'").get()).n;
  assert.ok(naFila > 0);
  falso.errosPorMetodo.sendMessage = Array.from({ length: naFila }, () => ({ error_code: 400, description: 'Bad Request: chat not found' }));
  await envio.retomarFila();
  await envio.ocioso();
  falso.errosPorMetodo.sendMessage = [];
  const orcamento = await db.prepare(
    "SELECT id, status FROM mensagens WHERE ordem_id = ? AND reply_markup IS NOT NULL ORDER BY id DESC LIMIT 1").get(o.id);
  assert.equal(orcamento.status, 'falha');

  // Quem apresenta entra como João no portal e vincula o próprio Telegram
  const chat = 555000111;
  const { dados } = await chamar('POST', '/portal/telegram', null, await entrar('joao@cliente.com'));
  await enviarUpdate({ message: { message_id: 1, from: { id: chat }, chat: { id: chat, type: 'private' }, date: 1786622400, text: `/start ${new URL(dados.link).searchParams.get('start')}` } });

  // Na tela Mensagens, "Tentar de novo" manda o orçamento com os botões para o chat novo
  const r = await chamar('POST', `/mensagens/telegram/${orcamento.id}/reenviar`, null, admin);
  assert.equal(r.status, 200);
  await envio.ocioso();
  const enviada = falso.enviadas().at(-1).corpo;
  assert.equal(enviada.chat_id, String(chat));
  const aprovar = enviada.reply_markup.inline_keyboard.flat().find((b) => b.callback_data === `orc:${o.id}:aprovar`);
  assert.ok(aprovar, 'mensagem sem o botão Aprovar');

  const { id_externo } = await db.prepare('SELECT id_externo FROM mensagens WHERE id = ?').get(orcamento.id);
  await enviarUpdate({ callback_query: { id: 'cq-ao-vivo', from: { id: chat }, message: { message_id: Number(id_externo), chat: { id: chat } }, data: aprovar.callback_data } });
  assert.equal(await etapa(o.id, 'aprovacao'), 'concluida');
  const resposta = falso.chamadas.findLast((c) => c.metodo === 'answerCallbackQuery');
  assert.equal(resposta.corpo.text, 'Orçamento aprovado. Obrigado!');
  assert.match(falso.enviadas().at(-1).corpo.text, /Recebemos a aprovação do orçamento/);
});
