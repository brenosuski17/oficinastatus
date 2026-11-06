// Envio real das mensagens: e-mail via SMTP (nodemailer) e bot do Telegram, com fila depois do commit.
const nodemailer = require('nodemailer');
const db = require('../db');
const config = require('../config');
const telegram = require('./telegram');

let transporte = null;
let chaveTransporte = '';
function smtp() {
  const s = config.smtp();
  const chave = JSON.stringify(s);
  if (!transporte || chave !== chaveTransporte) {
    transporte = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      tls: s.ignorarTls ? { rejectUnauthorized: false } : undefined,
      ignoreTLS: s.ignorarTls,
    });
    chaveTransporte = chave;
  }
  return transporte;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** E-mail em HTML com botão de acompanhamento; o texto puro vai junto para leitores simples. */
function htmlEmail({ titulo, texto, link, botao }) {
  const of = config.oficina();
  const paragrafos = escapar(texto).split('\n').filter(Boolean).map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eef1f8;font-family:Segoe UI,Arial,sans-serif;color:#16213a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#2b4cff;padding:22px 28px;color:#fff;font-size:18px;font-weight:700">${escapar(of.nome)}</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapar(titulo)}</h1>
      <div style="font-size:16px;line-height:1.55">${paragrafos}</div>
      ${link ? `<p style="margin:22px 0 6px"><a href="${escapar(link)}" style="display:inline-block;background:#2b4cff;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">${escapar(botao || 'Acompanhar meu veículo')}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f6f7fb;color:#5b6684;font-size:13px">${escapar(of.nome)}${of.telefone ? ` · Telefone (${of.telefone.slice(0, 2)}) ${of.telefone.slice(2)}` : ''}${of.endereco ? ` · ${escapar(of.endereco)}` : ''}</td></tr>
  </table></td></tr></table></body></html>`;
}

async function enviarEmail({ para, assunto, texto, link, botao, titulo }) {
  const s = config.smtp();
  const info = await smtp().sendMail({
    from: `"${config.oficina().nome}" <${s.from}>`,
    to: para,
    subject: assunto,
    text: link ? `${texto}\n\n${botao || 'Acompanhe'}: ${link}` : texto,
    html: htmlEmail({ titulo: titulo || assunto, texto, link, botao }),
  });
  return info.messageId;
}

// ---------------------------------------------------------------- e-mail
const marcarEmail = db.prepare(
  "UPDATE comunicacoes SET status = ?, erro = ?, id_externo = ?, enviada_em = CASE WHEN ?::text = 'enviada' THEN now() ELSE enviada_em END WHERE id = ?"
);

/** Envia um e-mail já registrado (status pendente) e atualiza o resultado. */
async function despacharEmail(id, extra = {}) {
  const m = await db.prepare('SELECT * FROM comunicacoes WHERE id = ?').get(id);
  if (!m || m.direcao !== 'saida' || m.canal !== 'email') return;
  try {
    const externo = await enviarEmail({ para: m.destinatario, assunto: m.assunto, texto: m.conteudo, ...extra });
    await marcarEmail.run('enviada', null, externo, 'enviada', id);
  } catch (e) {
    await marcarEmail.run('falhou', String(e.message || e).slice(0, 500), null, 'falhou', id);
    console.error(`[envio] e-mail ${id} falhou:`, e.message);
  }
}

// ---------------------------------------------------------------- Telegram
const MAX_TENTATIVAS = 5;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const marcarEnviada = db.prepare("UPDATE mensagens SET status = 'enviada', id_externo = ?, enviada_em = now(), erro_codigo = NULL, erro_descricao = NULL WHERE id = ?");
const marcarFalha = db.prepare("UPDATE mensagens SET status = 'falha', erro_codigo = ?, erro_descricao = ? WHERE id = ?");

// 429 e erros temporários do Telegram ou da rede valem nova tentativa; os demais não vão mudar sozinhos
const temporario = (e) => e.codigo === 429 || e.codigo == null || e.codigo >= 500;

/**
 * Envia uma mensagem enfileirada. No 429, espera o retry_after e tenta de novo; nos erros temporários, usa backoff.
 * No 403 (o cliente bloqueou o bot), desativa o vínculo. Sem token, a mensagem continua na fila.
 */
async function despacharTelegram(id, { tentativas = MAX_TENTATIVAS } = {}) {
  if (!config.status().telegram.ativo) return;
  const m = await db.prepare(
    `SELECT m.*, cu.chat_id, cu.ativo AS canal_ativo FROM mensagens m LEFT JOIN canais_usuario cu ON cu.id = m.canal_usuario_id
      WHERE m.id = ? AND m.direcao = 'saida' AND m.status = 'enfileirada'`
  ).get(id);
  if (!m) return;
  if (!m.chat_id || !m.canal_ativo) {
    await marcarFalha.run('sem_vinculo', 'O destinatário não tem vínculo ativo com o bot.', id);
    return;
  }
  for (let tentativa = 1; ; tentativa++) {
    try {
      await marcarEnviada.run(await telegram.enviarMensagem(m.chat_id, m.conteudo, m.reply_markup), id);
      return;
    } catch (e) {
      if (e.codigo === 403) await db.prepare('UPDATE canais_usuario SET ativo = false WHERE id = ?').run(m.canal_usuario_id);
      if (!temporario(e) || tentativa >= tentativas) {
        await marcarFalha.run(e.codigo == null ? 'rede' : String(e.codigo), String(e.message).slice(0, 500), id);
        console.error(`[envio] mensagem ${id} (Telegram) falhou: ${e.codigo ?? 'rede'}`);
        return;
      }
      await esperar(e.retryAfter ? e.retryAfter * 1000 : 2 ** (tentativa - 1) * 1000);
    }
  }
}

/** Resposta direta do bot a um chat (vínculo), que também pode não ter vínculo ativo. Fica registrada em mensagens. */
async function responderChat(chatId, texto, canalId) {
  const { lastInsertRowid: id } = await db.prepare(
    "INSERT INTO mensagens (canal_usuario_id, plataforma, direcao, conteudo) VALUES (?, 'telegram', 'saida', ?)"
  ).run(canalId ?? null, texto);
  try {
    await marcarEnviada.run(await telegram.enviarMensagem(chatId, texto), id);
  } catch (e) {
    await marcarFalha.run(e.codigo == null ? 'rede' : String(e.codigo), String(e.message).slice(0, 500), id);
  }
}

// ---------------------------------------------------------------- fila
// Fila simples em memória: as mensagens são enviadas logo depois do commit, e não saem se a transação for desfeita.
const fila = [];
let processando = false;
function colocar(item) {
  fila.push(item);
  if (!processando) {
    processando = true; // marca já no agendamento para não abrir dois processadores
    setImmediate(processar);
  }
}
const enfileirarEmail = (id, extra) => db.aposCommit(() => colocar({ canal: 'email', id, extra }));
const enfileirarTelegram = (id) => db.aposCommit(() => colocar({ canal: 'telegram', id }));

async function processar() {
  while (fila.length) {
    const { canal, id, extra } = fila.shift();
    await (canal === 'email' ? despacharEmail(id, extra) : despacharTelegram(id))
      .catch((e) => console.error(`[envio] ${canal} ${id} não atualizado:`, e.message));
  }
  processando = false;
}
const ocioso = () => new Promise((r) => { const t = () => (processando || fila.length ? setTimeout(t, 20) : r()); t(); });

/** Ao subir o servidor: retoma o que ficou na fila (reinício, ou token configurado depois). */
async function retomarFila() {
  if (!config.status().telegram.ativo) return;
  const linhas = await db.prepare("SELECT id FROM mensagens WHERE direcao = 'saida' AND status = 'enfileirada' ORDER BY id").all();
  for (const { id } of linhas) colocar({ canal: 'telegram', id });
}

module.exports = { enviarEmail, despacharEmail, despacharTelegram, responderChat, enfileirarEmail, enfileirarTelegram, ocioso, retomarFila };
