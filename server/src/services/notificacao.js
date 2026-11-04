const db = require('../db');

const NOME_OFICINA = () => process.env.NOME_OFICINA || 'OficinaStatus';
const APP_URL = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const moeda = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function linkAcompanhamento(codigo) {
  return `${APP_URL()}/acompanhar/${codigo}`;
}

// Monta o link wa.me (abre o WhatsApp com a mensagem pronta para o cliente).
function linkWhatsApp(telefone, texto) {
  let numero = String(telefone || '').replace(/\D/g, '');
  if (numero.length === 10 || numero.length === 11) numero = '55' + numero; // DDD + número
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const MODELOS = {
  abertura: (c) =>
    `Olá, ${c.primeiroNome}! Recebemos o seu ${c.veiculo} (placa ${c.placa}) na ${c.oficina}. ` +
    `Ordem de serviço nº ${c.ordemId}. Estamos avaliando o veículo e logo enviaremos o orçamento.\n\n` +
    `Acompanhe o andamento por aqui, sem precisar ligar: ${c.link}`,
  orcamento: (c) =>
    `Olá, ${c.primeiroNome}! O orçamento do seu ${c.veiculo} (placa ${c.placa}) está pronto.\n\n` +
    `${c.orcamentoDescricao}\nValor total: ${c.orcamentoValor}\n\n` +
    `Para APROVAR ou RECUSAR, acesse: ${c.link}`,
  aprovado: (c) =>
    `Obrigado, ${c.primeiroNome}! Orçamento da OS nº ${c.ordemId} aprovado. ` +
    `Vamos iniciar o serviço no seu ${c.veiculo}. Acompanhe: ${c.link}`,
  recusado: (c) =>
    `${c.primeiroNome}, registramos que o orçamento da OS nº ${c.ordemId} não foi aprovado. ` +
    `O seu ${c.veiculo} está disponível para retirada. Qualquer dúvida, estamos à disposição.`,
  execucao: (c) =>
    `${c.primeiroNome}, o serviço no seu ${c.veiculo} (placa ${c.placa}) começou!` +
    `${c.previsao ? ` Previsão de entrega: ${c.previsao}.` : ''} Acompanhe: ${c.link}`,
  pronto: (c) =>
    `Boa notícia, ${c.primeiroNome}! O seu ${c.veiculo} (placa ${c.placa}) está PRONTO para retirada na ${c.oficina}. ` +
    `Detalhes: ${c.link}`,
};

function contexto(ordemId) {
  const o = db
    .prepare(
      `SELECT o.*, v.placa, v.marca, v.modelo, c.nome AS cliente_nome, c.telefone
         FROM ordens_servico o
         JOIN veiculos v ON v.id = o.veiculo_id
         JOIN clientes c ON c.id = v.cliente_id
        WHERE o.id = ?`
    )
    .get(ordemId);
  const previsao = o.previsao_entrega
    ? new Date(o.previsao_entrega + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;
  return {
    telefone: o.telefone,
    primeiroNome: o.cliente_nome.split(' ')[0],
    veiculo: `${o.marca} ${o.modelo}`.trim(),
    placa: o.placa,
    ordemId: o.id,
    oficina: NOME_OFICINA(),
    link: linkAcompanhamento(o.codigo_publico),
    orcamentoDescricao: o.orcamento_descricao || '',
    orcamentoValor: o.orcamento_valor != null ? moeda(o.orcamento_valor) : '',
    previsao,
  };
}

/** Registra uma mensagem de saída para o cliente, com o link de envio pronto. */
function notificar(ordemId, modelo, etapaId = null) {
  const c = contexto(ordemId);
  const texto = MODELOS[modelo](c);
  const link = linkWhatsApp(c.telefone, texto);
  const info = db
    .prepare(
      `INSERT INTO mensagens (ordem_id, etapa_id, direcao, conteudo, link_envio)
       VALUES (?, ?, 'saida', ?, ?)`
    )
    .run(ordemId, etapaId, texto, link);
  return info.lastInsertRowid;
}

/** Registra uma mensagem recebida do cliente (ex.: resposta ao orçamento). */
function registrarEntrada(ordemId, etapaId, texto) {
  db.prepare(
    `INSERT INTO mensagens (ordem_id, etapa_id, direcao, conteudo, status)
     VALUES (?, ?, 'entrada', ?, 'recebida')`
  ).run(ordemId, etapaId, texto);
}

module.exports = { notificar, registrarEntrada, linkAcompanhamento, linkWhatsApp, moeda };
