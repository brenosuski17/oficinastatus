// Bot do Telegram contra um servidor falso da Bot API: vínculo, envio, botões, webhook e erros.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarBancoDeTeste, servidorTelegram, TOKEN } = require('./apoio');

const SEGREDO = 'segredo_do_webhook';
let falso, apagarBanco, api, raiz, base, T, db, bot, envio;
let proximoUpdate = 5000;

before(async () => {
  falso = await servidorTelegram();
  Object.assign(process.env, {
    JWT_SECRET: 'teste', APP_URL: 'http://oficina.test', SMTP_HOST: '',
    TELEGRAM_API_URL: falso.url, TELEGRAM_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: 'oficina_teste_bot', TELEGRAM_WEBHOOK_SECRET: SEGREDO,
  });
  apagarBanco = await criarBancoDeTeste();
  db = require('../src/db');
  bot = require('../src/services/botTelegram');
  envio = require('../src/services/envio');
  api = require('../src/app').listen(0);
  raiz = `http://127.0.0.1:${api.address().port}`;
  base = `${raiz}/api`;
  T = (await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'admin@teste.com', senha: 'senhaforte1' })).dados.token;
});

after(async () => { await envio.ocioso(); api?.close(); falso?.fechar(); await apagarBanco?.(); });

async function chamar(metodo, rota, corpo, token = T) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
}

const postarUpdate = (update, segredo = SEGREDO) => fetch(`${raiz}/webhook/telegram`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(segredo ? { 'X-Telegram-Bot-Api-Secret-Token': segredo } : {}) },
  body: JSON.stringify(update),
});

async function enviarUpdate(update) {
  const r = await postarUpdate({ update_id: proximoUpdate++, ...update });
  assert.equal(r.status, 200);
  await bot.ocioso();
  await envio.ocioso();
}

const textoDoChat = (chatId, texto, extra = {}) => ({
  message: { message_id: proximoUpdate, from: { id: chatId, first_name: 'Ana' }, chat: { id: chatId, type: 'private' }, date: 1786622400, text: texto, ...extra },
});
const clique = (chatId, messageId, data, id = `cq${proximoUpdate}`) => ({
  callback_query: { id, from: { id: chatId, first_name: 'Ana' }, message: { message_id: messageId, chat: { id: chatId } }, data },
});

let contador = 0;
/** Cliente, veículo e vínculo pelo deep link. */
async function clienteVinculado(chatId, comEmail = false) {
  contador++;
  const { dados: c } = await chamar('POST', '/clientes', { nome: `Cliente ${contador}`, telefone: `4298888${String(contador).padStart(4, '0')}`, ...(comEmail ? { email: `c${contador}@teste.com` } : {}) });
  const { dados: v } = await chamar('POST', '/veiculos', { cliente_id: c.id, placa: `TLG${contador % 10}${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[contador % 26]}${String(contador).padStart(2, '0')}`, marca: 'VW', modelo: 'Golf' });
  const { dados: vinc } = await chamar('POST', `/clientes/${c.id}/telegram`);
  const codigo = new URL(vinc.link).searchParams.get('start');
  await enviarUpdate(textoDoChat(chatId, `/start ${codigo}`));
  return { c, v, codigo };
}

/** OS na etapa de aprovação, com o orçamento enviado. Devolve a mensagem com os botões. */
async function osEmAprovacao(v) {
  const { dados: os } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Barulho' });
  await chamar('POST', `/ordens/${os.id}/diagnostico`, { diagnostico: 'Velas' });
  await chamar('POST', `/ordens/${os.id}/itens`, { tipo: 'peca', descricao: 'Velas', quantidade: 1, valor_unitario: 120 });
  await chamar('POST', `/ordens/${os.id}/itens`, { tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, valor_unitario: 80 });
  await chamar('POST', `/ordens/${os.id}/orcamento/enviar`, {});
  await envio.ocioso();
  const envio_ = falso.enviadas().at(-1);
  return { os, messageId: await idDaUltima(os.id), botoes: envio_.corpo.reply_markup };
}
const idDaUltima = async (ordemId) => (await db.prepare("SELECT id_externo FROM mensagens WHERE ordem_id = ? AND reply_markup IS NOT NULL ORDER BY id DESC LIMIT 1").get(ordemId)).id_externo;
const os = (id) => chamar('GET', `/ordens/${id}`);

test('webhook recusa quem não traz o segredo certo', async () => {
  const antes = (await db.prepare('SELECT COUNT(*) n FROM updates_telegram').get()).n;
  assert.equal((await postarUpdate({ update_id: 1, ...textoDoChat(1, 'oi') }, null)).status, 401);
  assert.equal((await postarUpdate({ update_id: 1, ...textoDoChat(1, 'oi') }, 'segredo_errado')).status, 401);
  await bot.ocioso();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM updates_telegram').get()).n, antes);
});

test('o deep link vincula o chat e funciona para cliente sem e-mail', async () => {
  const { c, codigo } = await clienteVinculado(111);
  const canal = await db.prepare("SELECT cu.* FROM canais_usuario cu JOIN usuarios u ON u.id = cu.usuario_id WHERE u.cliente_id = ?").get(c.id);
  assert.equal(canal.chat_id, '111');
  assert.equal(canal.plataforma, 'telegram');
  assert.equal(canal.ativo, true);
  assert.equal(canal.codigo_convite, codigo);
  assert.equal(falso.enviadas().at(-1).corpo.chat_id, '111');
  assert.match(falso.enviadas().at(-1).corpo.text, /Tudo certo/);
  assert.equal((await chamar('GET', `/clientes/${c.id}`)).dados.telegram_ativo, 1);

  // O /start fica registrado com o payload bruto
  const m = await db.prepare("SELECT * FROM mensagens WHERE direcao = 'entrada' AND canal_usuario_id = ? ORDER BY id LIMIT 1").get(canal.id);
  assert.equal(m.conteudo, `/start ${codigo}`);
  assert.equal(m.payload_bruto.message.chat.id, 111);

  // O código só vale uma vez; quem usa de novo não toma o vínculo
  await enviarUpdate(textoDoChat(222, `/start ${codigo}`));
  assert.match(falso.enviadas().at(-1).corpo.text, /inválido ou expirou/);
  assert.equal(await db.prepare("SELECT 1 FROM canais_usuario WHERE chat_id = '222'").get(), undefined);
});

test('o cliente do portal gera o próprio link de vínculo', async () => {
  const { dados: c } = await chamar('POST', '/clientes', { nome: 'Portal', telefone: '42977770001', email: 'portal@teste.com' });
  const { dados: conv } = await chamar('POST', `/clientes/${c.id}/convite`);
  const tokenConvite = conv.link_convite.split('/').pop();
  const TC = (await chamar('POST', `/auth/convite/${tokenConvite}`, { senha: 'senhaforte1' })).dados.token;
  assert.deepEqual((await chamar('GET', '/portal/resumo', null, TC)).dados.telegram, { disponivel: true, vinculado: false });
  const { dados } = await chamar('POST', '/portal/telegram', {}, TC);
  await enviarUpdate(textoDoChat(333, `/start ${new URL(dados.link).searchParams.get('start')}`));
  assert.equal((await chamar('GET', '/portal/resumo', null, TC)).dados.telegram.vinculado, true);
});

test('envio grava o message_id, e cliente sem vínculo fica com o motivo', async () => {
  const { v } = await clienteVinculado(444);
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  const m = await db.prepare('SELECT * FROM mensagens WHERE ordem_id = ?').get(o.id);
  assert.equal(m.status, 'enviada');
  assert.equal(m.plataforma, 'telegram');
  assert.equal(m.direcao, 'saida');
  assert.equal(m.id_externo, String(falso.proximoId - 1));
  assert.ok(m.enviada_em);

  const { dados: c2 } = await chamar('POST', '/clientes', { nome: 'Sem Vínculo', telefone: '42977770002' });
  const { dados: v2 } = await chamar('POST', '/veiculos', { cliente_id: c2.id, placa: 'SVN1A23', marca: 'VW', modelo: 'Gol' });
  const { dados: o2 } = await chamar('POST', '/ordens', { veiculo_id: v2.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  const m2 = await db.prepare('SELECT * FROM mensagens WHERE ordem_id = ?').get(o2.id);
  assert.equal(m2.status, 'falha');
  assert.equal(m2.erro_codigo, 'sem_vinculo');

  // Depois do vínculo, "Tentar de novo" envia pelo canal novo
  const { dados: vinc } = await chamar('POST', `/clientes/${c2.id}/telegram`);
  await enviarUpdate(textoDoChat(445, `/start ${new URL(vinc.link).searchParams.get('start')}`));
  const { dados: r } = await chamar('POST', `/mensagens/telegram/${m2.id}/reenviar`, {});
  assert.equal(r.status, 'enfileirada');
  await envio.ocioso();
  const m3 = await db.prepare('SELECT * FROM mensagens WHERE id = ?').get(m2.id);
  assert.equal(m3.status, 'enviada');
  assert.equal(m3.erro_codigo, null);
  assert.equal(falso.enviadas().at(-1).corpo.chat_id, '445');
});

test('Aprovar pelo botão aprova a OS de verdade e marca a mensagem como respondida', async () => {
  const { v } = await clienteVinculado(555);
  const { os: o, messageId, botoes } = await osEmAprovacao(v);
  assert.deepEqual(botoes.inline_keyboard[0].map((b) => b.text), ['Aprovar', 'Recusar']);
  assert.equal((await os(o.id)).dados.etapa_atual, 'aprovacao');

  await enviarUpdate(clique(555, Number(messageId), `orc:${o.id}:aprovar`, 'cq-aprovar'));

  const { dados: depois } = await os(o.id);
  assert.equal(depois.etapa_atual, 'aprovado');
  assert.equal(depois.total_aprovado, 200);
  const m = await db.prepare('SELECT * FROM mensagens WHERE ordem_id = ? AND id_externo = ? AND direcao = ?').get(o.id, messageId, 'saida');
  assert.equal(m.status, 'respondida');
  assert.ok(m.respondida_em);
  assert.deepEqual(falso.chamadas.filter((c) => c.metodo === 'answerCallbackQuery').at(-1).corpo, { callback_query_id: 'cq-aprovar', text: 'Orçamento aprovado. Obrigado!' });

  // O clique fica registrado com o payload bruto, e o cliente recebe o aviso de aprovação
  const cliqueSalvo = await db.prepare("SELECT * FROM mensagens WHERE direcao = 'entrada' AND ordem_id = ? ORDER BY id DESC LIMIT 1").get(o.id);
  assert.equal(cliqueSalvo.conteudo, 'Botão: Aprovar');
  assert.equal(cliqueSalvo.payload_bruto.callback_query.id, 'cq-aprovar');
  assert.match(falso.enviadas().at(-1).corpo.text, /Recebemos a aprovação/);

  // Clicar de novo não muda nada, mas ainda responde ao Telegram
  await enviarUpdate(clique(555, Number(messageId), `orc:${o.id}:recusar`, 'cq-repetido'));
  assert.equal((await os(o.id)).dados.etapa_atual, 'aprovado');
  assert.equal(falso.chamadas.filter((c) => c.metodo === 'answerCallbackQuery').at(-1).corpo.text, 'Este orçamento já foi respondido.');
});

test('Recusar pelo botão recusa a OS', async () => {
  const { v } = await clienteVinculado(666);
  const { os: o, messageId } = await osEmAprovacao(v);
  await enviarUpdate(clique(666, Number(messageId), `orc:${o.id}:recusar`));
  const { dados: depois } = await os(o.id);
  assert.equal(depois.situacao, 'recusada');
  assert.equal(depois.total_aprovado, 0);
  assert.equal((await db.prepare('SELECT status FROM mensagens WHERE id_externo = ? AND ordem_id = ?').get(messageId, o.id)).status, 'respondida');
});

test('botão de outro chat ou de orçamento antigo não vale', async () => {
  const { v } = await clienteVinculado(777);
  await clienteVinculado(778);
  const { os: o, messageId } = await osEmAprovacao(v);

  await enviarUpdate(clique(778, Number(messageId), `orc:${o.id}:aprovar`));
  assert.equal((await os(o.id)).dados.etapa_atual, 'aprovacao');
  await enviarUpdate(clique(999999, Number(messageId), `orc:${o.id}:aprovar`));
  assert.equal((await os(o.id)).dados.etapa_atual, 'aprovacao');

  // A oficina muda o orçamento e reenvia: o botão antigo não aprova o valor novo
  await chamar('POST', `/ordens/${o.id}/itens`, { tipo: 'peca', descricao: 'Peça cara', quantidade: 1, valor_unitario: 5000 });
  await chamar('POST', `/ordens/${o.id}/orcamento/enviar`, {});
  await envio.ocioso();
  await enviarUpdate(clique(777, Number(messageId), `orc:${o.id}:aprovar`));
  assert.equal((await os(o.id)).dados.etapa_atual, 'aprovacao');
  assert.match(falso.chamadas.filter((c) => c.metodo === 'answerCallbackQuery').at(-1).corpo.text, /mais recente/);

  await enviarUpdate(clique(777, Number(await idDaUltima(o.id)), `orc:${o.id}:aprovar`));
  assert.equal((await os(o.id)).dados.total_aprovado, 5200);
});

test('webhook responde 200 antes de processar', async () => {
  const { v } = await clienteVinculado(888);
  const { os: o, messageId } = await osEmAprovacao(v);
  falso.atrasoMs = 400;
  const antes = falso.chamadas.length;
  const r = await postarUpdate({ update_id: proximoUpdate++, ...clique(888, Number(messageId), `orc:${o.id}:aprovar`, 'cq-lento') });
  assert.equal(r.status, 200);
  assert.equal(falso.chamadas.slice(antes).some((c) => c.corpo.callback_query_id === 'cq-lento'), false);
  await bot.ocioso();
  falso.atrasoMs = 0;
  assert.equal(falso.chamadas.slice(antes).some((c) => c.corpo.callback_query_id === 'cq-lento'), true);
  await envio.ocioso();
});

test('update repetido é processado uma vez e toda mensagem guarda o payload bruto', async () => {
  const update = { update_id: 777000, ...textoDoChat(1234, 'Oi, meu carro está pronto?') };
  await postarUpdate(update);
  await postarUpdate(update);
  await bot.ocioso();
  const linhas = await db.prepare("SELECT * FROM mensagens WHERE direcao = 'entrada' AND conteudo = ?").all('Oi, meu carro está pronto?');
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].status, 'respondida');
  assert.equal(linhas[0].payload_bruto.update_id, 777000);

  await enviarUpdate(textoDoChat(1234, undefined, { text: undefined, photo: [{ file_id: 'x' }] }));
  const foto = await db.prepare("SELECT * FROM mensagens WHERE conteudo = '[mensagem sem texto]' ORDER BY id DESC LIMIT 1").get();
  assert.equal(foto.payload_bruto.message.photo[0].file_id, 'x');
});

test('responder a uma mensagem do bot marca como respondida', async () => {
  const { v } = await clienteVinculado(1001);
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  const m = await db.prepare("SELECT * FROM mensagens WHERE ordem_id = ? AND direcao = 'saida'").get(o.id);
  await enviarUpdate(textoDoChat(1001, 'Obrigado!', { reply_to_message: { message_id: Number(m.id_externo) } }));
  assert.equal((await db.prepare('SELECT status FROM mensagens WHERE id = ?').get(m.id)).status, 'respondida');
});

test('429 espera o retry_after e tenta de novo', async () => {
  const { v } = await clienteVinculado(1101);
  falso.respostas.push({ error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 1 } });
  const antes = falso.enviadas().length;
  const inicio = Date.now();
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  assert.ok(Date.now() - inicio >= 1000);
  assert.equal(falso.enviadas().length - antes, 2);
  assert.equal((await db.prepare('SELECT status FROM mensagens WHERE ordem_id = ?').get(o.id)).status, 'enviada');
});

test('erro temporário usa backoff, e erro definitivo vira falha com código e descrição', async () => {
  const { v } = await clienteVinculado(1201);
  falso.respostas.push({ error_code: 500, description: 'Internal Server Error' });
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  assert.equal((await db.prepare('SELECT status FROM mensagens WHERE ordem_id = ?').get(o.id)).status, 'enviada');

  falso.respostas.push({ error_code: 400, description: 'Bad Request: chat not found' });
  await chamar('POST', `/ordens/${o.id}/diagnostico`, { diagnostico: 'ok' });
  await envio.ocioso();
  const m = await db.prepare("SELECT * FROM mensagens WHERE ordem_id = ? ORDER BY id DESC LIMIT 1").get(o.id);
  assert.equal(m.status, 'falha');
  assert.equal(m.erro_codigo, '400');
  assert.equal(m.erro_descricao, 'Bad Request: chat not found');
});

test('403 desativa o vínculo e o próximo aviso não tenta enviar', async () => {
  const { c, v } = await clienteVinculado(1301);
  falso.respostas.push({ error_code: 403, description: 'Forbidden: bot was blocked by the user' });
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' });
  await envio.ocioso();
  const m = await db.prepare('SELECT * FROM mensagens WHERE ordem_id = ?').get(o.id);
  assert.equal(m.status, 'falha');
  assert.equal(m.erro_codigo, '403');
  assert.equal(m.erro_descricao, 'Forbidden: bot was blocked by the user');
  assert.equal((await chamar('GET', `/clientes/${c.id}`)).dados.telegram_ativo, 0);

  const antes = falso.enviadas().length;
  await chamar('POST', `/ordens/${o.id}/diagnostico`, { diagnostico: 'ok' });
  await envio.ocioso();
  assert.equal(falso.enviadas().length, antes);
  assert.equal((await db.prepare('SELECT erro_codigo FROM mensagens WHERE ordem_id = ? ORDER BY id DESC LIMIT 1').get(o.id)).erro_codigo, 'sem_vinculo');

  // Um novo vínculo volta a funcionar
  const { dados: vinc } = await chamar('POST', `/clientes/${c.id}/telegram`);
  await enviarUpdate(textoDoChat(1301, `/start ${new URL(vinc.link).searchParams.get('start')}`));
  assert.equal((await chamar('GET', `/clientes/${c.id}`)).dados.telegram_ativo, 1);
});

test('teste de Integrações usa o vínculo do admin e aparece em Mensagens', async () => {
  assert.equal((await chamar('POST', '/integracoes/teste-telegram', {})).status, 400);
  const { dados: vinc } = await chamar('POST', '/integracoes/telegram/vinculo', {});
  await enviarUpdate(textoDoChat(1401, `/start ${new URL(vinc.link).searchParams.get('start')}`));
  assert.equal((await chamar('GET', '/integracoes')).dados.meu_telegram, true);

  const r = await chamar('POST', '/integracoes/teste-telegram', {});
  assert.equal(r.status, 200);
  assert.equal(falso.enviadas().at(-1).corpo.chat_id, '1401');
  const { dados: testes } = await chamar('GET', '/mensagens?origem=teste');
  assert.equal(testes[0].id, r.dados.mensagem_id);
  assert.equal(testes[0].status, 'enviada');
  assert.equal(testes[0].canal, 'telegram');

  falso.respostas.push({ error_code: 403, description: 'Forbidden: bot was blocked by the user' });
  const falhou = await chamar('POST', '/integracoes/teste-telegram', {});
  assert.equal(falhou.status, 502);
  assert.match(falhou.dados.erro, /blocked/);
});

test('mecânico não vê testes nem mensagens sem OS, e os filtros funcionam', async () => {
  const { dados: { usuario: mec, link_convite } } = await chamar('POST', '/equipe', { nome: 'Mecânico', email: 'mec@teste.com', papel: 'mecanico' });
  assert.ok(mec.id);
  const TM = (await chamar('POST', `/auth/convite/${link_convite.split('/').pop()}`, { senha: 'senhaforte1' })).dados.token;
  const { dados: lista } = await chamar('GET', '/mensagens', null, TM);
  assert.ok(lista.length > 0);
  assert.ok(lista.every((m) => m.ordem_id != null));
  const { dados: falhas } = await chamar('GET', '/mensagens?status=falha');
  assert.ok(falhas.length > 0 && falhas.every((m) => m.status === 'falha'));
  assert.equal((await chamar('GET', '/mensagens', null, null)).status, 401);
});

test('excluir o cliente apaga vínculo e mensagens', async () => {
  const { c } = await clienteVinculado(1501);
  const canal = await db.prepare("SELECT cu.id FROM canais_usuario cu JOIN usuarios u ON u.id = cu.usuario_id WHERE u.cliente_id = ?").get(c.id);
  assert.equal((await chamar('DELETE', `/clientes/${c.id}`)).status, 204);
  assert.equal(await db.prepare('SELECT 1 FROM canais_usuario WHERE id = ?').get(canal.id), undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM mensagens WHERE canal_usuario_id = ?').get(canal.id)).n, 0);
});

test('npm run webhook registra a URL com o segredo e só os updates necessários', async () => {
  const { extrairUrl, registrar } = require('../scripts/webhook');
  assert.equal(extrairUrl('INF |  https://abc-def-123.trycloudflare.com  |'), 'https://abc-def-123.trycloudflare.com');
  assert.equal(extrairUrl('INF sem url https://api.trycloudflare.com.exemplo.com'), 'https://api.trycloudflare.com');

  const url = await registrar('https://abc-def-123.trycloudflare.com/');
  assert.equal(url, 'https://abc-def-123.trycloudflare.com/webhook/telegram');
  assert.deepEqual(falso.chamadas.filter((c) => c.metodo === 'setWebhook').at(-1).corpo, {
    url, secret_token: SEGREDO, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  });
});
