// Cada arquivo de teste roda num schema próprio e descartável do PostgreSQL, sem tocar nos dados do banco.
// Antes dos testes: docker compose up -d postgres
const crypto = require('node:crypto');
const http = require('node:http');
const { Client } = require('pg');

const BASE = process.env.TEST_DATABASE_URL || 'postgresql://oficina:oficina@localhost:5433/oficina';
const TOKEN = '123456:token-de-teste';

/** Cria o schema, aplica as migrations e devolve a função que apaga tudo no final. */
async function criarBancoDeTeste() {
  const schema = `teste_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: BASE });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const url = new URL(BASE);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();

  const db = require('../src/db');
  await require('../src/migrar').migrar();
  await require('../src/services/catalogo').garantirCatalogo();

  return async function apagar() {
    await db.fechar();
    const fim = new Client({ connectionString: BASE });
    await fim.connect();
    await fim.query(`DROP SCHEMA ${schema} CASCADE`);
    await fim.end();
  };
}

/**
 * Servidor falso da Bot API: recebe as mesmas requisições que a real.
 * `respostas` guarda erros a devolver no próximo sendMessage; `atrasoMs` atrasa o answerCallbackQuery.
 */
async function servidorTelegram() {
  const falso = { chamadas: [], respostas: [], atrasoMs: 0, proximoId: 1000 };
  const enviadas = () => falso.chamadas.filter((c) => c.metodo === 'sendMessage');
  falso.enviadas = enviadas;
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', async () => {
      const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url);
      if (!m || m[1] !== TOKEN) return json(404, { ok: false, error_code: 404, description: 'Not Found' });
      const metodo = m[2];
      const dados = corpo ? JSON.parse(corpo) : {};
      if (metodo === 'answerCallbackQuery' && falso.atrasoMs) await new Promise((r) => setTimeout(r, falso.atrasoMs));
      falso.chamadas.push({ metodo, corpo: dados });
      if (metodo === 'sendMessage') {
        const erro = falso.respostas.shift();
        if (erro) return json(erro.error_code, { ok: false, ...erro });
        const message_id = falso.proximoId++;
        return json(200, { ok: true, result: { message_id, chat: { id: dados.chat_id }, text: dados.text } });
      }
      if (metodo === 'getWebhookInfo') return json(200, { ok: true, result: { url: '', pending_update_count: 0 } });
      return json(200, { ok: true, result: true });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  falso.url = `http://127.0.0.1:${srv.address().port}`;
  falso.fechar = () => srv.close();
  return falso;
}

module.exports = { criarBancoDeTeste, servidorTelegram, TOKEN };
