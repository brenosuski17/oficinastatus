// Monta as mensagens de cada etapa e dispara pelos canais configurados (e-mail e WhatsApp).
const db = require('../db');
const config = require('../config');
const envio = require('./envio');

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const linkAcompanhamento = (codigo) => `${config.appUrl()}/acompanhar/${codigo}`;
const dataBR = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : null);

function linkWhatsApp(telefone, texto) {
  return `https://wa.me/${envio.numeroWhats(telefone)}?text=${encodeURIComponent(texto)}`;
}

async function contexto(ordemId) {
  const o = await db.prepare(
    `SELECT o.*, v.placa, v.marca, v.modelo, c.nome AS cliente_nome, c.telefone, c.email,
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

// Cada evento: assunto do e-mail, texto (e-mail/WhatsApp), resumo curto (variável {{2}} do modelo do WhatsApp) e rótulo do botão.
const EVENTOS = {
  recebido: (c) => ({
    assunto: `Recebemos seu ${c.veiculo} (OS ${c.id})`,
    resumo: `recebemos o seu ${c.veiculo} (placa ${c.placa}). OS nº ${c.id} aberta, já vamos começar o diagnóstico.`,
    texto: `Olá, ${c.primeiro}! Recebemos o seu ${c.veiculo} (placa ${c.placa}) na ${c.oficina}.\nOrdem de serviço nº ${c.id} aberta. O próximo passo é o diagnóstico.\nVocê acompanha cada etapa pelo link, sem precisar ligar.`,
  }),
  diagnostico: (c) => ({
    assunto: `Diagnóstico concluído — OS ${c.id}`,
    resumo: `o diagnóstico do seu ${c.veiculo} foi concluído. Estamos montando o orçamento.`,
    texto: `${c.primeiro}, o diagnóstico do seu ${c.veiculo} foi concluído.\n${c.diagnostico ? `Diagnóstico: ${c.diagnostico}\n` : ''}Agora estamos montando o orçamento.`,
  }),
  orcamento: (c) => ({
    assunto: `Orçamento para aprovação — ${moeda(c.total)} (OS ${c.id})`,
    resumo: `o orçamento do seu ${c.veiculo} está pronto: ${moeda(c.total)}. Aprove ou recuse pelo link.`,
    texto: `${c.primeiro}, o orçamento do seu ${c.veiculo} (placa ${c.placa}) está pronto.\nValor total: ${moeda(c.total)}.\nPelo link você vê cada peça e serviço e pode aprovar tudo ou só parte.`,
    botao: 'Ver e aprovar orçamento',
  }),
  aprovado: (c) => ({
    assunto: `Orçamento aprovado — OS ${c.id}`,
    resumo: `recebemos sua aprovação (${moeda(c.total_aprovado)}). Vamos começar o serviço no seu ${c.veiculo}.`,
    texto: `Obrigado, ${c.primeiro}! Recebemos a aprovação do orçamento: ${moeda(c.total_aprovado)}.\nVamos começar o serviço no seu ${c.veiculo}.`,
  }),
  recusado: (c) => ({
    assunto: `Orçamento não aprovado — OS ${c.id}`,
    resumo: `registramos que o orçamento não foi aprovado. Seu ${c.veiculo} está disponível para retirada.`,
    texto: `${c.primeiro}, registramos que o orçamento da OS nº ${c.id} não foi aprovado.\nO seu ${c.veiculo} está disponível para retirada. Qualquer dúvida, estamos à disposição.`,
  }),
  execucao: (c) => ({
    assunto: `Serviço iniciado no seu ${c.veiculo}`,
    resumo: `o serviço no seu ${c.veiculo} começou.${c.previsao ? ` Previsão de entrega: ${c.previsao}.` : ''}`,
    texto: `${c.primeiro}, o serviço no seu ${c.veiculo} (placa ${c.placa}) começou.${c.previsao ? `\nPrevisão de entrega: ${c.previsao}.` : ''}`,
  }),
  aguardando_peca: (c) => ({
    assunto: `Aguardando peça — OS ${c.id}`,
    resumo: `o serviço no seu ${c.veiculo} está aguardando a chegada de uma peça. Avisamos assim que retomar.`,
    texto: `${c.primeiro}, o serviço no seu ${c.veiculo} está aguardando a chegada de uma peça.\nAvisaremos assim que o trabalho for retomado.`,
  }),
  retomado: (c) => ({
    assunto: `Serviço retomado — OS ${c.id}`,
    resumo: `a peça chegou e o serviço no seu ${c.veiculo} foi retomado.`,
    texto: `${c.primeiro}, a peça chegou e o serviço no seu ${c.veiculo} foi retomado.`,
  }),
  pronto: (c) => ({
    assunto: `Seu ${c.veiculo} está pronto!`,
    resumo: `seu ${c.veiculo} (placa ${c.placa}) está pronto para retirada. Total: ${moeda(c.total_aprovado)}.`,
    texto: `Boa notícia, ${c.primeiro}! O seu ${c.veiculo} (placa ${c.placa}) está pronto para retirada na ${c.oficina}.\nValor do serviço: ${moeda(c.total_aprovado)}.`,
  }),
  entregue: (c) => ({
    assunto: `Obrigado pela confiança — OS ${c.id}`,
    resumo: `registramos a retirada do seu ${c.veiculo}. Obrigado pela confiança!`,
    texto: `${c.primeiro}, registramos a retirada do seu ${c.veiculo}. Obrigado pela confiança!\nO histórico do serviço fica disponível no link.`,
  }),
};

const inserir = db.prepare(
  `INSERT INTO mensagens (ordem_id, etapa_id, canal, direcao, destinatario, assunto, conteudo, link_envio)
   VALUES (?, ?, ?, 'saida', ?, ?, ?, ?)`
);

/**
 * Registra e envia a notificação do evento pelos canais disponíveis.
 * Deve ser chamada dentro da transação da mudança de etapa: o envio real acontece logo após o commit.
 */
async function notificar(ordemId, evento, etapaId = null, { conviteLink } = {}) {
  const c = await contexto(ordemId);
  const e = EVENTOS[evento](c);
  const status = config.status();
  const textoCompleto = `${e.texto}\n\nAcompanhe: ${c.link}`;

  if (c.email && status.email.ativo) {
    const texto = conviteLink
      ? `${e.texto}\n\nCrie sua senha para ver todos os seus veículos e o histórico de serviços: ${conviteLink}`
      : e.texto;
    const { lastInsertRowid: id } = await inserir.run(ordemId, etapaId, 'email', c.email, e.assunto, texto, null);
    envio.enfileirar(id, { email: { link: c.link, botao: e.botao, titulo: e.assunto } });
  }

  if (status.whatsapp.ativo) {
    const { lastInsertRowid: id } = await inserir.run(ordemId, etapaId, 'whatsapp', c.telefone, e.assunto, textoCompleto, null);
    envio.enfileirar(id, { parametros: [c.primeiro, e.resumo, c.link] });
  } else {
    // Sem a API da Meta: a mensagem fica pronta para a oficina enviar com um clique (WhatsApp Web/app).
    await inserir.run(ordemId, etapaId, 'whatsapp', c.telefone, e.assunto, textoCompleto, linkWhatsApp(c.telefone, textoCompleto));
  }
}

async function registrarEntrada(ordemId, etapaId, texto) {
  await db.prepare(
    "INSERT INTO mensagens (ordem_id, etapa_id, canal, direcao, conteudo, status) VALUES (?, ?, 'sistema', 'entrada', ?, 'recebida')"
  ).run(ordemId, etapaId, texto);
}

module.exports = { notificar, registrarEntrada, linkAcompanhamento, moeda, EVENTOS };
