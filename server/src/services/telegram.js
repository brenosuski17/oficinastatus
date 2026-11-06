// Cliente da Bot API do Telegram. O token vai na URL: nunca registre a URL nem o token em log.
const config = require('../config');

class ErroTelegram extends Error {
  constructor(mensagem, codigo, retryAfter) {
    super(mensagem);
    this.codigo = codigo;
    this.retryAfter = retryAfter;
  }
}

async function chamar(metodo, corpo) {
  const t = config.telegram();
  let resp;
  try {
    resp = await fetch(`${t.url}/bot${t.token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo ?? {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new ErroTelegram(`Falha de rede ao chamar o Telegram: ${e.name}`);
  }
  const dados = await resp.json().catch(() => ({}));
  if (!dados.ok) {
    const codigo = dados.error_code ?? resp.status;
    throw new ErroTelegram(dados.description || `Telegram respondeu ${resp.status}`, codigo, dados.parameters?.retry_after);
  }
  return dados.result;
}

/** Envia a mensagem e devolve o message_id. */
async function enviarMensagem(chatId, texto, replyMarkup) {
  const r = await chamar('sendMessage', {
    chat_id: String(chatId),
    text: texto.slice(0, 4096),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return String(r.message_id);
}

const responderBotao = (callbackQueryId, texto) => chamar('answerCallbackQuery', { callback_query_id: callbackQueryId, text: texto });

const registrarWebhook = (url, segredo) => chamar('setWebhook', {
  url,
  secret_token: segredo,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});

const lerWebhook = () => chamar('getWebhookInfo');

module.exports = { ErroTelegram, enviarMensagem, responderBotao, registrarWebhook, lerWebhook };
