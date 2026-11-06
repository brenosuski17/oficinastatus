// Conexão com o PostgreSQL (DATABASE_URL). O esquema fica nas migrations de server/migrations.
// Interface usada pelo sistema: await db.prepare(sql).get/all/run(...valores), com "?" nos parâmetros.
const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool, types } = require('pg');

// A API continua entregando os mesmos formatos ao front-end:
// COUNT e NUMERIC como número, DATE como "2026-11-06" e TIMESTAMPTZ como "2026-11-06 04:13:51" em UTC.
const lerTimestamp = types.getTypeParser(1184);
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number.parseFloat);
types.setTypeParser(1082, (s) => s);
types.setTypeParser(1184, (s) => lerTimestamp(s).toISOString().slice(0, 19).replace('T', ' '));

// Trava única das transações: elas rodam uma de cada vez, para duas pessoas não avançarem a mesma OS ao mesmo tempo.
const TRAVA_TRANSACOES = 7423002;

const contexto = new AsyncLocalStorage();
let pool = null;

function obterPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL no server/.env (veja o .env.example).');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (e) => console.error('[banco] conexão perdida:', e.message));
  }
  return pool;
}

const alvo = () => contexto.getStore()?.cliente ?? obterPool();
const paraPg = (sql) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
const valor = (v) => (v === undefined || Number.isNaN(v) ? null : typeof v === 'boolean' ? Number(v) : v);
const consultar = (sql, valores) => alvo().query(paraPg(sql), valores.map(valor));

class Comando {
  constructor(sql) { this.sql = sql; }

  async get(...valores) { return (await consultar(this.sql, valores)).rows[0]; }

  async all(...valores) { return (await consultar(this.sql, valores)).rows; }

  /** Em INSERT, devolve o id criado em lastInsertRowid. */
  async run(...valores) {
    const inserir = /^\s*INSERT\b/i.test(this.sql) && !/\bRETURNING\b/i.test(this.sql);
    const r = await consultar(inserir ? `${this.sql} RETURNING id` : this.sql, valores);
    return { changes: r.rowCount, lastInsertRowid: inserir ? r.rows[0]?.id : undefined };
  }
}

const prepare = (sql) => new Comando(sql);
const exec = (sql) => alvo().query(sql);

/** Devolve uma função que roda `fn` numa transação. Dentro dela, todas as consultas usam a mesma conexão. */
function transaction(fn) {
  return async function (...args) {
    const atual = contexto.getStore();
    if (atual) {
      const ponto = `sp${++atual.nivel}`;
      const pendentes = atual.aposCommit.length;
      await atual.cliente.query(`SAVEPOINT ${ponto}`);
      try {
        const r = await fn(...args);
        await atual.cliente.query(`RELEASE ${ponto}`);
        return r;
      } catch (e) {
        await atual.cliente.query(`ROLLBACK TO ${ponto}; RELEASE ${ponto}`);
        atual.aposCommit.length = pendentes;
        throw e;
      }
    }

    const cliente = await obterPool().connect();
    const loja = { cliente, nivel: 0, aposCommit: [] };
    let falhaNaConexao;
    let r;
    try {
      r = await contexto.run(loja, async () => {
        await cliente.query('BEGIN');
        await cliente.query('SELECT pg_advisory_xact_lock($1)', [TRAVA_TRANSACOES]);
        const resultado = await fn(...args);
        await cliente.query('COMMIT');
        return resultado;
      });
    } catch (e) {
      await cliente.query('ROLLBACK').catch((erro) => { falhaNaConexao = erro; });
      throw e;
    } finally {
      cliente.release(falhaNaConexao);
    }
    for (const acao of loja.aposCommit) acao();
    return r;
  };
}

/** Roda `acao` depois do commit da transação atual (ou agora, fora de transação). Se houver rollback, ela não roda. */
function aposCommit(acao) {
  const loja = contexto.getStore();
  if (loja) loja.aposCommit.push(acao);
  else acao();
}

async function fechar() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { prepare, exec, transaction, aposCommit, conectar: () => obterPool().connect(), fechar };
