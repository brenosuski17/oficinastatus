// Tabela de preços da oficina e sugestão de serviços para cada avaria (peça + tipo + gravidade).
const db = require('../db');

// ---------------------------------------------------------------- peças do carro
const LADOS = { esquerda: 'esquerda', direita: 'direita' };
const ZONAS = {
  capo: { nome: 'Capô', grupo: 'capo' },
  teto: { nome: 'Teto', grupo: 'teto' },
  tampa_traseira: { nome: 'Tampa traseira', grupo: 'tampa_traseira' },
  para_choque_dianteiro: { nome: 'Para-choque dianteiro', grupo: 'para_choque' },
  para_choque_traseiro: { nome: 'Para-choque traseiro', grupo: 'para_choque' },
  para_brisa: { nome: 'Para-brisa', grupo: 'para_brisa' },
  vidro_traseiro: { nome: 'Vidro traseiro', grupo: 'vidro_traseiro' },
};
const LATERAIS = {
  para_lama_dianteiro: ['Para-lama dianteiro', 'para_lama_dianteiro'],
  porta_dianteira: ['Porta dianteira', 'porta_dianteira'],
  porta_traseira: ['Porta traseira', 'porta_traseira'],
  lateral_traseira: ['Lateral traseira', 'lateral_traseira'],
  soleira: ['Soleira', 'soleira'],
  vidro_lateral: ['Vidro lateral', 'vidro_lateral'],
  retrovisor: ['Retrovisor', 'retrovisor'],
  farol: ['Farol', 'farol'],
  lanterna: ['Lanterna', 'lanterna'],
  roda_dianteira: ['Roda dianteira', 'roda'],
  roda_traseira: ['Roda traseira', 'roda'],
};
// o código usa sempre esquerda/direita; o nome concorda com a peça (para-lama direito, porta direita)
const MASCULINOS = new Set(['para_lama_dianteiro', 'vidro_lateral', 'retrovisor', 'farol']);
for (const [chave, [nome, grupo]] of Object.entries(LATERAIS))
  for (const lado of Object.values(LADOS)) {
    const adj = MASCULINOS.has(chave) ? lado.replace(/a$/, 'o') : lado;
    ZONAS[`${chave}_${lado}`] = { nome: `${nome} ${adj}`, grupo };
  }

const TIPOS = ['amassado', 'risco', 'trinca', 'quebra', 'corrosao', 'pintura'];
const GRAVIDADES = ['leve', 'moderada', 'grave'];

// ---------------------------------------------------------------- tabela de preços inicial
// Valores de referência (R$) e tempo (min) para uma porta; as outras peças usam um fator.
const LATARIA = {
  martelinho: ['Martelinho de ouro', 235, 90],
  recuperacao: ['Recuperação de {p}', 545, 180],
  recuperacao_pintura: ['Recuperação e pintura de {p}', 910, 420],
  pintura: ['Pintura de {p}', 560, 300],
  retoque: ['Retoque de pintura', 255, 90],
  polimento: ['Polimento técnico da peça', 190, 60],
  corrosao: ['Tratamento de corrosão', 420, 240],
  substituicao: ['Substituição de {p}', 1650, 240],
};
const PECAS_LATARIA = {
  porta_dianteira: ['porta', 1],
  porta_traseira: ['porta', 0.95],
  para_lama_dianteiro: ['para-lama', 0.8],
  lateral_traseira: ['lateral', 1.15],
  capo: ['capô', 1.2],
  teto: ['teto', 1.35],
  tampa_traseira: ['tampa traseira', 1.05],
  soleira: ['soleira', 0.6],
};
const OUTROS = {
  para_choque: {
    reparo_plastico: ['Reparo plástico do para-choque', 320, 150],
    retoque: ['Retoque de pintura', 230, 90],
    polimento: ['Polimento técnico da peça', 170, 60],
    pintura: ['Pintura do para-choque', 520, 240],
    recuperacao_pintura: ['Reparo e pintura do para-choque', 690, 330],
    substituicao: ['Substituição do para-choque', 1100, 180],
  },
  para_brisa: {
    reparo_trinca: ['Reparo de trinca no para-brisa', 180, 45],
    substituicao: ['Substituição do para-brisa', 1450, 150],
  },
  vidro_traseiro: { substituicao: ['Substituição do vidro traseiro', 850, 120] },
  vidro_lateral: { substituicao: ['Substituição do vidro lateral', 480, 90] },
  farol: {
    polimento_farol: ['Polimento e cristalização do farol', 150, 60],
    substituicao: ['Substituição do farol', 980, 60],
  },
  lanterna: {
    polimento_farol: ['Polimento da lanterna', 120, 40],
    substituicao: ['Substituição da lanterna', 620, 45],
  },
  retrovisor: {
    retoque: ['Pintura da capa do retrovisor', 260, 90],
    substituicao_capa: ['Substituição da capa do retrovisor', 290, 30],
    substituicao: ['Substituição do retrovisor', 690, 60],
  },
  roda: {
    pintura_roda: ['Pintura da roda', 220, 120],
    reparo_roda: ['Desempeno e reparo da roda', 280, 90],
    substituicao: ['Substituição da roda', 1100, 30],
    alinhamento: ['Alinhamento e balanceamento', 160, 60],
  },
};

function garantirCatalogo() {
  if (db.prepare('SELECT COUNT(*) n FROM catalogo_servicos').get().n) return;
  const ins = db.prepare('INSERT INTO catalogo_servicos (codigo, zona, nome, valor, minutos) VALUES (?, ?, ?, ?, ?)');
  const arred = (v) => Math.round(v / 5) * 5;
  db.transaction(() => {
    for (const [zona, [peca, fator]] of Object.entries(PECAS_LATARIA))
      for (const [codigo, [nome, valor, min]] of Object.entries(LATARIA))
        ins.run(codigo, zona, nome.replace('{p}', peca), arred(valor * fator), Math.round(min * Math.max(fator, 0.8)));
    for (const [zona, servs] of Object.entries(OUTROS))
      for (const [codigo, [nome, valor, min]] of Object.entries(servs)) ins.run(codigo, zona, nome, valor, min);
  })();
}

// ---------------------------------------------------------------- sugestão
// Serviços pré-selecionados para cada tipo e gravidade (em ordem de preferência)
const PRE = {
  amassado: { leve: ['martelinho'], moderada: ['recuperacao'], grave: ['recuperacao_pintura'] },
  risco: { leve: ['polimento'], moderada: ['retoque'], grave: ['pintura'] },
  trinca: { leve: ['reparo_trinca', 'reparo_plastico'], moderada: ['reparo_plastico', 'substituicao'], grave: ['substituicao'] },
  quebra: { leve: ['reparo_plastico', 'recuperacao'], moderada: ['substituicao'], grave: ['substituicao'] },
  corrosao: { leve: ['corrosao'], moderada: ['corrosao', 'pintura'], grave: ['substituicao'] },
  pintura: { leve: ['retoque'], moderada: ['pintura'], grave: ['pintura', 'polimento'] },
};
// Quando a peça não tem o serviço ideal (ex.: martelinho em para-choque de plástico)
const ALTERNATIVA = {
  martelinho: ['reparo_plastico', 'reparo_roda'],
  recuperacao: ['reparo_plastico', 'reparo_roda', 'substituicao'],
  recuperacao_pintura: ['pintura', 'substituicao'],
  polimento: ['polimento_farol', 'retoque'],
  retoque: ['pintura_roda', 'polimento_farol'],
  pintura: ['pintura_roda', 'retoque', 'substituicao'],
  corrosao: ['pintura_roda', 'substituicao'],
  reparo_plastico: ['reparo_trinca', 'recuperacao', 'reparo_roda', 'substituicao_capa', 'substituicao'],
  reparo_trinca: ['reparo_plastico', 'substituicao'],
};
// Serviços que fazem sentido para cada tipo (aparecem como opções; o resto fica no catálogo)
const RELACIONADOS = {
  amassado: ['martelinho', 'recuperacao', 'recuperacao_pintura', 'pintura', 'reparo_plastico', 'reparo_roda', 'substituicao'],
  risco: ['polimento', 'retoque', 'pintura', 'polimento_farol', 'pintura_roda', 'recuperacao_pintura'],
  trinca: ['reparo_trinca', 'reparo_plastico', 'substituicao', 'substituicao_capa'],
  quebra: ['reparo_plastico', 'recuperacao', 'substituicao', 'substituicao_capa', 'reparo_roda'],
  corrosao: ['corrosao', 'pintura', 'recuperacao_pintura', 'substituicao', 'pintura_roda'],
  pintura: ['retoque', 'pintura', 'polimento', 'recuperacao_pintura', 'pintura_roda'],
};

const zonaInfo = (zona) => ZONAS[zona];

/** Serviços da peça para o tipo/gravidade: { servicos: [...], pre: [ids] } */
function sugerir(zona, tipo, gravidade) {
  const z = ZONAS[zona];
  if (!z) return { servicos: [], pre: [] };
  const daZona = db.prepare('SELECT * FROM catalogo_servicos WHERE zona = ? AND ativo = 1 ORDER BY valor').all(z.grupo);
  const porCodigo = Object.fromEntries(daZona.map((s) => [s.codigo, s]));

  const pre = [];
  for (const cod of PRE[tipo]?.[gravidade] || []) {
    const s = porCodigo[cod] || (ALTERNATIVA[cod] || []).map((a) => porCodigo[a]).find(Boolean);
    if (s && !pre.includes(s.id)) pre.push(s.id);
    if (pre.length && gravidade !== 'grave' && tipo !== 'corrosao') break; // um serviço basta, exceto casos combinados
  }
  if (!pre.length && daZona.length) pre.push((gravidade === 'grave' && porCodigo.substituicao) || daZona[0]);
  const preIds = pre.map((p) => (typeof p === 'object' ? p.id : p));

  const rel = RELACIONADOS[tipo] || [];
  const servicos = daZona
    .map((s) => ({ ...s, relevancia: preIds.includes(s.id) ? 2 : rel.includes(s.codigo) ? 1 : 0 }))
    .sort((a, b) => b.relevancia - a.relevancia || a.valor - b.valor);
  return { servicos, pre: preIds };
}

function listar({ busca, zona } = {}) {
  const where = ['ativo = 1'];
  const p = [];
  if (zona && ZONAS[zona]) { where.push('zona = ?'); p.push(ZONAS[zona].grupo); }
  if (busca) { where.push('nome LIKE ?'); p.push(`%${busca}%`); }
  return db.prepare(`SELECT * FROM catalogo_servicos WHERE ${where.join(' AND ')} ORDER BY zona, valor`).all(...p);
}

module.exports = { ZONAS, TIPOS, GRAVIDADES, garantirCatalogo, sugerir, listar, zonaInfo };
