// Aplica as migrations de server/migrations em ordem: `npm run migrate`
// Cada arquivo roda uma vez. A tabela schema_migrations guarda o que já foi aplicado.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PASTA = path.join(__dirname, '..', 'migrations');
const TRAVA_MIGRATIONS = 7423001;

// Windows e Linux podem gravar o mesmo arquivo com finais de linha diferentes
const lerArquivos = (pasta) => fs.readdirSync(pasta)
  .filter((nome) => /^\d{3}_.+\.sql$/.test(nome))
  .sort()
  .map((nome) => {
    const sql = fs.readFileSync(path.join(pasta, nome), 'utf8').replace(/\r\n/g, '\n');
    return { versao: nome, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });

async function lerAplicadas(cliente) {
  const existe = (await cliente.query("SELECT to_regclass('schema_migrations') AS t")).rows[0].t;
  if (!existe) return new Map();
  const { rows } = await cliente.query('SELECT versao, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.versao, r.checksum]));
}

function exigirSemAlteracao(arquivos, aplicadas) {
  for (const a of arquivos) {
    if (aplicadas.has(a.versao) && aplicadas.get(a.versao) !== a.checksum)
      throw new Error(`A migration ${a.versao} foi alterada depois de aplicada. Crie uma nova migration em vez de editá-la.`);
  }
}

/** Aplica o que falta, tudo ou nada. Devolve os nomes aplicados agora. */
async function migrar(pasta = PASTA) {
  const arquivos = lerArquivos(pasta);
  const cliente = await db.conectar();
  let falhaNaConexao;
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock($1)', [TRAVA_MIGRATIONS]);
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      versao      TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const aplicadas = await lerAplicadas(cliente);
    exigirSemAlteracao(arquivos, aplicadas);
    const novas = arquivos.filter((a) => !aplicadas.has(a.versao));
    for (const a of novas) {
      await cliente.query(a.sql);
      await cliente.query('INSERT INTO schema_migrations (versao, checksum) VALUES ($1, $2)', [a.versao, a.checksum]);
    }
    await cliente.query('COMMIT');
    return novas.map((a) => a.versao);
  } catch (e) {
    await cliente.query('ROLLBACK').catch((erro) => { falhaNaConexao = erro; });
    throw e;
  } finally {
    cliente.release(falhaNaConexao);
  }
}

/** Migrations ainda não aplicadas (o servidor não sobe sem elas). */
async function pendentes(pasta = PASTA) {
  const arquivos = lerArquivos(pasta);
  const cliente = await db.conectar();
  try {
    const aplicadas = await lerAplicadas(cliente);
    exigirSemAlteracao(arquivos, aplicadas);
    return arquivos.filter((a) => !aplicadas.has(a.versao)).map((a) => a.versao);
  } finally {
    cliente.release();
  }
}

module.exports = { migrar, pendentes };

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  migrar()
    .then((novas) => console.log(novas.length ? `Migrations aplicadas: ${novas.join(', ')}` : 'O banco já está atualizado.'))
    .catch((e) => { console.error(`Erro nas migrations: ${e.message || e.code}`); process.exitCode = 1; })
    .finally(() => db.fechar());
}
