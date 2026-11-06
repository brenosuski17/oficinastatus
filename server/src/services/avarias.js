// Vistoria 3D: avarias marcadas no carro e geração do orçamento a partir delas.
const db = require('../db');
const ordens = require('./ordens');
const catalogo = require('./catalogo');
const { requisicaoInvalida, conflito, naoEncontrado } = require('../errors');

const NOMES_TIPO = { amassado: 'Amassado', risco: 'Risco', trinca: 'Trinca', quebra: 'Quebra', corrosao: 'Corrosão', pintura: 'Pintura danificada', servico: 'Serviço sem avaria' };
const ETAPAS_EDITAVEIS = ['recebido', 'diagnostico', 'orcamento', 'aprovacao'];

async function listar(ordemId) {
  const avarias = await db.prepare('SELECT * FROM avarias WHERE ordem_id = ? ORDER BY numero').all(ordemId);
  const servs = await db.prepare('SELECT * FROM avaria_servicos WHERE avaria_id = ANY(?) ORDER BY id').all(avarias.map((a) => a.id));
  return avarias.map((a) => {
    const servicos = servs.filter((s) => s.avaria_id === a.id);
    return {
      ...a,
      orcada: Boolean(a.orcada),
      zona_nome: catalogo.zonaInfo(a.zona)?.nome || a.zona,
      tipo_nome: NOMES_TIPO[a.tipo],
      servicos,
      valor: servicos.reduce((s, x) => s + x.valor, 0),
      minutos: servicos.reduce((s, x) => s + x.minutos, 0),
    };
  });
}

function exigirEditavel(o) {
  if (o.situacao !== 'aberta' || !ETAPAS_EDITAVEIS.includes(o.etapa_atual))
    throw conflito('As avarias só podem ser alteradas até a aprovação do orçamento.');
}

async function validar(d) {
  if (!catalogo.zonaInfo(d.zona)) throw requisicaoInvalida('Peça do veículo inválida.');
  if (!catalogo.TIPOS.includes(d.tipo)) throw requisicaoInvalida('Escolha o tipo de avaria.');
  if (d.tipo === 'servico') d.gravidade = 'leve'; // serviço sem avaria não tem gravidade
  if (!catalogo.GRAVIDADES.includes(d.gravidade)) throw requisicaoInvalida('Escolha a gravidade.');
  const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
  const pos = d.posicao || {};
  const nor = d.normal || {};
  if (![pos.x, pos.y, pos.z].every((v) => Number.isFinite(Number(v)))) throw requisicaoInvalida('Marque o ponto da avaria no carro.');
  const servicos = [];
  for (const s of d.servicos || []) {
    if (s.catalogo_id) {
      const c = await db.prepare('SELECT * FROM catalogo_servicos WHERE id = ?').get(s.catalogo_id);
      if (!c) throw requisicaoInvalida('Serviço do catálogo não encontrado.');
      // valor pode ser ajustado pela oficina; o padrão é o da tabela
      servicos.push({ catalogo_id: c.id, descricao: c.nome, valor: num(s.valor, c.valor), minutos: Math.round(num(s.minutos, c.minutos)) });
    } else {
      if (!s.descricao?.trim()) throw requisicaoInvalida('Descreva o serviço manual.');
      if (!(num(s.valor, -1) >= 0)) throw requisicaoInvalida('Valor do serviço inválido.');
      servicos.push({ catalogo_id: null, descricao: s.descricao.trim(), valor: num(s.valor, 0), minutos: Math.max(0, Math.round(num(s.minutos, 0))) });
    }
  }
  if (!servicos.length) throw requisicaoInvalida('Escolha pelo menos um serviço para a avaria.');
  return {
    zona: d.zona, tipo: d.tipo, gravidade: d.gravidade, observacao: d.observacao?.trim() || null, servicos,
    pos: [pos.x, pos.y, pos.z].map(Number), nor: [num(nor.x, 0), num(nor.y, 1), num(nor.z, 0)],
  };
}

async function gravarServicos(avariaId, servicos) {
  await db.prepare('DELETE FROM avaria_servicos WHERE avaria_id = ?').run(avariaId);
  const ins = db.prepare('INSERT INTO avaria_servicos (avaria_id, catalogo_id, descricao, valor, minutos) VALUES (?, ?, ?, ?, ?)');
  for (const s of servicos) await ins.run(avariaId, s.catalogo_id, s.descricao, s.valor, s.minutos);
}

/** Remove do orçamento os itens gerados pela avaria (volta a OS para a etapa de orçamento, se preciso). */
async function desfazerOrcamento(o, avaria) {
  if (!avaria.orcada) return;
  const itens = await db.prepare('SELECT id FROM itens_orcamento WHERE avaria_id = ?').all(avaria.id);
  for (const it of itens) await ordens.removerItem(o.id, it.id, null, { interno: true });
  await db.prepare('UPDATE avarias SET orcada = 0 WHERE id = ?').run(avaria.id);
}

const criar = db.transaction(async (ordemId, dados, usuario) => {
  const o = await ordens.buscar(ordemId, usuario);
  exigirEditavel(o);
  const d = await validar(dados);
  const numero = ((await db.prepare('SELECT MAX(numero) n FROM avarias WHERE ordem_id = ?').get(ordemId)).n || 0) + 1;
  const { lastInsertRowid: id } = await db.prepare(
    `INSERT INTO avarias (ordem_id, numero, zona, tipo, gravidade, pos_x, pos_y, pos_z, nor_x, nor_y, nor_z, observacao, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ordemId, numero, d.zona, d.tipo, d.gravidade, ...d.pos, ...d.nor, d.observacao, usuario.id);
  await gravarServicos(id, d.servicos);
  return listar(ordemId);
});

const editar = db.transaction(async (ordemId, avariaId, dados, usuario) => {
  const o = await ordens.buscar(ordemId, usuario);
  exigirEditavel(o);
  const a = await db.prepare('SELECT * FROM avarias WHERE id = ? AND ordem_id = ?').get(avariaId, ordemId);
  if (!a) throw naoEncontrado('Avaria');
  const d = await validar(dados);
  await desfazerOrcamento(o, a);
  await db.prepare(
    `UPDATE avarias SET zona = ?, tipo = ?, gravidade = ?, pos_x = ?, pos_y = ?, pos_z = ?, nor_x = ?, nor_y = ?, nor_z = ?, observacao = ? WHERE id = ?`
  ).run(d.zona, d.tipo, d.gravidade, ...d.pos, ...d.nor, d.observacao, a.id);
  await gravarServicos(a.id, d.servicos);
  return listar(ordemId);
});

const remover = db.transaction(async (ordemId, avariaId, usuario) => {
  const o = await ordens.buscar(ordemId, usuario);
  exigirEditavel(o);
  const a = await db.prepare('SELECT * FROM avarias WHERE id = ? AND ordem_id = ?').get(avariaId, ordemId);
  if (!a) throw naoEncontrado('Avaria');
  await desfazerOrcamento(o, a);
  await db.prepare('DELETE FROM avarias WHERE id = ?').run(a.id);
  return listar(ordemId);
});

/**
 * Transforma as avarias ainda não orçadas em itens do orçamento.
 * Se a OS estiver no diagnóstico, registra o diagnóstico com o resumo da vistoria e avança para o orçamento.
 */
const gerarOrcamento = db.transaction(async (ordemId, usuario) => {
  let o = await ordens.buscar(ordemId, usuario);
  const todas = await listar(ordemId);
  const pendentes = todas.filter((a) => !a.orcada);
  if (!pendentes.length) throw requisicaoInvalida('Marque ao menos uma avaria nova no carro antes de gerar o orçamento.');
  if (o.situacao !== 'aberta') throw conflito('Esta ordem de serviço já foi encerrada.');

  if (o.etapa_atual === 'diagnostico') {
    const resumo = todas.map((a) => `${a.numero}) ${a.zona_nome}: ${a.tipo === 'servico' ? 'serviço sem avaria' : `${a.tipo_nome.toLowerCase()} ${a.gravidade}`}`).join('; ');
    const texto = [o.diagnostico, `Vistoria: ${resumo}.`].filter(Boolean).join('\n');
    await ordens.registrarDiagnostico(ordemId, { diagnostico: texto }, usuario);
    o = await ordens.buscar(ordemId, usuario);
  }
  if (!['orcamento', 'aprovacao'].includes(o.etapa_atual))
    throw conflito('O orçamento só pode ser gerado durante o diagnóstico ou o orçamento.');

  for (const a of pendentes) {
    for (const s of a.servicos) {
      // trocas de peça entram como "peça" no orçamento; o resto é mão de obra
      const codigo = s.catalogo_id && (await db.prepare('SELECT codigo FROM catalogo_servicos WHERE id = ?').get(s.catalogo_id))?.codigo;
      await ordens.adicionarItem(ordemId, { tipo: codigo?.startsWith('substituicao') ? 'peca' : 'servico', descricao: `${s.descricao} — ${a.zona_nome} (avaria ${a.numero})`, quantidade: 1, valor_unitario: s.valor, avaria_id: a.id }, usuario);
    }
    await db.prepare('UPDATE avarias SET orcada = 1 WHERE id = ?').run(a.id);
  }
  return pendentes.length;
});

/** Versão para o cliente: sem quem marcou e sem valores internos ainda não enviados. */
async function visaoCliente(ordemId, mostrarValores) {
  return (await listar(ordemId)).map((a) => ({
    numero: a.numero, zona: a.zona, zona_nome: a.zona_nome, tipo: a.tipo, tipo_nome: a.tipo_nome, gravidade: a.gravidade,
    pos_x: a.pos_x, pos_y: a.pos_y, pos_z: a.pos_z, nor_x: a.nor_x, nor_y: a.nor_y, nor_z: a.nor_z, observacao: a.observacao,
    servicos: a.servicos.map((s) => ({ descricao: s.descricao, valor: mostrarValores ? s.valor : null })),
  }));
}

module.exports = { listar, criar, editar, remover, gerarOrcamento, visaoCliente, NOMES_TIPO };
