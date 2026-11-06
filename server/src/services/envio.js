// Envio real das mensagens: e-mail via SMTP (nodemailer) e WhatsApp via API oficial da Meta (Cloud API).
const nodemailer = require('nodemailer');
const db = require('../db');
const config = require('../config');

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
    <tr><td style="padding:16px 28px;background:#f6f7fb;color:#5b6684;font-size:13px">${escapar(of.nome)}${of.telefone ? ` · WhatsApp (${of.telefone.slice(0, 2)}) ${of.telefone.slice(2)}` : ''}${of.endereco ? ` · ${escapar(of.endereco)}` : ''}</td></tr>
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

const numeroWhats = (tel) => {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return n;
};

async function enviarWhatsApp({ telefone, texto, parametros }) {
  const w = config.whatsapp();
  const corpo = w.template
    ? {
        messaging_product: 'whatsapp',
        to: numeroWhats(telefone),
        type: 'template',
        template: {
          name: w.template,
          language: { code: w.idioma },
          // Modelo aprovado na Meta com 3 variáveis: {{1}} nome, {{2}} atualização, {{3}} link
          components: [{ type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: String(t).replace(/\s*\n+\s*/g, ' ').slice(0, 1000) })) }],
        },
      }
    : { messaging_product: 'whatsapp', recipient_type: 'individual', to: numeroWhats(telefone), type: 'text', text: { preview_url: true, body: texto } };

  const resp = await fetch(`${w.url}/${w.versao}/${w.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(dados.error?.error_data?.details || dados.error?.message || `Meta respondeu ${resp.status}`);
    erro.codigo = dados.error?.code;
    throw erro;
  }
  return dados.messages?.[0]?.id || null;
}

const marcar = db.prepare(
  "UPDATE mensagens SET status = ?, erro = ?, erro_codigo = ?, id_externo = ?, enviada_em = CASE WHEN ?::text = 'enviada' THEN now() ELSE enviada_em END WHERE id = ?"
);

/** Envia uma mensagem já registrada (status pendente) pelo canal dela e atualiza o resultado. */
async function despachar(id, extra = {}) {
  const m = await db.prepare('SELECT * FROM mensagens WHERE id = ?').get(id);
  if (!m || m.direcao !== 'saida') return;
  try {
    let externo = null;
    if (m.canal === 'email') {
      externo = await enviarEmail({ para: m.destinatario, assunto: m.assunto, texto: m.conteudo, ...extra.email });
    } else if (m.canal === 'whatsapp') {
      externo = await enviarWhatsApp({ telefone: m.destinatario, texto: m.conteudo, parametros: extra.parametros || [] });
    } else return;
    await marcar.run('enviada', null, null, externo, 'enviada', id);
  } catch (e) {
    await marcar.run('falhou', String(e.message || e).slice(0, 500), e.codigo, null, 'falhou', id);
    console.error(`[envio] mensagem ${id} (${m.canal}) falhou:`, e.message);
  }
}

// Fila simples em memória: as mensagens são enviadas logo depois do commit, e não saem se a transação for desfeita.
const fila = [];
let processando = false;
function enfileirar(id, extra) {
  db.aposCommit(() => {
    fila.push([id, extra]);
    if (!processando) {
      processando = true; // marca já no agendamento para não abrir dois processadores
      setImmediate(processar);
    }
  });
}
async function processar() {
  while (fila.length) {
    const [id, extra] = fila.shift();
    await despachar(id, extra).catch((e) => console.error(`[envio] mensagem ${id} não atualizada:`, e.message));
  }
  processando = false;
}
const ocioso = () => new Promise((r) => { const t = () => (processando || fila.length ? setTimeout(t, 20) : r()); t(); });

module.exports = { enviarEmail, enviarWhatsApp, despachar, enfileirar, ocioso, numeroWhats };
