// npm run webhook: sobe o túnel do cloudflared e registra a URL dele no Telegram (setWebhook).
// Em produção, sem túnel: npm run webhook -- --url https://seu-dominio
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const config = require('../src/config');
const telegram = require('../src/services/telegram');

const CAMINHO = '/webhook/telegram';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const extrairUrl = (texto) => /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(texto)?.[0];

function exigirConfiguracao() {
  const t = config.telegram();
  if (!t.token) throw new Error('Defina TELEGRAM_TOKEN no server/.env (o token vem do @BotFather).');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(t.webhookSecret)) throw new Error('Defina TELEGRAM_WEBHOOK_SECRET no server/.env, só com A-Z, a-z, 0-9, _ e -.');
  return t;
}

/** Registra a URL, tentando de novo: um túnel novo pode levar alguns segundos para ser encontrado pelo Telegram. */
async function registrar(base, { tentativas = 8, intervaloMs = 5000 } = {}) {
  const { webhookSecret } = exigirConfiguracao();
  const url = `${base.replace(/\/$/, '')}${CAMINHO}`;
  for (let i = 1; ; i++) {
    try {
      await telegram.registrarWebhook(url, webhookSecret);
      return url;
    } catch (e) {
      if (i >= tentativas) throw e;
      console.log(`  O Telegram ainda não aceitou a URL (${e.message}). Nova tentativa em ${intervaloMs / 1000} s...`);
      await esperar(intervaloMs);
    }
  }
}

async function mostrarResultado(url) {
  const info = await telegram.lerWebhook();
  console.log(`\nWebhook registrado: ${url}`);
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
  const argumento = process.argv.indexOf('--url');
  if (argumento > 0) {
    const url = await registrar(process.argv[argumento + 1] || '');
    await mostrarResultado(url);
    return;
  }
  console.log('Subindo o túnel do cloudflared...');
  const { url: base, tunel } = await subirTunel();
  await avisarSeServidorParado();
  const url = await registrar(base);
  await mostrarResultado(url);
  console.log('\nO túnel fica ativo enquanto este comando rodar. Ao reiniciar, a URL muda e é registrada de novo. Ctrl+C para sair.');
  tunel.on('exit', () => process.exit(1));
}

module.exports = { extrairUrl, registrar };

if (require.main === module) {
  principal().catch((e) => { console.error(`Erro: ${e.message}`); process.exit(1); });
}
