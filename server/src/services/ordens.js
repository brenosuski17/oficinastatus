const crypto = require('crypto');
const db = require('../db');
const { notificar, registrarEntrada, linkAcompanhamento, moeda } = require('./notificacao');
const { naoEncontrado, requisicaoInvalida, conflito } = require('../errors');

const ETAPAS = ['orcamento', 'aprovacao', 'execucao', 'pronto'];

const SQL_ORDEM = `
  SELECT o.*,
         v.placa, v.marca, v.modelo, v.ano_modelo, v.cor, v.tipo AS veiculo_tipo,
         v.fipe_valor, v.fipe_mes_referencia,
         c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         (SELECT e.tipo FROM etapas e
           WHERE e.ordem_id = o.id AND e.status IN ('em_andamento','recusada')
           ORDER BY e.sequencia LIMIT 1)                                   AS etapa_em_andamento,
         (SELECT e.tipo FROM etapas e
           WHERE e.ordem_id = o.id AND e.status = 'concluida'
           ORDER BY e.sequencia DESC LIMIT 1)                              AS ultima_etapa_concluida
    FROM ordens_servico o
    JOIN veiculos v ON v.id = o.veiculo_id
    JOIN clientes c ON c.id = v.cliente_id`;

/** Etapa que resume a OS para o painel (coluna do quadro). */
function etapaAtual(o) {
  if (o.situacao === 'recusada') return 'recusada';
  if (o.situacao === 'finalizada') return 'entregue';
  if (o.etapa_em_andamento) return o.etapa_em_andamento;
  if (o.ultima_etapa_concluida === 'aprovacao') return 'aprovado'; // aguardando início
  return o.ultima_etapa_concluida || 'orcamento';
}

const comEtapa = (o) => ({ ...o, etapa_atual: etapaAtual(o) });

function etapa(ordemId, tipo) {
  return db.prepare('SELECT * FROM etapas WHERE ordem_id = ? AND tipo = ?').get(ordemId, tipo);
}

function mudarEtapa(ordemId, tipo, status, observacao) {
  const campos = { em_andamento: "iniciada_em = datetime('now')", concluida: "concluida_em = datetime('now')", recusada: "concluida_em = datetime('now')" };
  db.prepare(
    `UPDATE etapas SET status = ?, observacao = COALESCE(?, observacao)
       ${campos[status] ? ', ' + campos[status] : ''}
     WHERE ordem_id = ? AND tipo = ?`
  ).run(status, observacao ?? null, ordemId, tipo);
  db.prepare("UPDATE ordens_servico SET atualizado_em = datetime('now') WHERE id = ?").run(ordemId);
  return etapa(ordemId, tipo);
}

function buscar(id) {
  const o = db.prepare(`${SQL_ORDEM} WHERE o.id = ?`).get(id);
  if (!o) throw naoEncontrado('Ordem de serviço');
  return comEtapa(o);
}

function exigirAberta(o) {
  if (o.situacao !== 'aberta') throw conflito('Esta ordem de serviço já foi encerrada.');
}

function listar({ etapa: filtroEtapa, busca } = {}) {
  const params = [];
  let where = '';
  if (busca) {
    where = `WHERE (v.placa LIKE ? OR c.nome LIKE ? OR v.modelo LIKE ? OR CAST(o.id AS TEXT) = ?)`;
    const b = `%${busca}%`;
    params.push(b, b, b, busca);
  }
  const ordens = db
    .prepare(`${SQL_ORDEM} ${where} ORDER BY o.atualizado_em DESC, o.id DESC`)
    .all(...params)
    .map(comEtapa);
  return filtroEtapa ? ordens.filter((o) => o.etapa_atual === filtroEtapa) : ordens;
}

function detalhe(id) {
  const o = buscar(id);
  return {
    ...o,
    link_acompanhamento: linkAcompanhamento(o.codigo_publico),
    etapas: db.prepare('SELECT * FROM etapas WHERE ordem_id = ? ORDER BY sequencia').all(id),
    mensagens: db.prepare('SELECT * FROM mensagens WHERE ordem_id = ? ORDER BY id DESC').all(id),
  };
}

const criar = db.transaction(({ veiculo_id, problema_relatado, previsao_entrega }) => {
  if (!veiculo_id) throw requisicaoInvalida('Informe o veículo.');
  if (!problema_relatado?.trim()) throw requisicaoInvalida('Descreva o problema relatado pelo cliente.');
  const veiculo = db.prepare('SELECT id FROM veiculos WHERE id = ?').get(veiculo_id);
  if (!veiculo) throw naoEncontrado('Veículo');

  const aberta = db
    .prepare("SELECT id FROM ordens_servico WHERE veiculo_id = ? AND situacao = 'aberta'")
    .get(veiculo_id);
  if (aberta) throw conflito(`Este veículo já tem a OS nº ${aberta.id} em aberto.`);

  const codigo = crypto.randomBytes(6).toString('base64url');
  const { lastInsertRowid: id } = db
    .prepare(
      `INSERT INTO ordens_servico (veiculo_id, codigo_publico, problema_relatado, previsao_entrega)
       VALUES (?, ?, ?, ?)`
    )
    .run(veiculo_id, codigo, problema_relatado.trim(), previsao_entrega || null);

  const ins = db.prepare('INSERT INTO etapas (ordem_id, tipo, sequencia) VALUES (?, ?, ?)');
  ETAPAS.forEach((tipo, i) => ins.run(id, tipo, i + 1));

  const e = mudarEtapa(id, 'orcamento', 'em_andamento');
  notificar(id, 'abertura', e.id);
  return detalhe(id);
});

const enviarOrcamento = db.transaction((id, { descricao, valor, previsao_entrega }) => {
  const o = buscar(id);
  exigirAberta(o);
  if (!['orcamento', 'aprovacao'].includes(o.etapa_atual))
    throw conflito('O orçamento só pode ser enviado antes da aprovação.');
  if (!descricao?.trim()) throw requisicaoInvalida('Descreva os serviços e peças do orçamento.');
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) throw requisicaoInvalida('Informe um valor de orçamento válido.');

  db.prepare(
    `UPDATE ordens_servico
        SET orcamento_descricao = ?, orcamento_valor = ?,
            previsao_entrega = COALESCE(?, previsao_entrega)
      WHERE id = ?`
  ).run(descricao.trim(), v, previsao_entrega || null, id);

  mudarEtapa(id, 'orcamento', 'concluida');
  const e = mudarEtapa(id, 'aprovacao', 'em_andamento');
  notificar(id, 'orcamento', e.id);
  return detalhe(id);
});

/** origem: 'cliente' (página de acompanhamento) ou 'oficina' (cliente respondeu por telefone/balcão). */
const responderOrcamento = db.transaction((id, { aprovado, observacao, origem = 'oficina' }) => {
  const o = buscar(id);
  exigirAberta(o);
  if (o.etapa_atual !== 'aprovacao') throw conflito('Não há orçamento aguardando aprovação.');

  const e = etapa(id, 'aprovacao');
  const texto = `${aprovado ? 'Aprovo' : 'Não aprovo'} o orçamento de ${moeda(o.orcamento_valor)}.` +
    (observacao?.trim() ? ` Obs.: ${observacao.trim()}` : '');
  if (origem === 'cliente') registrarEntrada(id, e.id, texto);

  const obs = `${aprovado ? 'Aprovado' : 'Recusado'} pelo ${origem === 'cliente' ? 'cliente (link)' : 'atendente'}` +
    (observacao?.trim() ? `: ${observacao.trim()}` : '');

  if (aprovado) {
    mudarEtapa(id, 'aprovacao', 'concluida', obs);
    notificar(id, 'aprovado', e.id);
  } else {
    mudarEtapa(id, 'aprovacao', 'recusada', obs);
    db.prepare("UPDATE ordens_servico SET situacao = 'recusada' WHERE id = ?").run(id);
    notificar(id, 'recusado', e.id);
  }
  return detalhe(id);
});

const iniciarExecucao = db.transaction((id, { previsao_entrega } = {}) => {
  const o = buscar(id);
  exigirAberta(o);
  if (o.etapa_atual !== 'aprovado') throw conflito('A execução só começa depois do orçamento aprovado.');
  if (previsao_entrega)
    db.prepare('UPDATE ordens_servico SET previsao_entrega = ? WHERE id = ?').run(previsao_entrega, id);
  const e = mudarEtapa(id, 'execucao', 'em_andamento');
  notificar(id, 'execucao', e.id);
  return detalhe(id);
});

const marcarPronto = db.transaction((id, { observacao } = {}) => {
  const o = buscar(id);
  exigirAberta(o);
  if (o.etapa_atual !== 'execucao') throw conflito('O serviço precisa estar em execução.');
  mudarEtapa(id, 'execucao', 'concluida', observacao);
  const e = mudarEtapa(id, 'pronto', 'concluida');
  notificar(id, 'pronto', e.id);
  return detalhe(id);
});

const registrarEntrega = db.transaction((id) => {
  const o = buscar(id);
  if (o.situacao === 'finalizada') throw conflito('A entrega já foi registrada.');
  if (!(o.etapa_atual === 'pronto' || o.situacao === 'recusada'))
    throw conflito('O veículo só pode ser entregue quando estiver pronto ou com orçamento recusado.');
  db.prepare(
    "UPDATE ordens_servico SET situacao = 'finalizada', entregue_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?"
  ).run(id);
  return detalhe(id);
});

/** Dados expostos na página pública (sem telefone nem dados internos). */
function publico(codigo) {
  const o = db.prepare('SELECT id FROM ordens_servico WHERE codigo_publico = ?').get(codigo);
  if (!o) throw naoEncontrado('Ordem de serviço');
  const d = detalhe(o.id);
  return {
    id: d.id,
    codigo_publico: d.codigo_publico,
    situacao: d.situacao,
    etapa_atual: d.etapa_atual,
    problema_relatado: d.problema_relatado,
    orcamento_descricao: d.etapa_atual === 'orcamento' ? null : d.orcamento_descricao,
    orcamento_valor: d.etapa_atual === 'orcamento' ? null : d.orcamento_valor,
    previsao_entrega: d.previsao_entrega,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em,
    entregue_em: d.entregue_em,
    cliente_primeiro_nome: d.cliente_nome.split(' ')[0],
    veiculo: { placa: d.placa, marca: d.marca, modelo: d.modelo, ano_modelo: d.ano_modelo, cor: d.cor },
    etapas: d.etapas.map(({ tipo, status, observacao, iniciada_em, concluida_em }) => ({
      tipo, status, observacao, iniciada_em, concluida_em,
    })),
    oficina: process.env.NOME_OFICINA || 'OficinaStatus',
    telefone_oficina: process.env.TELEFONE_OFICINA || null,
  };
}

function resumo() {
  const contagem = {};
  for (const o of listar()) contagem[o.etapa_atual] = (contagem[o.etapa_atual] || 0) + 1;
  const pendentes = db.prepare("SELECT COUNT(*) n FROM mensagens WHERE direcao = 'saida' AND status = 'pendente'").get().n;
  return { por_etapa: contagem, mensagens_pendentes: pendentes };
}

module.exports = {
  ETAPAS, listar, detalhe, criar, enviarOrcamento, responderOrcamento,
  iniciarExecucao, marcarPronto, registrarEntrega, publico, resumo,
};
