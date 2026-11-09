// npm run webhook: sobe o túnel do cloudflared e registra a URL dele no Telegram (setWebhook).
// Em produção, sem túnel: npm run webhook -- --url https://seu-dominio
// Na VM, dentro do container: docker compose ... exec app node scripts/webhook.js --url https://seu-dominio
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const config = require('../src/config');
const telegram = require('../src/services/telegram');

const CAMINHO = '/webhook/telegram';
const ESPERA_DNS_MS = 20000;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const extrairUrl = (texto) => /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(texto)?.[0];

function exigirConfiguracao() {
  const t = config.telegram();
  if (!t.token) throw new Error('Defina TELEGRAM_TOKEN no server/.env (o token vem do @BotFather).');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(t.webhookSecret)) throw new Error('Defina TELEGRAM_WEBHOOK_SECRET no server/.env, só com A-Z, a-z, 0-9, _ e -.');
  return t;
}

/** Espera o túnel responder pelo endereço público. O 530 é da Cloudflare, enquanto o túnel não está pronto. */
async function aguardarTunel(base, { limiteMs = 120000, intervaloMs = 3000 } = {}) {
  const limite = Date.now() + limiteMs;
  for (;;) {
    try {
      const r = await fetch(`${base}${CAMINHO}`, { method: 'POST', signal: AbortSignal.timeout(8000) });
      if (r.status !== 530) return;
    } catch { /* o endereço ainda não foi publicado no DNS */ }
    if (Date.now() >= limite) throw new Error('O túnel não ficou acessível pelo endereço público.');
    await esperar(intervaloMs);
  }
}

/**
 * Endereço de produção: aceita "dominio.com", "https://dominio.com/" ou a URL completa do webhook.
 * O Telegram só chama webhooks em HTTPS, então http:// é recusado.
 */
function normalizarDominio(texto) {
  const valor = String(texto ?? '').trim();
  if (!valor || valor.startsWith('--')) throw new Error('Informe o endereço: npm run webhook -- --url https://seu-dominio');
  if (/^http:\/\//i.test(valor)) throw new Error('O Telegram só aceita webhook em HTTPS. Use https://.');
  let url;
  try {
    url = new URL(/^https:\/\//i.test(valor) ? valor : `https://${valor}`);
  } catch {
    throw new Error(`Endereço inválido: ${valor}`);
  }
  if (!url.hostname.includes('.')) throw new Error(`Endereço inválido: ${valor}`);
  let caminho = url.pathname.replace(/\/+$/, '');
  if (caminho.endsWith(CAMINHO)) caminho = caminho.slice(0, -CAMINHO.length);
  return `${url.origin}${caminho}`;
}

/** Confere se o domínio já entrega o webhook: sem o segredo, a aplicação responde 401. */
async function conferirDominio(base) {
  let r;
  try {
    r = await fetch(`${base}${CAMINHO}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
  } catch (e) {
    throw new Error(`${base} não respondeu (${e.cause?.code || e.name}). Confira o DNS, as portas 80 e 443 e se a aplicação está no ar.`);
  }
  if (r.status !== 401) throw new Error(`${base}${CAMINHO} respondeu ${r.status}, mas o esperado era 401. O domínio aponta para esta aplicação?`);
}

// Token inválido ou inexistente não melhora com novas tentativas
const erroDefinitivo = (e) => e.codigo === 401 || e.codigo === 404;

/** Registra a URL, tentando de novo: o Telegram pode levar um tempo para encontrar um endereço novo. */
async function registrar(base, { tentativas = 8, intervaloMs = 5000 } = {}) {
  const { webhookSecret } = exigirConfiguracao();
  const url = `${base.replace(/\/$/, '')}${CAMINHO}`;
  for (let i = 1; ; i++) {
    try {
      await telegram.registrarWebhook(url, webhookSecret);
      return url;
    } catch (e) {
      if (erroDefinitivo(e) || i >= tentativas) throw e;
      console.log(`  O Telegram ainda não aceitou a URL (${e.message}). Nova tentativa em ${intervaloMs / 1000} s...`);
      await esperar(intervaloMs);
    }
  }
}

async function mostrarResultado(url) {
  const info = await telegram.lerWebhook();
  console.log(`\nWebhook registrado: ${url}`);
  if (info.url !== url) console.log(`  Atenção: o getWebhookInfo mostra ${info.url || 'nenhuma URL'}.`);
  console.log(`  Pendentes: ${info.pending_update_count ?? 0}${info.last_error_message ? ` · Último erro: ${info.last_error_message}` : ''}`);
}

async function avisarSeServidorParado() {
  const porta = process.env.WEBHOOK_PORT || 3334;
  try {
    await fetch(`http://127.0.0.1:${porta}${CAMINHO}`, { method: 'POST', signal: AbortSignal.timeout(2000) });
  } catch {
    console.log(`  Atenção: nada responde na porta ${porta}. Suba o servidor em outro terminal com npm run dev.`);
  }
}

function subirTunel() {
  const porta = process.env.WEBHOOK_PORT || 3334;
  const tunel = spawn(process.env.CLOUDFLARED_BIN || 'cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${porta}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const encerrar = () => { tunel.kill(); process.exit(0); };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  return new Promise((resolve, reject) => {
    let saida = '';
    const ler = (parte) => {
      saida = (saida + parte).slice(-20000);
      const url = extrairUrl(saida);
      if (url) resolve({ url, tunel });
    };
    tunel.stdout.on('data', ler);
    tunel.stderr.on('data', ler);
    tunel.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('cloudflared não encontrado. Instale com: winget install Cloudflare.cloudflared') : e));
    tunel.on('exit', (c) => reject(new Error(`O cloudflared terminou antes de criar o túnel (código ${c}).`)));
  });
}

async function principal() {
  exigirConfiguracao();
  const comIgual = process.argv.find((a) => a.startsWith('--url='));
  const argumento = process.argv.indexOf('--url');
  if (comIgual || argumento > 0) {
    // Produção: domínio fixo com HTTPS, sem túnel
    const base = normalizarDominio(comIgual ? comIgual.slice('--url='.length) : process.argv[argumento + 1]);
    console.log(`Conferindo ${base}${CAMINHO}...`);
    await conferirDominio(base);
    const url = await registrar(base, { tentativas: 3, intervaloMs: 5000 });
    await mostrarResultado(url);
    return;
  }
  console.log('Subindo o túnel do cloudflared...');
  const { url: base, tunel } = await subirTunel();
  try {
    await avisarSeServidorParado();
    console.log(`Esperando o endereço ficar público: ${base}`);
    await aguardarTunel(base);
    // Chamar o Telegram cedo demais faz ele guardar por um tempo que o endereço não existe
    await esperar(ESPERA_DNS_MS);
    const url = await registrar(base, { tentativas: 12, intervaloMs: 15000 });
    await mostrarResultado(url);
  } catch (e) {
    tunel.removeAllListeners('exit');
    tunel.kill();
    throw e;
  }
  console.log('\nO túnel fica ativo enquanto este comando rodar. Ao reiniciar, a URL muda e é registrada de novo. Ctrl+C para sair.');
  tunel.on('exit', () => process.exit(1));
}

module.exports = { extrairUrl, aguardarTunel, normalizarDominio, conferirDominio, registrar };

if (require.main === module) {
  principal().catch((e) => { console.error(`Erro: ${e.message}`); process.exit(1); });
}
