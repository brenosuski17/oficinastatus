// Processa o que chega pelo webhook do Telegram: vínculo pelo /start, mensagens recebidas e cliques de botão.
const db = require('../db');
const canais = require('./canais');
const envio = require('./envio');
const ordens = require('./ordens');
const telegram = require('./telegram');
const config = require('../config');
const { HttpError } = require('../errors');

const inserirEntrada = db.prepare(
  `INSERT INTO mensagens (canal_usuario_id, plataforma, direcao, id_externo, conteudo, status, payload_bruto, respondida_em, ordem_id)
   VALUES (?, 'telegram', 'entrada', ?, ?, 'respondida', ?, now(), ?)`
);

const registrarEntrada = ({ canalId, idExterno, conteudo, update, ordemId }) =>
  inserirEntrada.run(canalId ?? null, idExterno == null ? null : String(idExterno), conteudo, JSON.stringify(update), ordemId ?? null);

async function tratarMensagem(update) {
  const msg = update.message;
  const chatId = msg.chat?.id;
  if (chatId == null) return;
  const texto = msg.text || msg.caption || '[mensagem sem texto]';
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(msg.text || '');

  let canal = await canais.porChat(chatId);
  let resposta;
  if (start?.[1]) {
    const novo = await canais.vincular(start[1], chatId);
    if (novo) {
      canal = novo;
      resposta = `Tudo certo! Agora você recebe aqui os avisos da ${config.oficina().nome}.`;
    } else {
      resposta = 'Este link de vínculo é inválido ou expirou. Peça um novo à oficina.';
    }
  } else if (start) {
    resposta = canal?.ativo
      ? `Você já está vinculado e recebe aqui os avisos da ${config.oficina().nome}.`
      : 'Para receber os avisos, use o link de vínculo enviado pela oficina ou gerado no portal do cliente.';
  }
  await registrarEntrada({ canalId: canal?.id, idExterno: msg.message_id, conteudo: texto, update });

  // Resposta direta a uma mensagem do bot: é o "respondida" do ciclo de vida
  const respondeu = msg.reply_to_message?.message_id;
  if (respondeu != null && canal) {
    await db.prepare(
      `UPDATE mensagens SET status = 'respondida', respondida_em = now()
        WHERE plataforma = 'telegram' AND id_externo = ? AND canal_usuario_id = ? AND direcao = 'saida' AND status = 'enviada'`
    ).run(String(respondeu), canal.id);
  }
  if (resposta) await envio.responderChat(chatId, resposta, canal?.ativo === false ? null : canal?.id);
}

/** Aplica o clique em Aprovar ou Recusar e devolve o texto mostrado ao cliente. */
async function aplicarBotao(cq) {
  const acao = /^orc:(\d+):(aprovar|recusar)$/.exec(cq.data || '');
  if (!acao) return 'Esta ação não é reconhecida.';
  const ordemId = Number(acao[1]);
  const chatId = cq.message?.chat?.id ?? cq.from?.id;
  const canal = await canais.porChat(chatId);
  if (!canal?.ativo || !canal.cliente_id) return 'Este Telegram não está vinculado a um cliente.';

  const m = await db.prepare(
    `SELECT id FROM mensagens WHERE plataforma = 'telegram' AND direcao = 'saida' AND id_externo = ?
       AND canal_usuario_id = ? AND ordem_id = ? AND reply_markup IS NOT NULL`
  ).get(String(cq.message?.message_id), canal.id, ordemId);
  if (!m) return 'Este botão não vale mais.';
  const { ultima } = await db.prepare(
    "SELECT MAX(id) AS ultima FROM mensagens WHERE ordem_id = ? AND direcao = 'saida' AND reply_markup IS NOT NULL"
  ).get(ordemId);
  // O orçamento pode ter mudado depois desta mensagem: só a mais recente aprova
  if (ultima !== m.id) return 'Este orçamento foi atualizado. Use os botões da mensagem mais recente.';

  const os = await ordens.buscar(ordemId);
  if (os.cliente_id !== canal.cliente_id) return 'Este orçamento não é seu.';

  const aprovar = acao[2] === 'aprovar';
  const itens = {};
  if (aprovar) {
    for (const i of await db.prepare('SELECT id FROM itens_orcamento WHERE ordem_id = ?').all(ordemId)) itens[i.id] = true;
  }
  try {
    await db.transaction(async () => {
      await ordens.responderOrcamento(ordemId, { itens, observacao: 'Resposta pelo Telegram', origem: 'cliente' }, null);
      await db.prepare("UPDATE mensagens SET status = 'respondida', respondida_em = now() WHERE id = ?").run(m.id);
    })();
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) return 'Este orçamento já foi respondido.';
    throw e;
  }
  return aprovar ? 'Orçamento aprovado. Obrigado!' : 'Orçamento recusado.';
}

async function tratarBotao(update) {
  const cq = update.callback_query;
  let texto = 'Não foi possível registrar sua resposta. Tente pelo link da mensagem.';
  try {
    const canal = await canais.porChat(cq.message?.chat?.id ?? cq.from?.id);
    const ordem = /^orc:(\d+):/.exec(cq.data || '')?.[1];
    const existe = ordem && (await db.prepare('SELECT id FROM ordens_servico WHERE id = ?').get(ordem));
    await registrarEntrada({
      canalId: canal?.id,
      idExterno: cq.message?.message_id,
      conteudo: `Botão: ${/:recusar$/.test(cq.data || '') ? 'Recusar' : /:aprovar$/.test(cq.data || '') ? 'Aprovar' : cq.data}`,
      update,
      ordemId: existe ? Number(ordem) : null,
    });
    texto = await aplicarBotao(cq);
  } finally {
    // Sem esta resposta, o botão fica girando no celular do cliente
    await telegram.responderBotao(cq.id, texto).catch((e) => console.error('[telegram] answerCallbackQuery:', e.message));
  }
}

async function processar(update) {
  if (!Number.isSafeInteger(update?.update_id)) return;
  const novo = await db.prepare('INSERT INTO updates_telegram (update_id) VALUES (?) ON CONFLICT DO NOTHING RETURNING update_id').get(update.update_id);
  if (!novo) return; // o Telegram reenviou um update já processado
  if (update.message) await tratarMensagem(update);
  else if (update.callback_query) await tratarBotao(update);
}

// Um update de cada vez, na ordem em que chegaram
let fila = Promise.resolve();
function receber(update) {
  fila = fila.then(() => processar(update)).catch((e) => console.error('[telegram] erro ao processar update:', e.message));
  return fila;
}
const ocioso = () => fila;

module.exports = { receber, ocioso };
