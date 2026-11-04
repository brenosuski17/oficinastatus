// Vistoria 3D: sugestão de serviços, avarias e geração do orçamento.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let api, base, T, osId;

before(async () => {
  Object.assign(process.env, { DB_PATH: ':memory:', JWT_SECRET: 'teste', SMTP_HOST: '', WHATSAPP_TOKEN: '' });
  const app = require('../src/app');
  api = app.listen(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
  T = (await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'a@t.com', senha: 'senhaforte1' })).dados.token;
  const c = (await chamar('POST', '/clientes', { nome: 'Cliente', telefone: '42999990000' })).dados;
  const v = (await chamar('POST', '/veiculos', { cliente_id: c.id, placa: 'ABC1D23', marca: 'VW', modelo: 'Golf' })).dados;
  osId = (await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Batida na porta' })).dados.id;
});
after(() => api?.close());

async function chamar(metodo, rota, corpo) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(T ? { Authorization: `Bearer ${T}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
}

const ponto = { posicao: { x: 0.4, y: 0.7, z: 0.9 }, normal: { x: 0, y: 0, z: 1 } };

test('sugere serviços pela peça, tipo e gravidade', async () => {
  const { dados: s } = await chamar('GET', `/ordens/${osId}/avarias/sugestao?zona=porta_dianteira_direita&tipo=amassado&gravidade=leve`);
  const pre = s.servicos.filter((x) => s.pre.includes(x.id));
  assert.deepEqual(pre.map((x) => x.codigo), ['martelinho']);
  assert.ok(s.servicos.some((x) => x.nome === 'Recuperação de porta'));

  // para-choque é plástico: martelinho vira reparo plástico
  const pc = (await chamar('GET', `/ordens/${osId}/avarias/sugestao?zona=para_choque_dianteiro&tipo=amassado&gravidade=leve`)).dados;
  assert.equal(pc.servicos.find((x) => x.id === pc.pre[0]).codigo, 'reparo_plastico');

  // trinca leve no para-brisa: reparo; grave: troca
  const pb = (await chamar('GET', `/ordens/${osId}/avarias/sugestao?zona=para_brisa&tipo=trinca&gravidade=leve`)).dados;
  assert.equal(pb.servicos.find((x) => x.id === pb.pre[0]).codigo, 'reparo_trinca');
  const pbg = (await chamar('GET', `/ordens/${osId}/avarias/sugestao?zona=para_brisa&tipo=trinca&gravidade=grave`)).dados;
  assert.equal(pbg.servicos.find((x) => x.id === pbg.pre[0]).codigo, 'substituicao');
});

test('marca avarias e gera o orçamento a partir delas', async () => {
  const sug = (await chamar('GET', `/ordens/${osId}/avarias/sugestao?zona=porta_dianteira_direita&tipo=amassado&gravidade=moderada`)).dados;
  const rec = sug.servicos.find((x) => x.codigo === 'recuperacao');
  const mart = sug.servicos.find((x) => x.codigo === 'martelinho');

  assert.equal((await chamar('POST', `/ordens/${osId}/avarias`, { ...ponto, zona: 'porta_dianteira_direita', tipo: 'amassado', gravidade: 'moderada', servicos: [] })).status, 400);
  assert.equal((await chamar('POST', `/ordens/${osId}/avarias`, { ...ponto, zona: 'asa', tipo: 'amassado', gravidade: 'leve', servicos: [{ catalogo_id: rec.id }] })).status, 400);

  const r1 = await chamar('POST', `/ordens/${osId}/avarias`, {
    ...ponto, zona: 'porta_dianteira_direita', tipo: 'amassado', gravidade: 'moderada',
    servicos: [{ catalogo_id: rec.id }, { catalogo_id: mart.id }],
  });
  assert.equal(r1.status, 201);
  assert.equal(r1.dados.avarias[0].numero, 1);
  assert.equal(r1.dados.avarias[0].valor, rec.valor + mart.valor);
  assert.equal(r1.dados.avarias[0].zona_nome, 'Porta dianteira direita');

  const r2 = await chamar('POST', `/ordens/${osId}/avarias`, {
    posicao: { x: 2.1, y: 0.4, z: 0 }, zona: 'para_choque_dianteiro', tipo: 'risco', gravidade: 'leve',
    servicos: [{ descricao: 'Remoção de adesivo', valor: 80, minutos: 20 }],
  });
  assert.equal(r2.dados.avarias.length, 2);

  // OS está no diagnóstico: gerar orçamento conclui o diagnóstico e cria os itens
  const g = await chamar('POST', `/ordens/${osId}/avarias/orcamento`);
  assert.equal(g.status, 200);
  assert.equal(g.dados.etapa_atual, 'orcamento');
  assert.match(g.dados.diagnostico, /Vistoria: 1\) Porta dianteira direita: amassado moderada; 2\) Para-choque dianteiro: risco leve/);
  assert.equal(g.dados.itens.length, 3);
  assert.equal(g.dados.total, rec.valor + mart.valor + 80);
  assert.ok(g.dados.avarias.every((a) => a.orcada));
  assert.equal((await chamar('POST', `/ordens/${osId}/avarias/orcamento`)).status, 400); // nada novo

  // editar a avaria 1 tira os itens antigos dela; gerar de novo põe os novos
  const a1 = g.dados.avarias[0];
  const e = await chamar('PUT', `/ordens/${osId}/avarias/${a1.id}`, { ...ponto, zona: a1.zona, tipo: 'amassado', gravidade: 'leve', servicos: [{ catalogo_id: mart.id }] });
  assert.equal(e.dados.itens.length, 1);
  const g2 = await chamar('POST', `/ordens/${osId}/avarias/orcamento`);
  assert.equal(g2.dados.total, mart.valor + 80);

  // excluir a avaria 2 tira o item dela
  const rm = await chamar('DELETE', `/ordens/${osId}/avarias/${g2.dados.avarias[1].id}`);
  assert.equal(rm.dados.avarias.length, 1);
  assert.equal(rm.dados.total, mart.valor);

  // depois da aprovação, as avarias ficam travadas
  await chamar('POST', `/ordens/${osId}/orcamento/enviar`, {});
  const itens = Object.fromEntries(rm.dados.itens.map((i) => [i.id, true]));
  await chamar('POST', `/ordens/${osId}/aprovacao`, { itens });
  assert.equal((await chamar('POST', `/ordens/${osId}/avarias`, { ...ponto, zona: 'capo', tipo: 'risco', gravidade: 'leve', servicos: [{ descricao: 'x', valor: 1 }] })).status, 409);
});

test('serviço sem avaria e categorias da tabela de preços', async () => {
  const c = (await chamar('POST', '/clientes', { nome: 'Outro', telefone: '42988880000' })).dados;
  const v = (await chamar('POST', '/veiculos', { cliente_id: c.id, placa: 'SED1A23', marca: 'Toyota', modelo: 'Corolla', carroceria: 'sedan' })).dados;
  assert.equal(v.carroceria, 'sedan');
  const os2 = (await chamar('POST', '/ordens', { veiculo_id: v.id, problema_relatado: 'Revisão' })).dados.id;
  const sug = (await chamar('GET', `/ordens/${os2}/avarias/sugestao?zona=roda_dianteira_direita&tipo=servico&gravidade=leve`)).dados;
  assert.equal(sug.pre.length, 0);
  const alinh = sug.servicos.find((s) => s.codigo === 'alinhamento');
  const r = await chamar('POST', `/ordens/${os2}/avarias`, { posicao: { x: 1.3, y: 0.3, z: 0.9 }, zona: 'roda_dianteira_direita', tipo: 'servico', servicos: [{ catalogo_id: alinh.id }] });
  assert.equal(r.status, 201);
  assert.equal(r.dados.avarias[0].tipo_nome, 'Serviço sem avaria');
  const cats = (await chamar('GET', '/catalogo/categorias')).dados;
  assert.ok(cats.find((x) => x.categoria === 'funilaria').total > 10);
  const pint = (await chamar('GET', '/catalogo?categoria=vidros')).dados;
  assert.ok(pint.every((x) => x.categoria === 'vidros') && pint[0].aplica_se);
});

test('a página do cliente mostra as avarias marcadas', async () => {
  const { dados: o } = await chamar('GET', `/ordens/${osId}`);
  const pub = (await chamar('GET', `/publico/ordens/${o.codigo_publico}`)).dados;
  assert.equal(pub.avarias.length, 1);
  assert.equal(pub.avarias[0].zona_nome, 'Porta dianteira direita');
  assert.equal(pub.avarias[0].criado_por, undefined);
});
