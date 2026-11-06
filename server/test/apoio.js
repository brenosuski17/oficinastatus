// Cada arquivo de teste roda num schema próprio e descartável do PostgreSQL, sem tocar nos dados do banco.
// Antes dos testes: docker compose up -d postgres
const crypto = require('node:crypto');
const { Client } = require('pg');

const BASE = process.env.TEST_DATABASE_URL || 'postgresql://oficina:oficina@localhost:5433/oficina';

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

module.exports = { criarBancoDeTeste };
