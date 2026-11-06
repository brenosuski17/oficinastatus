// Monta as mensagens de cada etapa e dispara pelos canais configurados (e-mail e bot do Telegram).
const db = require('../db');
const config = require('../config');
const envio = require('./envio');
const canais = require('./canais');

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const linkAcompanhamento = (codigo) => `${config.appUrl()}/acompanhar/${codigo}`;
const dataBR = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : null);

async function contexto(ordemId) {
  const o = await db.prepare(
    `SELECT o.*, v.placa, v.marca, v.modelo, c.id AS cliente_id, c.nome AS cliente_nome, c.email,
            (SELECT COALESCE(SUM(quantidade * valor_unitario), 0) FROM itens_orcamento WHERE ordem_id = o.id) AS total,
            (SELECT COALESCE(SUM(quantidade * valor_unitario), 0) FROM itens_orcamento WHERE ordem_id = o.id AND aprovado = 1) AS total_aprovado
       FROM ordens_servico o JOIN veiculos v ON v.id = o.veiculo_id JOIN clientes c ON c.id = v.cliente_id
      WHERE o.id = ?`
  ).get(ordemId);
  return {
    ...o,
    primeiro: o.cliente_nome.split(' ')[0],
    veiculo: `${o.marca.replace(/^.* - /, '')} ${o.modelo}`.trim(),
    link: linkAcompanhamento(o.codigo_publico),
    oficina: config.oficina().nome,
    previsao: dataBR(o.previsao_entrega),
  };
}

// Cada evento: assunto do e-mail, texto (e-mail/Telegram) e rótulo do botão do e-mail.
const EVENTOS = {
  recebido: (c) => ({
    assunto: `Recebemos seu ${c.veiculo} (OS ${c.id})`,
    texto: `Olá, ${c.primeiro}! Recebemos o seu ${c.veiculo} (placa ${c.placa}) na ${c.oficina}.\nOrdem de serviço nº ${c.id} aberta. O próximo passo é o diagnóstico.\nVocê acompanha cada etapa pelo link, sem precisar ligar.`,
  }),
  diagnostico: (c) => ({
    assunto: `Diagnóstico concluído — OS ${c.id}`,
    texto: `${c.primeiro}, o diagnóstico do seu ${c.veiculo} foi concluído.\n${c.diagnostico ? `Diagnóstico: ${c.diagnostico}\n` : ''}Agora estamos montando o orçamento.`,
  }),
  orcamento: (c) => ({
    assunto: `Orçamento para aprovação — ${moeda(c.total)} (OS ${c.id})`,
    texto: `${c.primeiro}, o orçamento do seu ${c.veiculo} (placa ${c.placa}) está pronto.\nValor total: ${moeda(c.total)}.\nPelo link você vê cada peça e serviço e pode aprovar tudo ou só parte.`,
    botao: 'Ver e aprovar orçamento',
  }),
  aprovado: (c) => ({
    assunto: `Orçamento aprovado — OS ${c.id}`,
    texto: `Obrigado, ${c.primeiro}! Recebemos a aprovação do orçamento: ${moeda(c.total_aprovado)}.\nVamos começar o serviço no seu ${c.veiculo}.`,
  }),
  recusado: (c) => ({
    assunto: `Orçamento não aprovado — OS ${c.id}`,
    texto: `${c.primeiro}, registramos que o orçamento da OS nº ${c.id} não foi aprovado.\nO seu ${c.veiculo} está disponível para retirada. Qualquer dúvida, estamos à disposição.`,
  }),
  execucao: (c) => ({
    assunto: `Serviço iniciado no seu ${c.veiculo}`,
    texto: `${c.primeiro}, o serviço no seu ${c.veiculo} (placa ${c.placa}) começou.${c.previsao ? `\nPrevisão de entrega: ${c.previsao}.` : ''}`,
  }),
  aguardando_peca: (c) => ({
    assunto: `Aguardando peça — OS ${c.id}`,
    texto: `${c.primeiro}, o serviço no seu ${c.veiculo} está aguardando a chegada de uma peça.\nAvisaremos assim que o trabalho for retomado.`,
  }),
  retomado: (c) => ({
    assunto: `Serviço retomado — OS ${c.id}`,
    texto: `${c.primeiro}, a peça chegou e o serviço no seu ${c.veiculo} foi retomado.`,
  }),
  pronto: (c) => ({
    assunto: `Seu ${c.veiculo} está pronto!`,
    texto: `Boa notícia, ${c.primeiro}! O seu ${c.veiculo} (placa ${c.placa}) está pronto para retirada na ${c.oficina}.\nValor do serviço: ${moeda(c.total_aprovado)}.`,
  }),
  entregue: (c) => ({
    assunto: `Obrigado pela confiança — OS ${c.id}`,
    texto: `${c.primeiro}, registramos a retirada do seu ${c.veiculo}. Obrigado pela confiança!\nO histórico do serviço fica disponível no link.`,
  }),
};

const inserirEmail = db.prepare(
  `INSERT INTO comunicacoes (ordem_id, etapa_id, canal, direcao, destinatario, assunto, conteudo)
   VALUES (?, ?, 'email', 'saida', ?, ?, ?)`
);
const inserirTelegram = db.prepare(
  `INSERT INTO mensagens (canal_usuario_id, plataforma, direcao, conteudo, status, erro_codigo, erro_descricao, ordem_id, etapa_id, reply_markup)
   VALUES (?, 'telegram', 'saida', ?, ?, ?, ?, ?, ?, ?)`
);

// O orçamento pede a resposta no próprio Telegram (o callback_data tem limite de 64 bytes)
const botoesOrcamento = (ordemId) => ({
  inline_keyboard: [[
    { text: 'Aprovar', callback_data: `orc:${ordemId}:aprovar` },
    { text: 'Recusar', callback_data: `orc:${ordemId}:recusar` },
  ]],
});

/**
 * Registra e envia a notificação do evento pelos canais disponíveis.
 * Deve ser chamada dentro da transação da mudança de etapa: o envio real acontece logo após o commit.
 */
async function notificar(ordemId, evento, etapaId = null, { conviteLink } = {}) {
  const c = await contexto(ordemId);
  const e = EVENTOS[evento](c);
  const status = config.status();

  if (c.email && status.email.ativo) {
    const texto = conviteLink
      ? `${e.texto}\n\nCrie sua senha para ver todos os seus veículos e o histórico de serviços: ${conviteLink}`
      : e.texto;
    const { lastInsertRowid: id } = await inserirEmail.run(ordemId, etapaId, c.email, e.assunto, texto);
    envio.enfileirarEmail(id, { link: c.link, botao: e.botao, titulo: e.assunto });
  }

  // Sem vínculo o bot não tem como falar com o cliente; a mensagem fica registrada com o motivo
  const canal = await canais.ativoDoCliente(c.cliente_id);
  const botoes = evento === 'orcamento' ? JSON.stringify(botoesOrcamento(ordemId)) : null;
  const conteudo = `${e.texto}\n\nAcompanhe: ${c.link}`;
  if (canal) {
    const { lastInsertRowid: id } = await inserirTelegram.run(canal.id, conteudo, 'enfileirada', null, null, ordemId, etapaId, botoes);
    envio.enfileirarTelegram(id);
  } else {
    await inserirTelegram.run(null, conteudo, 'falha', 'sem_vinculo', 'O cliente ainda não vinculou o Telegram.', ordemId, etapaId, botoes);
  }
}

async function registrarEntrada(ordemId, etapaId, texto) {
  await db.prepare(
    "INSERT INTO comunicacoes (ordem_id, etapa_id, canal, direcao, conteudo, status) VALUES (?, ?, 'sistema', 'entrada', ?, 'recebida')"
  ).run(ordemId, etapaId, texto);
}

module.exports = { notificar, registrarEntrada, linkAcompanhamento, moeda, EVENTOS };
