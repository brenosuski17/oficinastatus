// Grava na tabela mensagens os status de entrega que a Meta informa pelo webhook.
const db = require('../db');

// A Meta pode avisar fora de ordem ou repetir um aviso: o status só avança.
const ORDEM = { sent: 1, delivered: 2, read: 3, failed: 4 };

function descricaoErro(erro) {
  if (!erro) return 'A Meta não informou o motivo.';
  const detalhe = erro.error_data?.details || erro.message;
  return (erro.title && detalhe && erro.title !== detalhe ? `${erro.title}: ${detalhe}` : detalhe || erro.title || 'A Meta não informou o motivo.').slice(0, 500);
}

const buscar = db.prepare("SELECT id, status_entrega FROM mensagens WHERE id_externo = ? AND canal = 'whatsapp'");
const atualizar = db.prepare(
  `UPDATE mensagens SET status_entrega = ?, status_entrega_em = COALESCE(datetime(?, 'unixepoch'), datetime('now')),
          status = COALESCE(?, status), erro = COALESCE(?, erro), erro_codigo = COALESCE(?, erro_codigo)
    WHERE id = ?`
);

function aplicar({ id, status, timestamp, errors }) {
  if (!ORDEM[status]) return;
  const m = buscar.get(String(id));
  if (!m) {
    console.warn(`[webhook] status "${status}" de uma mensagem desconhecida: ${id}`);
    return;
  }
  if (ORDEM[status] <= (ORDEM[m.status_entrega] || 0)) return;
  const falhou = status === 'failed';
  const erro = errors?.[0];
  atualizar.run(status, Number(timestamp) || null, falhou ? 'falhou' : null, falhou ? descricaoErro(erro) : null, falhou ? erro?.code : null, m.id);
  if (falhou) console.error(`[webhook] mensagem ${m.id} falhou na Meta (${erro?.code}): ${descricaoErro(erro)}`);
}

/** Processa o corpo inteiro de um aviso do webhook (entry[].changes[].value.statuses[]). */
const registrar = db.transaction((corpo) => {
  for (const entrada of corpo?.entry ?? []) {
    for (const mudanca of entrada?.changes ?? []) {
      for (const status of mudanca?.value?.statuses ?? []) aplicar(status);
    }
  }
});

module.exports = { registrar };
