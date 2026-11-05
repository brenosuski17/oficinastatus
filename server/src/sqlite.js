// Banco SQLite usando o módulo embutido do Node (node:sqlite), sem nada para compilar na instalação.
// Expõe a mesma interface que o resto do código já usa: prepare().run/get/all, exec, pragma e transaction.

// O Node ainda marca o node:sqlite como experimental e avisa a cada início; o aviso não ajuda quem usa o sistema.
const avisoOriginal = process.emitWarning;
process.emitWarning = function (aviso, ...resto) {
  if (String(aviso?.message ?? aviso).includes('SQLite')) return;
  return avisoOriginal.call(process, aviso, ...resto);
};

const { DatabaseSync } = require('node:sqlite');

// undefined vira NULL e booleano vira 0/1, como o SQLite guarda
const valor = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

class Comando {
  constructor(stmt, sql) {
    this.stmt = stmt;
    // nomes dos parâmetros @nome / :nome / $nome, para ignorar campos a mais no objeto
    this.nomes = [...new Set([...sql.matchAll(/[@:$]([A-Za-z_]\w*)/g)].map((m) => m[1]))];
  }

  args(lista) {
    if (lista.length === 1 && lista[0] && typeof lista[0] === 'object' && !Array.isArray(lista[0]) && !Buffer.isBuffer(lista[0])) {
      const obj = {};
      for (const n of this.nomes) obj[n] = valor(lista[0][n]);
      return [obj];
    }
    return lista.flat().map(valor);
  }

  run(...a) {
    const r = this.stmt.run(...this.args(a));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get(...a) {
    const r = this.stmt.get(...this.args(a));
    return r ? { ...r } : undefined;
  }

  all(...a) {
    return this.stmt.all(...this.args(a)).map((r) => ({ ...r }));
  }
}

class Banco {
  constructor(caminho) {
    this.db = new DatabaseSync(caminho);
    this.nivel = 0;
  }

  prepare(sql) { return new Comando(this.db.prepare(sql), sql); }
  exec(sql) { this.db.exec(sql); return this; }
  pragma(texto) { this.db.exec(`PRAGMA ${texto}`); }
  close() { this.db.close(); }

  /** Igual ao better-sqlite3: devolve uma função que roda `fn` dentro de uma transação (aninhável). */
  transaction(fn) {
    const banco = this;
    return function (...args) {
      const ponto = `sp${banco.nivel}`;
      banco.db.exec(banco.nivel === 0 ? 'BEGIN' : `SAVEPOINT ${ponto}`);
      banco.nivel++;
      try {
        const r = fn.apply(this, args);
        banco.nivel--;
        banco.db.exec(banco.nivel === 0 ? 'COMMIT' : `RELEASE ${ponto}`);
        return r;
      } catch (e) {
        banco.nivel--;
        banco.db.exec(banco.nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${ponto}; RELEASE ${ponto}`);
        throw e;
      }
    };
  }
}

module.exports = Banco;
