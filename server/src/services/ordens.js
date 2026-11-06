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

const montar = (o, etapas) => ({ ...o, aguardando_peca: Boolean(o.aguardando_peca), etapas, etapa_atual: etapaAtual(o, etapas) });

function podeVer(o, u) {
  if (!u) return false;
  if (u.papel === 'admin') return true;
  if (u.papel === 'mecanico') return o.mecanico_id == null || o.mecanico_id === u.id;
  return u.cliente_id === o.cliente_id;
}

async function buscar(id, usuario) {
  const o = await db.prepare(`${SQL_BASE} WHERE o.id = ?`).get(id);
  if (!o) throw naoEncontrado('Ordem de serviço');
  if (usuario && !podeVer(o, usuario)) throw proibido('Esta OS não está atribuída a você.');
  return montar(o, await db.prepare('SELECT * FROM etapas WHERE ordem_id = ? ORDER BY sequencia').all(o.id));
}

function exigirAberta(o) {
  if (o.situacao !== 'aberta') throw conflito('Esta ordem de serviço já foi encerrada.');
}
function exigirEtapa(o, ...permitidas) {
  if (!permitidas.includes(o.etapa_atual)) throw conflito(`Ação indisponível na etapa atual (${o.etapa_atual}).`);
}

const tocar = (id) => db.prepare('UPDATE ordens_servico SET atualizado_em = now() WHERE id = ?').run(id);

async function mudarEtapa(ordemId, tipo, status, { observacao, responsavelId } = {}) {
  const tempo = { em_andamento: ', iniciada_em = now()', concluida: ', concluida_em = now()', recusada: ', concluida_em = now()', pendente: ', iniciada_em = NULL, concluida_em = NULL' };
  await db.prepare(
    `UPDATE etapas SET status = ?, observacao = COALESCE(?, observacao), responsavel_id = COALESCE(?, responsavel_id) ${tempo[status] || ''}
      WHERE ordem_id = ? AND tipo = ?`
  ).run(status, observacao ?? null, responsavelId ?? null, ordemId, tipo);
  await tocar(ordemId);
  return db.prepare('SELECT * FROM etapas WHERE ordem_id = ? AND tipo = ?').get(ordemId, tipo);
}

// ---------------------------------------------------------------- consultas
async function listar(usuario, { etapa, busca, cliente_id } = {}) {
  const where = [];
  const params = [];
  if (usuario.papel === 'mecanico') { where.push('(o.mecanico_id IS NULL OR o.mecanico_id = ?)'); params.push(usuario.id); }
  if (usuario.papel === 'cliente') { where.push('c.id = ?'); params.push(usuario.cliente_id); }
  if (cliente_id) { where.push('c.id = ?'); params.push(cliente_id); }
  if (busca) {
    where.push('(v.placa ILIKE ? OR c.nome ILIKE ? OR v.modelo ILIKE ? OR CAST(o.id AS TEXT) = ?)');
    const b = `%${busca}%`;
    params.push(b.toUpperCase().replace(/[^A-Z0-9%]/g, '') || b, b, b, busca);
  }
  const linhas = await db
    .prepare(`${SQL_BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.atualizado_em DESC, o.id DESC`)
    .all(...params);
  const etapas = await db.prepare('SELECT * FROM etapas WHERE ordem_id = ANY(?) ORDER BY sequencia').all(linhas.map((o) => o.id));
  const lista = linhas.map((o) => montar(o, etapas.filter((e) => e.ordem_id === o.id)));
  return etapa ? lista.filter((o) => o.etapa_atual === etapa) : lista;
}

async function detalhe(id, usuario) {
  const o = await buscar(id, usuario);
  return {
    ...o,
    link_acompanhamento: linkAcompanhamento(o.codigo_publico),
    itens: await db.prepare('SELECT * FROM itens_orcamento WHERE ordem_id = ? ORDER BY tipo DESC, id').all(o.id),
    fotos: await db.prepare('SELECT f.*, u.nome AS enviada_por_nome FROM fotos f LEFT JOIN usuarios u ON u.id = f.enviada_por WHERE f.ordem_id = ? ORDER BY f.id').all(o.id),
    mensagens: await db.prepare('SELECT * FROM historico_mensagens WHERE ordem_id = ? ORDER BY criada_em DESC, id DESC').all(o.id),
    avarias: await require('./avarias').listar(o.id), // require tardio: avarias.js depende deste módulo
  };
}

// ---------------------------------------------------------------- transições
const criar = db.transaction(async (dados, usuario) => {
  const { veiculo_id, problema_relatado, km_entrada, previsao_entrega } = dados;
  let { mecanico_id } = dados;
  if (!veiculo_id) throw requisicaoInvalida('Selecione o veículo.');
  if (!problema_relatado?.trim()) throw requisicaoInvalida('Descreva o problema relatado pelo cliente.');
  const veiculo = await db.prepare('SELECT * FROM veiculos WHERE id = ?').get(veiculo_id);
  if (!veiculo) throw naoEncontrado('Veículo');
  const aberta = await db.prepare("SELECT id FROM ordens_servico WHERE veiculo_id = ? AND situacao = 'aberta'").get(veiculo_id);
  if (aberta) throw conflito(`Este veículo já tem a OS nº ${aberta.id} em aberto.`);
  if (usuario.papel === 'mecanico') mecanico_id = usuario.id;
  if (mecanico_id) {
    const m = await db.prepare("SELECT id FROM usuarios WHERE id = ? AND papel IN ('mecanico','admin') AND ativo = 1").get(mecanico_id);
    if (!m) throw requisicaoInvalida('Mecânico inválido.');
  }
  const km = km_entrada === '' || km_entrada == null ? null : parseInt(km_entrada, 10);

  const { lastInsertRowid: id } = await db.prepare(
    `INSERT INTO ordens_servico (veiculo_id, mecanico_id, codigo_publico, problema_relatado, km_entrada, previsao_entrega)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(veiculo_id, mecanico_id || null, crypto.randomBytes(8).toString('base64url'), problema_relatado.trim(), km, previsao_entrega || null);
  if (km) await db.prepare('UPDATE veiculos SET quilometragem = ? WHERE id = ?').run(km, veiculo_id);

  const ins = db.prepare('INSERT INTO etapas (ordem_id, tipo, sequencia) VALUES (?, ?, ?)');
  for (const [i, t] of ETAPAS.entries()) await ins.run(id, t, i + 1);
  await mudarEtapa(id, 'recebido', 'em_andamento', { responsavelId: usuario.id });
  const e = await mudarEtapa(id, 'recebido', 'concluida');
  await mudarEtapa(id, 'diagnostico', 'em_andamento');

  // Cliente com e-mail ganha uma conta; o primeiro aviso leva o link para criar a senha.
  const conta = await auth.garantirContaCliente(veiculo.cliente_id);
  const conviteLink = conta && !conta.senha_hash ? await auth.gerarConvite(conta.id) : undefined;
  await notificar(id, 'recebido', e.id, { conviteLink });
  return id;
});

const registrarDiagnostico = db.transaction(async (id, { diagnostico }, usuario) => {
  const o = await buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'diagnostico');
  if (!diagnostico?.trim()) throw requisicaoInvalida('Descreva o diagnóstico.');
  await db.prepare('UPDATE ordens_servico SET diagnostico = ? WHERE id = ?').run(diagnostico.trim(), id);
  if (!o.mecanico_id && usuario.papel === 'mecanico')
    await db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(usuario.id, id);
  const e = await mudarEtapa(id, 'diagnostico', 'concluida', { responsavelId: usuario.id });
  await mudarEtapa(id, 'orcamento', 'em_andamento');
  await notificar(id, 'diagnostico', e.id);
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
async function abrirEdicaoOrcamento(o) {
  exigirAberta(o);
  exigirEtapa(o, 'orcamento', 'aprovacao');
  if (o.etapa_atual === 'aprovacao') {
    await mudarEtapa(o.id, 'aprovacao', 'pendente');
    await mudarEtapa(o.id, 'orcamento', 'em_andamento');
  }
}

const adicionarItem = db.transaction(async (id, item, usuario) => {
  const o = await buscar(id, usuario);
  await abrirEdicaoOrcamento(o);
  const d = validarItem(item);
  await db.prepare('INSERT INTO itens_orcamento (ordem_id, tipo, descricao, quantidade, valor_unitario, avaria_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, d.tipo, d.descricao, d.quantidade, d.valor_unitario, item.avaria_id || null);
  await tocar(id);
});

const editarItem = db.transaction(async (id, itemId, item, usuario) => {
  const o = await buscar(id, usuario);
  await abrirEdicaoOrcamento(o);
  const d = validarItem(item);
  const r = await db.prepare('UPDATE itens_orcamento SET tipo = ?, descricao = ?, quantidade = ?, valor_unitario = ?, aprovado = NULL WHERE id = ? AND ordem_id = ?')
    .run(d.tipo, d.descricao, d.quantidade, d.valor_unitario, itemId, id);
  if (!r.changes) throw naoEncontrado('Item');
  await tocar(id);
});

const removerItem = db.transaction(async (id, itemId, usuario) => {
  const o = await buscar(id, usuario);
  await abrirEdicaoOrcamento(o);
  const r = await db.prepare('DELETE FROM itens_orcamento WHERE id = ? AND ordem_id = ?').run(itemId, id);
  if (!r.changes) throw naoEncontrado('Item');
  await tocar(id);
});

const enviarOrcamento = db.transaction(async (id, { previsao_entrega } = {}, usuario) => {
  const o = await buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'orcamento');
  if (!o.qtd_itens) throw requisicaoInvalida('Adicione pelo menos uma peça ou serviço ao orçamento.');
  if (previsao_entrega) await db.prepare('UPDATE ordens_servico SET previsao_entrega = ? WHERE id = ?').run(previsao_entrega, id);
  await db.prepare('UPDATE itens_orcamento SET aprovado = NULL WHERE ordem_id = ?').run(id);
  await mudarEtapa(id, 'orcamento', 'concluida', { responsavelId: usuario.id });
  const e = await mudarEtapa(id, 'aprovacao', 'em_andamento');
  await notificar(id, 'orcamento', e.id);
});

/**
 * Resposta ao orçamento. `itens` = { [itemId]: true|false }; itens não informados contam como recusados.
 * origem: 'cliente' (portal/link) ou 'oficina' (cliente respondeu por telefone/balcão).
 */
const responderOrcamento = db.transaction(async (id, { itens = {}, observacao, origem }, usuario) => {
  const o = await buscar(id, origem === 'cliente' ? null : usuario);
  exigirAberta(o);
  exigirEtapa(o, 'aprovacao');
  const lista = await db.prepare('SELECT * FROM itens_orcamento WHERE ordem_id = ?').all(id);
  const upd = db.prepare('UPDATE itens_orcamento SET aprovado = ? WHERE id = ?');
  let aprovados = 0;
  let total = 0;
  for (const it of lista) {
    const ok = itens[it.id] === true || itens[String(it.id)] === true;
    await upd.run(ok ? 1 : 0, it.id);
    if (ok) { aprovados++; total += it.quantidade * it.valor_unitario; }
  }

  const quem = origem === 'cliente' ? 'pelo cliente' : `pela oficina (${usuario?.nome || 'atendente'})`;
  const resumo = aprovados === 0
    ? `Orçamento recusado ${quem}`
    : `${aprovados} de ${lista.length} itens aprovados ${quem} — ${moeda(total)}`;
  const obs = observacao?.trim() ? `${resumo}. Obs.: ${observacao.trim()}` : resumo;
  const etapa = await db.prepare("SELECT id FROM etapas WHERE ordem_id = ? AND tipo = 'aprovacao'").get(id);
  if (origem === 'cliente') await registrarEntrada(id, etapa.id, obs);

  if (aprovados > 0) {
    await mudarEtapa(id, 'aprovacao', 'concluida', { observacao: obs, responsavelId: usuario?.id });
    await notificar(id, 'aprovado', etapa.id);
  } else {
    await mudarEtapa(id, 'aprovacao', 'recusada', { observacao: obs, responsavelId: usuario?.id });
    await db.prepare("UPDATE ordens_servico SET situacao = 'recusada' WHERE id = ?").run(id);
    await mudarEtapa(id, 'entregue', 'em_andamento');
    await notificar(id, 'recusado', etapa.id);
  }
});

const iniciarExecucao = db.transaction(async (id, { previsao_entrega } = {}, usuario) => {
  const o = await buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'aprovado');
  if (previsao_entrega) await db.prepare('UPDATE ordens_servico SET previsao_entrega = ? WHERE id = ?').run(previsao_entrega, id);
  if (!o.mecanico_id && usuario.papel === 'mecanico') await db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(usuario.id, id);
  const e = await mudarEtapa(id, 'execucao', 'em_andamento', { responsavelId: usuario.id });
  await notificar(id, 'execucao', e.id);
});

const definirAguardandoPeca = db.transaction(async (id, { aguardando, observacao }, usuario) => {
  const o = await buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'execucao');
  if (Boolean(aguardando) === o.aguardando_peca) return;
  await db.prepare('UPDATE ordens_servico SET aguardando_peca = ? WHERE id = ?').run(aguardando ? 1 : 0, id);
  const e = await mudarEtapa(id, 'execucao', 'em_andamento', { observacao: aguardando ? `Aguardando peça${observacao ? `: ${observacao}` : ''}` : 'Serviço retomado' });
  await notificar(id, aguardando ? 'aguardando_peca' : 'retomado', e.id);
});

const concluirExecucao = db.transaction(async (id, { observacao } = {}, usuario) => {
  const o = await buscar(id, usuario);
  exigirAberta(o);
  exigirEtapa(o, 'execucao');
  await db.prepare('UPDATE ordens_servico SET aguardando_peca = 0 WHERE id = ?').run(id);
  await mudarEtapa(id, 'execucao', 'concluida', { observacao: observacao || 'Serviço concluído', responsavelId: usuario.id });
  const e = await mudarEtapa(id, 'pronto', 'concluida', { responsavelId: usuario.id });
  await mudarEtapa(id, 'entregue', 'em_andamento');
  await notificar(id, 'pronto', e.id);
});

const registrarEntrega = db.transaction(async (id, usuario) => {
  const o = await buscar(id, usuario);
  if (o.situacao === 'finalizada') throw conflito('A entrega já foi registrada.');
  if (!(o.etapa_atual === 'pronto' || o.situacao === 'recusada'))
    throw conflito('O veículo só pode ser entregue quando estiver pronto ou com o orçamento recusado.');
  const e = await mudarEtapa(id, 'entregue', 'concluida', { responsavelId: usuario.id });
  await db.prepare("UPDATE ordens_servico SET situacao = 'finalizada', entregue_em = now() WHERE id = ?").run(id);
  await notificar(id, 'entregue', e.id);
});

const atribuir = db.transaction(async (id, { mecanico_id }, usuario) => {
  const o = await buscar(id, usuario);
  if (usuario.papel === 'mecanico') {
    if (o.mecanico_id && o.mecanico_id !== usuario.id) throw proibido();
    mecanico_id = usuario.id; // mecânico só pode assumir para si
  }
  if (mecanico_id) {
    const m = await db.prepare("SELECT id FROM usuarios WHERE id = ? AND papel IN ('mecanico','admin') AND ativo = 1").get(mecanico_id);
    if (!m) throw requisicaoInvalida('Mecânico inválido.');
  }
  await db.prepare('UPDATE ordens_servico SET mecanico_id = ? WHERE id = ?').run(mecanico_id || null, id);
  await tocar(id);
});

async function adicionarFoto(id, { arquivo, legenda, momento }, usuario) {
  await buscar(id, usuario);
  await db.prepare('INSERT INTO fotos (ordem_id, arquivo, legenda, momento, enviada_por) VALUES (?, ?, ?, ?, ?)')
    .run(id, arquivo, legenda?.trim() || null, ['entrada', 'diagnostico', 'execucao', 'entrega'].includes(momento) ? momento : 'entrada', usuario.id);
  await tocar(id);
}

// ---------------------------------------------------------------- visão do cliente
/** Dados que o cliente pode ver (sem telefone, mensagens internas ou dados de outros clientes). */
async function visaoCliente(o) {
  const d = await detalhe(o.id);
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
    avarias: await require('./avarias').visaoCliente(d.id, !oculto),
    fotos: d.fotos.map(({ id, arquivo, legenda, momento, criado_em }) => ({ id, arquivo, legenda, momento, criado_em })),
    etapas: d.etapas.map(({ tipo, status, observacao, iniciada_em, concluida_em }) => ({ tipo, status, observacao, iniciada_em, concluida_em })),
  };
}

async function porCodigo(codigo) {
  const o = await db.prepare('SELECT id FROM ordens_servico WHERE codigo_publico = ?').get(codigo);
  if (!o) throw naoEncontrado('Ordem de serviço');
  return o;
}

module.exports = {
  ETAPAS, listar, detalhe, buscar, criar, registrarDiagnostico, adicionarItem, editarItem, removerItem,
  enviarOrcamento, responderOrcamento, iniciarExecucao, definirAguardandoPeca, concluirExecucao,
  registrarEntrega, atribuir, adicionarFoto, visaoCliente, porCodigo,
};
