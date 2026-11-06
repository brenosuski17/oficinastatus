// Teste de integração: percorre o fluxo inteiro de uma OS pela API HTTP.
// Os serviços externos (SMTP, Meta, PlacaFipe e FIPE) são substituídos por servidores locais
// que recebem as mesmas requisições que os reais — assim validamos o que o sistema realmente envia.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { SMTPServer } = require('smtp-server');
const { criarBancoDeTeste, servidorTelegram, TOKEN } = require('./apoio');

const emails = [];
let smtp, externo, api, base, apagarBanco, telegram;

function servidorExterno() {
  return http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      // PlacaFipe
      if (req.url === '/getplaca') {
        const { placa, token } = JSON.parse(corpo);
        assert.equal(token, 'token-placa');
        if (placa !== 'ABC1D23') return json(200, { codigo: 0, msg: 'Placa não encontrada' });
        return json(200, { codigo: 1, informacoes_veiculo: { marca: 'FIAT', modelo: 'ARGO DRIVE 1.0', ano: '2021', ano_modelo: '2022', cor: 'Branca', combustivel: 'Flex', segmento: 'Auto', municipio: 'União da Vitória', uf: 'PR' } });
      }
      // Parallelum FIPE
      if (req.url === '/fipe/cars/brands') return json(200, [{ code: '59', name: 'VW - VolksWagen' }, { code: '21', name: 'Fiat' }]);
      return json(404, { erro: 'não encontrado' });
    });
  });
}

const ouvir = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r((srv.server || srv).address().port)));

before(async () => {
  smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onData(stream, sess, cb) { let d = ''; stream.on('data', (c) => (d += c)); stream.on('end', () => { emails.push({ para: sess.envelope.rcptTo.map((r) => r.address), dados: d }); cb(); }); },
  });
  const portaSmtp = await ouvir(smtp);
  externo = servidorExterno();
  const portaExt = await ouvir(externo);
  telegram = await servidorTelegram();

  Object.assign(process.env, {
    JWT_SECRET: 'teste', APP_URL: 'http://oficina.test', NOME_OFICINA: 'Oficina Teste',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(portaSmtp), SMTP_FROM: 'oficina@teste.com', SMTP_IGNORAR_TLS: 'true',
    TELEGRAM_API_URL: telegram.url, TELEGRAM_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: 'oficina_teste_bot', TELEGRAM_WEBHOOK_SECRET: 'segredo',
    PLACA_API_URL: `http://127.0.0.1:${portaExt}`, PLACA_API_TOKEN: 'token-placa',
    FIPE_API_URL: `http://127.0.0.1:${portaExt}/fipe`,
  });
  apagarBanco = await criarBancoDeTeste();
  const app = require('../src/app');
  api = app.listen(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
});

after(async () => { api?.close(); smtp?.close(); externo?.close(); telegram?.fechar(); await apagarBanco?.(); });

async function chamar(metodo, rota, corpo, token) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
}
const esperarEnvios = () => require('../src/services/envio').ocioso();
const avisos = () => telegram.enviadas().filter((c) => c.corpo.chat_id === '42001');

test('fluxo completo de uma ordem de serviço', async () => {
  // Primeiro acesso cria o administrador
  assert.equal((await chamar('GET', '/auth/estado')).dados.precisa_configurar, true);
  const { dados: adm } = await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'admin@teste.com', senha: 'senhaforte1' });
  const T = adm.token;
  assert.equal((await chamar('POST', '/auth/configurar', { nome: 'X', email: 'x@x.com', senha: 'senhaforte1' })).status, 409);
  assert.equal((await chamar('GET', '/ordens')).status, 401);

  // Consulta por placa (PlacaFipe) + correspondência da marca na FIPE
  const placa = await chamar('GET', '/veiculos/placa/abc-1d23', null, T);
  assert.equal(placa.status, 200);
  assert.equal(placa.dados.consulta.veiculo.modelo, 'ARGO DRIVE 1.0');
  assert.equal(placa.dados.consulta.veiculo.ano_modelo, 2022);
  assert.equal(placa.dados.consulta.fipe_marca.code, '21');

  // Cadastro: cliente com e-mail ganha conta automaticamente
  const { dados: cli } = await chamar('POST', '/clientes', { nome: 'Maria Souza', telefone: '(42) 99999-1234', email: 'maria@cliente.com' }, T);
  const { dados: vei } = await chamar('POST', '/veiculos', { ...placa.dados.consulta.veiculo, cliente_id: cli.id, origem_dados: 'placa' }, T);
  assert.equal(vei.placa, 'ABC1D23');

  // O cliente vincula o Telegram pelo deep link
  const { dados: vinculo } = await chamar('POST', `/clientes/${cli.id}/telegram`, {}, T);
  assert.match(vinculo.link, /^https:\/\/t\.me\/oficina_teste_bot\?start=[0-9a-f]+$/);
  const inicio = await fetch(base.replace('/api', '/webhook/telegram'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'segredo' },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 42001 }, from: { id: 42001, first_name: 'Maria' }, text: `/start ${new URL(vinculo.link).searchParams.get('start')}` } }),
  });
  assert.equal(inicio.status, 200);
  await require('../src/services/botTelegram').ocioso();

  // Abertura → e-mail com link para criar senha + aviso pelo bot
  const { dados: os } = await chamar('POST', '/ordens', { veiculo_id: vei.id, problema_relatado: 'Falha na partida', km_entrada: 50000 }, T);
  assert.equal(os.etapa_atual, 'diagnostico');
  await esperarEnvios();
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].para, ['maria@cliente.com']);
  const convite = emails[0].dados.replace(/=\r?\n/g, '').match(/criar-senha\/([A-Za-z0-9_-]+)/)[1];
  assert.equal(avisos().length, 2); // boas-vindas do vínculo + abertura da OS
  assert.match(avisos()[1].corpo.text, /Olá, Maria!/);
  assert.match(avisos()[1].corpo.text, /acompanhar\//);

  // Regras: não dá para pular etapas
  assert.equal((await chamar('POST', `/ordens/${os.id}/execucao`, {}, T)).status, 409);
  assert.equal((await chamar('POST', `/ordens/${os.id}/orcamento/enviar`, {}, T)).status, 409);

  await chamar('POST', `/ordens/${os.id}/diagnostico`, { diagnostico: 'Velas gastas' }, T);
  assert.equal((await chamar('POST', `/ordens/${os.id}/orcamento/enviar`, {}, T)).status, 400); // sem itens
  await chamar('POST', `/ordens/${os.id}/itens`, { tipo: 'peca', descricao: 'Jogo de velas', quantidade: 1, valor_unitario: 120 }, T);
  const { dados: comItens } = await chamar('POST', `/ordens/${os.id}/itens`, { tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, valor_unitario: 80.5 }, T);
  assert.equal(comItens.total, 200.5);
  const { dados: enviada } = await chamar('POST', `/ordens/${os.id}/orcamento/enviar`, {}, T);
  assert.equal(enviada.etapa_atual, 'aprovacao');

  // Cliente cria a senha pelo link do e-mail e aprova só a peça pelo portal
  const { dados: sessao } = await chamar('POST', `/auth/convite/${convite}`, { senha: 'minhasenha' });
  assert.equal(sessao.usuario.papel, 'cliente');
  const TC = sessao.token;
  assert.equal((await chamar('GET', '/ordens', null, TC)).status, 403); // cliente não acessa a área da oficina
  const { dados: resumo } = await chamar('GET', '/portal/resumo', null, TC);
  assert.equal(resumo.ordens[0].etapa_atual, 'aprovacao');
  const { dados: visao } = await chamar('GET', `/portal/ordens/${os.id}`, null, TC);
  const peca = visao.itens.find((i) => i.tipo === 'peca');
  const { dados: aprovada } = await chamar('POST', `/portal/ordens/${os.id}/resposta`, { itens: { [peca.id]: true } }, TC);
  assert.equal(aprovada.etapa_atual, 'aprovado');
  assert.equal(aprovada.total_aprovado, 120);

  await chamar('POST', `/ordens/${os.id}/execucao`, { previsao_entrega: '2026-12-01' }, T);
  await chamar('POST', `/ordens/${os.id}/peca`, { aguardando: true }, T);
  await chamar('POST', `/ordens/${os.id}/peca`, { aguardando: false }, T);
  const { dados: pronta } = await chamar('POST', `/ordens/${os.id}/pronto`, {}, T);
  assert.equal(pronta.etapa_atual, 'pronto');
  const { dados: fim } = await chamar('POST', `/ordens/${os.id}/entrega`, {}, T);
  assert.equal(fim.situacao, 'finalizada');

  // 9 avisos (recebido, diagnóstico, orçamento, aprovado, execução, peça, retomado, pronto, entregue) em cada canal
  await esperarEnvios();
  assert.equal(emails.length, 9);
  assert.equal(avisos().length, 10); // boas-vindas + os 9 avisos
  const { dados: msgs } = await chamar('GET', '/mensagens', null, T);
  assert.ok(msgs.filter((m) => m.direcao === 'saida').every((m) => m.status === 'enviada'));
  assert.ok(msgs.some((m) => m.direcao === 'entrada' && /1 de 2 itens aprovados/.test(m.conteudo)));

  // Relatório reflete o serviço entregue
  const { dados: painel } = await chamar('GET', '/relatorios/painel', null, T);
  assert.equal(painel.kpis.faturamento_mes, 120);
  assert.equal(painel.kpis.entregues_mes, 1);
});

test('mecânico só vê as OS dele ou sem responsável', async () => {
  const T = (await chamar('POST', '/auth/login', { email: 'admin@teste.com', senha: 'senhaforte1' })).dados.token;
  const { dados: conv } = await chamar('POST', '/equipe', { nome: 'Zé Mecânico', email: 'ze@teste.com', papel: 'mecanico' }, T);
  const tok = conv.link_convite.split('/').pop();
  const TM = (await chamar('POST', `/auth/convite/${tok}`, { senha: 'senhadoze1' })).dados.token;
  const { dados: c } = await chamar('POST', '/clientes', { nome: 'Outro', telefone: '42988887777' }, T);
  const { dados: v } = await chamar('POST', '/veiculos', { cliente_id: c.id, placa: 'XYZ9876', marca: 'Fiat', modelo: 'Uno' }, T);
  const { dados: o } = await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' }, T);
  const { dados: adm } = await chamar('GET', '/equipe', null, T);
  const adminId = adm.find((u) => u.email === 'admin@teste.com').id;
  await chamar('POST', `/ordens/${o.id}/responsavel`, { mecanico_id: adminId }, T);
  assert.equal((await chamar('GET', `/ordens/${o.id}`, null, TM)).status, 403);
  assert.equal((await chamar('GET', '/relatorios/painel', null, TM)).status, 403);
  assert.equal((await chamar('POST', '/auth/login', { email: 'ze@teste.com', senha: 'errada' })).status, 401);
});
