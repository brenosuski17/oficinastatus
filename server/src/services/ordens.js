// Regras das ordens de serviço: as 7 etapas e o que pode acontecer em cada uma.
const crypto = require('crypto');
const db = require('../db');
const auth = require('./auth');
const { notificar, registrarEntrada, linkAcompanhamento, moeda } = require('./notificacao');
const { naoEncontrado, requisicaoInvalida, conflito, proibido } = require('../errors');

const ETAPAS = ['recebido', 'diagnostico', 'orcamento', 'aprovacao', 'execucao', 'pronto', 'entregue'];

const SQL_BASE = `
  SELECT o.*,
         v.placa, v.marca, v.modelo, v.ano_modelo, v.cor, v.tipo AS veiculo_tipo,
         v.fipe_valor, v.fipe_mes_referencia, v.quilometragem,
         c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
         m.nome AS mecanico_nome,
         (SELECT COALESCE(SUM(quantidade * valor_unitario), 0) FROM itens_orcamento i WHERE i.ordem_id = o.id) AS total,
         (SELECT COALESCE(SUM(quantidade * valor_unitario), 0) FROM itens_orcamento i WHERE i.ordem_id = o.id AND i.aprovado = 1) AS total_aprovado,
         (SELECT COUNT(*) FROM itens_orcamento i WHERE i.ordem_id = o.id) AS qtd_itens,
         (SELECT COUNT(*) FROM fotos f WHERE f.ordem_id = o.id) AS qtd_fotos,
         (SELECT COUNT(*) FROM avarias a WHERE a.ordem_id = o.id) AS qtd_avarias,
         v.carroceria, v.ano_fabricacao, v.combustivel
    FROM ordens_servico o
    JOIN veiculos v ON v.id = o.veiculo_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN usuarios m ON m.id = o.mecanico_id`;

/** Etapa que resume a OS (coluna do quadro e destaque na página do cliente). */
function etapaAtual(o, etapas) {
  if (o.situacao === 'finalizada') return 'entregue';
  if (o.situacao === 'recusada') return 'recusada';
  const ativa = etapas.find((e) => e.status === 'em_andamento');
  if (ativa) return ativa.tipo === 'entregue' ? 'pronto' : ativa.tipo;
  const st = Object.fromEntries(etapas.map((e) => [e.tipo, e.status]));
  if (st.aprovacao === 'concluida' && st.execucao === 'pendente') return 'aprovado';
  return [...etapas].reverse().find((e) => e.status === 'concluida')?.tipo || 'recebido';
}

const etapasDe = db.prepare('SELECT * FROM etapas WHERE ordem_id = ? ORDER BY sequencia');

function montar(o) {
  const etapas = etapasDe.all(o.id);
  return { ...o, aguardando_peca: Boolean(o.aguardando_peca), etapas, etapa_atual: etapaAtual(o, etapas) };
}

function podeVer(o, u) {
  if (!u) return false;
  if (u.papel === 'admin') return true;
  if (u.papel === 'mecanico') return o.mecanico_id == null || o.mecanico_id === u.id;
  return u.cliente_id === o.cliente_id;
}

function buscar(id, usuario) {
  const o = db.prepare(`${SQL_BASE} WHERE o.id = ?`).get(id);
  if (!o) throw naoEncontrado('Ordem de serviço');
  if (usuario && !podeVer(o, usuario)) throw proibido('Esta OS não está atribuída a você.');
  return montar(o);
}

function exigirAberta(o) {
  if (o.situacao !== 'aberta') throw conflito('Esta ordem de serviço já foi encerrada.');
}
function exigirEtapa(o, ...permitidas) {
  if (!permitidas.includes(o.etapa_atual)) throw conflito(`Ação indisponível na etapa atual (${o.etapa_atual}).`);
}

function mudarEtapa(ordemId, tipo, status, { observacao, responsavelId } = {}) {
  const tempo = { em_andamento: ", iniciada_em = datetime('now')", concluida: ", concluida_em = datetime('now')", recusada: ", concluida_em = datetime('now')", pendente: ', iniciada_em = NULL, concluida_em = NULL' };
  db.prepare(
    `UPDATE etapas SET status = ?, observacao = COALESCE(?, observacao), responsavel_id = COALESCE(?, responsavel_id) ${tempo[status] || ''}
      WHERE ordem_id = ? AND tipo = ?`
  ).run(status, observacao ?? null, responsavelId ?? null, ordemId, tipo);
  tocar(ordemId);
  return db.prepare('SELECT * FROM etapas WHERE ordem_id = ? AND tipo = ?').get(ordemId, tipo);
}
const tocar = (id) => db.prepare("UPDATE ordens_servico SET atualizado_em = datetime('now') WHERE id = ?").run(id);

// ---------------------------------------------------------------- consultas
function listar(usuario, { etapa, busca, cliente_id } = {}) {
  const where = [];
  const params = [];
  if (usuario.papel === 'mecanico') { where.push('(o.mecanico_id IS NULL OR o.mecanico_id = ?)'); params.push(usuario.id); }
  if (usuario.papel === 'cliente') { where.push('c.id = ?'); params.push(usuario.cliente_id); }
  if (cliente_id) { where.push('c.id = ?'); params.push(cliente_id); }
  if (busca) {
    where.push('(v.placa LIKE ? OR c.nome LIKE ? OR v.modelo LIKE ? OR CAST(o.id AS TEXT) = ?)');
    const b = `%${busca}%`;
    params.push(b.toUpperCase().replace(/[^A-Z0-9%]/g, '') || b, b, b, busca);
  }
  const lista = db
    .prepare(`${SQL_BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.atualizado_em DESC, o.id DESC`)
    .all(...params)
    .map(montar);
  return etapa ? lista.filter((o) => o.etapa_atual === etapa) : lista;
}

function detalhe(id, usuario) {
  const o = buscar(id, usuario);
  return {
    ...o,
    link_acompanhamento: linkAcompanhamento(o.codigo_publico),
    itens: db.prepare('SELECT * FROM itens_orcamento WHERE ordem_id = ? ORDER BY tipo DESC, id').all(id),
    fotos: db.prepare('SELECT f.*, u.nome AS enviada_por_nome FROM fotos f LEFT JOIN usuarios u ON u.id = f.enviada_por WHERE ordem_id = ? ORDER BY id').all(id),
    mensagens: db.prepare('SELECT * FROM mensagens WHERE ordem_id = ? ORDER BY id DESC').all(id),
    avarias: require('./avarias').listar(id), // require tardio: avarias.js depende deste módulo
  };
}

// ---------------------------------------------------------------- transições
const criar = db.transaction((dados, usuario) => {
  const { veiculo_id, problema_relatado, km_entrada, previsao_entrega } = dados;
  let { mecanico_id } = dados;
  if (!veiculo_id) throw requisicaoInvalida('Selecione o veículo.');
  if (!problema_relatado?.trim()) throw requisicaoInvalida('Descreva o problema relatado pelo cliente.');
  const veiculo = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(veiculo_id);
  if (!veiculo) throw naoEncontrado('Veículo');
  const aberta = db.prepare("SELECT id FROM ordens_servico WHERE veiculo_id = ? AND situacao = 'aberta'").get(veiculo_id);
  if (aberta) throw conflito(`Este veículo já tem a OS nº ${aberta.id} em aberto.`);
  if (usuario.papel === 'mecanico') mecanico_id = usuario.id;
  if (mecanico_id) {
    const m = db.prepare("SELECT id FROM usuarios WHERE id = ? AND papel IN ('mecanico','admin') AND ativo = 1").get(mecanico_id);
    if (!m) throw requisicaoInvalida('Mecânico inválido.');
  }
  const km = km_entrada === '' || km_entrada == null ? null : parseInt(km_entrada, 10);

  const { lastInsertRowid: id } = db.prepare(
    `INSERT INTO ordens_servico (veiculo_id, mecanico_id, codigo_publico, problema_relatado, km_entrada, previsao_entrega)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(veiculo_id, mecanico_id || null, crypto.randomBytes(8).toString('base64url'), problema_relatado.trim(), km, previsao_entrega || null);
  if (km) db.prepare('UPDATE veiculos SET quilometragem = ? WHERE id = ?').run(km, veiculo_id);

  const ins = db.prepare('INSERT INTO etapas (ordem_id, tipo, sequencia) VALUES (?, ?, ?)');
  ETAPAS.forEach((t, i) => ins.run(id, t, i + 1));
  mudarEtapa(id, 'recebido', 'em_andamento', { responsavelId: usuario.id });
  const e = mudarEtapa(id, 'recebido', 'concluida');
  mudarEtapa(id, 'diagnostico', 'em_andamento');

  // Cliente com e-mail ganha uma conta; o primeiro aviso leva o link para criar a senha.
  const conta = auth.garantirContaCliente(veiculo.cliente_id);
  const conviteLink = conta && !conta.senha_hash ? auth.gerarConvite(conta.id) : undefined;
  notificar(id, 'recebido', e.id, { conviteLink });
  return id;
});

const registrarDiagnostico = db.transaction((id, { diagnostico }, usuario) => {
  const o = buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'diagnostico');
  if (!diagnostico?.trim()) throw requisicaoInvalida('Descreva o diagnóstico.');
  db.prepare('UPDATE ordens_servico SET diagnostico = ? WHERE id = ?').run(diagnostico.trim(), id);
  if (!o.mecanico_id && usuario.papel === 'mecanico')
    db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(usuario.id, id);
  const e = mudarEtapa(id, 'diagnostico', 'concluida', { responsavelId: usuario.id });
  mudarEtapa(id, 'orcamento', 'em_andamento');
  notificar(id, 'diagnostico', e.id);
});

function validarItem({ tipo, descricao, quantidade, valor_unitario }) {
  if (!['peca', 'servico'].includes(tipo)) throw requisicaoInvalida('Tipo do item deve ser peça ou serviço.');
  if (!descricao?.trim()) throw requisicaoInvalida('Descreva o item.');
  const q = Number(quantidade);
  const v = Number(valor_unitario);
  if (!(q > 0)) throw requisicaoInvalida('Quantidade deve ser maior que zero.');
  if (!(v >= 0) || !Number.isFinite(v)) throw requisicaoInvalida('Valor unitário inválido.');
  return { tipo, descricao: descricao.trim(), quantidade: q, valor_unitario: Math.round(v * 100) / 100 };
}

/** Alterar itens durante a aprovação devolve a OS para a etapa de orçamento (precisa reenviar). */
function abrirEdicaoOrcamento(o) {
  exigirAberta(o);
  exigirEtapa(o, 'orcamento', 'aprovacao');
  if (o.etapa_atual === 'aprovacao') {
    mudarEtapa(o.id, 'aprovacao', 'pendente');
    mudarEtapa(o.id, 'orcamento', 'em_andamento');
  }
}

const adicionarItem = db.transaction((id, item, usuario) => {
  const o = buscar(id, usuario);
  abrirEdicaoOrcamento(o);
  const d = validarItem(item);
  db.prepare('INSERT INTO itens_orcamento (ordem_id, tipo, descricao, quantidade, valor_unitario, avaria_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, d.tipo, d.descricao, d.quantidade, d.valor_unitario, item.avaria_id || null);
  tocar(id);
});

const editarItem = db.transaction((id, itemId, item, usuario) => {
  const o = buscar(id, usuario);
  abrirEdicaoOrcamento(o);
  const d = validarItem(item);
  const r = db.prepare('UPDATE itens_orcamento SET tipo = ?, descricao = ?, quantidade = ?, valor_unitario = ?, aprovado = NULL WHERE id = ? AND ordem_id = ?')
    .run(d.tipo, d.descricao, d.quantidade, d.valor_unitario, itemId, id);
  if (!r.changes) throw naoEncontrado('Item');
  tocar(id);
});

const removerItem = db.transaction((id, itemId, usuario) => {
  const o = buscar(id, usuario);
  abrirEdicaoOrcamento(o);
  const r = db.prepare('DELETE FROM itens_orcamento WHERE id = ? AND ordem_id = ?').run(itemId, id);
  if (!r.changes) throw naoEncontrado('Item');
  tocar(id);
});

const enviarOrcamento = db.transaction((id, { previsao_entrega } = {}, usuario) => {
  const o = buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'orcamento');
  if (!o.qtd_itens) throw requisicaoInvalida('Adicione pelo menos uma peça ou serviço ao orçamento.');
  if (previsao_entrega) db.prepare('UPDATE ordens_servico SET previsao_entrega = ? WHERE id = ?').run(previsao_entrega, id);
  db.prepare('UPDATE itens_orcamento SET aprovado = NULL WHERE ordem_id = ?').run(id);
  mudarEtapa(id, 'orcamento', 'concluida', { responsavelId: usuario.id });
  const e = mudarEtapa(id, 'aprovacao', 'em_andamento');
  notificar(id, 'orcamento', e.id);
});

/**
 * Resposta ao orçamento. `itens` = { [itemId]: true|false }; itens não informados contam como recusados.
 * origem: 'cliente' (portal/link) ou 'oficina' (cliente respondeu por telefone/balcão).
 */
const responderOrcamento = db.transaction((id, { itens = {}, observacao, origem }, usuario) => {
  const o = buscar(id, origem === 'cliente' ? null : usuario);
  exigirAberta(o);
  exigirEtapa(o, 'aprovacao');
  const lista = db.prepare('SELECT * FROM itens_orcamento WHERE ordem_id = ?').all(id);
  const upd = db.prepare('UPDATE itens_orcamento SET aprovado = ? WHERE id = ?');
  let aprovados = 0;
  let total = 0;
  for (const it of lista) {
    const ok = itens[it.id] === true || itens[String(it.id)] === true;
    upd.run(ok ? 1 : 0, it.id);
    if (ok) { aprovados++; total += it.quantidade * it.valor_unitario; }
  }

  const quem = origem === 'cliente' ? 'pelo cliente' : `pela oficina (${usuario?.nome || 'atendente'})`;
  const resumo = aprovados === 0
    ? `Orçamento recusado ${quem}`
    : `${aprovados} de ${lista.length} itens aprovados ${quem} — ${moeda(total)}`;
  const obs = observacao?.trim() ? `${resumo}. Obs.: ${observacao.trim()}` : resumo;
  const etapa = db.prepare("SELECT id FROM etapas WHERE ordem_id = ? AND tipo = 'aprovacao'").get(id);
  if (origem === 'cliente') registrarEntrada(id, etapa.id, obs);

  if (aprovados > 0) {
    mudarEtapa(id, 'aprovacao', 'concluida', { observacao: obs, responsavelId: usuario?.id });
    notificar(id, 'aprovado', etapa.id);
  } else {
    mudarEtapa(id, 'aprovacao', 'recusada', { observacao: obs, responsavelId: usuario?.id });
    db.prepare("UPDATE ordens_servico SET situacao = 'recusada' WHERE id = ?").run(id);
    mudarEtapa(id, 'entregue', 'em_andamento');
    notificar(id, 'recusado', etapa.id);
  }
});

const iniciarExecucao = db.transaction((id, { previsao_entrega } = {}, usuario) => {
  const o = buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'aprovado');
  if (previsao_entrega) db.prepare('UPDATE ordens_servico SET previsao_entrega = ? WHERE id = ?').run(previsao_entrega, id);
  if (!o.mecanico_id && usuario.papel === 'mecanico') db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(usuario.id, id);
  const e = mudarEtapa(id, 'execucao', 'em_andamento', { responsavelId: usuario.id });
  notificar(id, 'execucao', e.id);
});

const definirAguardandoPeca = db.transaction((id, { aguardando, observacao }, usuario) => {
  const o = buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'execucao');
  if (Boolean(aguardando) === o.aguardando_peca) return;
  db.prepare('UPDATE ordens_servico SET aguardando_peca = ? WHERE id = ?').run(aguardando ? 1 : 0, id);
  const e = mudarEtapa(id, 'execucao', 'em_andamento', { observacao: aguardando ? `Aguardando peça${observacao ? `: ${observacao}` : ''}` : 'Serviço retomado' });
  notificar(id, aguardando ? 'aguardando_peca' : 'retomado', e.id);
});

const concluirExecucao = db.transaction((id, { observacao } = {}, usuario) => {
  const o = buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'execucao');
  db.prepare('UPDATE ordens_servico SET aguardando_peca = 0 WHERE id = ?').run(id);
  mudarEtapa(id, 'execucao', 'concluida', { observacao: observacao || 'Serviço concluído', responsavelId: usuario.id });
  const e = mudarEtapa(id, 'pronto', 'concluida', { responsavelId: usuario.id });
  mudarEtapa(id, 'entregue', 'em_andamento');
  notificar(id, 'pronto', e.id);
});

const registrarEntrega = db.transaction((id, usuario) => {
  const o = buscar(id, usuario);
  if (o.situacao === 'finalizada') throw conflito('A entrega já foi registrada.');
  if (!(o.etapa_atual === 'pronto' || o.situacao === 'recusada'))
    throw conflito('O veículo só pode ser entregue quando estiver pronto ou com o orçamento recusado.');
  const e = mudarEtapa(id, 'entregue', 'concluida', { responsavelId: usuario.id });
  db.prepare("UPDATE ordens_servico SET situacao = 'finalizada', entregue_em = datetime('now') WHERE id = ?").run(id);
  notificar(id, 'entregue', e.id);
});

const atribuir = db.transaction((id, { mecanico_id }, usuario) => {
  const o = buscar(id, usuario);
  if (usuario.papel === 'mecanico') {
    if (o.mecanico_id && o.mecanico_id !== usuario.id) throw proibido();
    mecanico_id = usuario.id; // mecânico só pode assumir para si
  }
  if (mecanico_id) {
    const m = db.prepare("SELECT id FROM usuarios WHERE id = ? AND papel IN ('mecanico','admin') AND ativo = 1").get(mecanico_id);
    if (!m) throw requisicaoInvalida('Mecânico inválido.');
  }
  db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(mecanico_id || null, id);
  tocar(id);
});

function adicionarFoto(id, { arquivo, legenda, momento }, usuario) {
  buscar(id, usuario);
  db.prepare('INSERT INTO fotos (ordem_id, arquivo, legenda, momento, enviada_por) VALUES (?, ?, ?, ?, ?)')
    .run(id, arquivo, legenda?.trim() || null, ['entrada', 'diagnostico', 'execucao', 'entrega'].includes(momento) ? momento : 'entrada', usuario.id);
  tocar(id);
}

// ---------------------------------------------------------------- visão do cliente
/** Dados que o cliente pode ver (sem telefone, mensagens internas ou dados de outros clientes). */
function visaoCliente(o) {
  const d = detalhe(o.id);
  const oculto = ['recebido', 'diagnostico', 'orcamento'].includes(d.etapa_atual);
  return {
    id: d.id,
    codigo_publico: d.codigo_publico,
    situacao: d.situacao,
    etapa_atual: d.etapa_atual,
    aguardando_peca: d.aguardando_peca,
    problema_relatado: d.problema_relatado,
    diagnostico: d.diagnostico,
    previsao_entrega: d.previsao_entrega,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em,
    entregue_em: d.entregue_em,
    mecanico_nome: d.mecanico_nome,
    cliente_primeiro_nome: d.cliente_nome.split(' ')[0],
    veiculo: { placa: d.placa, marca: d.marca, modelo: d.modelo, ano_modelo: d.ano_modelo, cor: d.cor, carroceria: d.carroceria },
    itens: oculto ? [] : d.itens.map(({ id, tipo, descricao, quantidade, valor_unitario, aprovado }) => ({ id, tipo, descricao, quantidade, valor_unitario, aprovado })),
    total: oculto ? null : d.total,
    total_aprovado: d.total_aprovado,
    avarias: require('./avarias').visaoCliente(d.id, !oculto),
    fotos: d.fotos.map(({ id, arquivo, legenda, momento, criado_em }) => ({ id, arquivo, legenda, momento, criado_em })),
    etapas: d.etapas.map(({ tipo, status, observacao, iniciada_em, concluida_em }) => ({ tipo, status, observacao, iniciada_em, concluida_em })),
  };
}

function porCodigo(codigo) {
  const o = db.prepare('SELECT id FROM ordens_servico WHERE codigo_publico = ?').get(codigo);
  if (!o) throw naoEncontrado('Ordem de serviço');
  return o;
}

module.exports = {
  ETAPAS, listar, detalhe, buscar, criar, registrarDiagnostico, adicionarItem, editarItem, removerItem,
  enviarOrcamento, responderOrcamento, iniciarExecucao, definirAguardandoPeca, concluirExecucao,
  registrarEntrega, atribuir, adicionarFoto, visaoCliente, porCodigo,
};
