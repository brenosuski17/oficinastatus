// Dados de demonstração para a apresentação: `npm run seed`
// ATENÇÃO: apaga todo o banco. Nenhuma mensagem é enviada durante o seed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
for (const k of ['SMTP_HOST', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']) process.env[k] = '';

const bcrypt = require('bcryptjs');
const db = require('./db');
const ordens = require('./services/ordens');

db.exec(`DELETE FROM mensagens; DELETE FROM fotos; DELETE FROM itens_orcamento; DELETE FROM etapas; DELETE FROM ordens_servico;
         DELETE FROM veiculos; DELETE FROM usuarios; DELETE FROM clientes; DELETE FROM sqlite_sequence;`);

const SENHA = 'oficina123';
const hash = bcrypt.hashSync(SENHA, 10);
const usuario = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, cliente_id) VALUES (?, ?, ?, ?, ?)');
const adminId = usuario.run('Breno Suski', 'admin@oficina.com', hash, 'admin', null).lastInsertRowid;
const mecA = usuario.run('Arthur Svidzinski', 'arthur@oficina.com', hash, 'mecanico', null).lastInsertRowid;
const mecB = usuario.run('Rafael Moreira', 'rafael@oficina.com', hash, 'mecanico', null).lastInsertRowid;
const admin = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(adminId);
const mecanicoA = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(mecA);

const cliente = db.prepare('INSERT INTO clientes (nome, telefone, email) VALUES (?, ?, ?)');
const veiculo = db.prepare(
  `INSERT INTO veiculos (cliente_id, placa, marca, modelo, ano_fabricacao, ano_modelo, combustivel, cor, quilometragem)
   VALUES (?, ?, ?, ?, ?, ?, 'Flex', ?, ?)`
);
const C = [
  ['Ana Paula Kowalski', '42999110001', 'ana@cliente.com', 'BRA2E19', 'VW - VolksWagen', 'Gol 1.0 Flex 12V 5p', 2020, 'Prata', 68400],
  ['João Batista Ribeiro', '42999220002', 'joao@cliente.com', 'MTZ4C21', 'Fiat', 'Strada Freedom 1.3 Flex 8V CS', 2022, 'Branca', 41200],
  ['Márcia Andrade', '42999330003', 'marcia@cliente.com', 'QWE1234', 'GM - Chevrolet', 'Onix HATCH 1.0 12V Flex 5p Mec.', 2021, 'Vermelho', 55900],
  ['Pedro Henrique Lima', '42999440004', null, 'RTY5F67', 'Toyota', 'Corolla XEi 2.0 Flex 16V Aut.', 2019, 'Preto', 98300],
  ['Luciana Farias', '42999550005', 'luciana@cliente.com', 'HBX7J82', 'Hyundai', 'HB20 Comfort 1.0 Flex 12V', 2019, 'Azul', 72500],
  ['Carlos Eduardo Nunes', '42999660006', null, 'KLM3A45', 'Renault', 'Kwid Zen 1.0 Flex 12V 5p', 2023, 'Branco', 18900],
];
const V = C.map(([nome, tel, email, placa, marca, modelo, ano, cor, km]) => {
  const cid = cliente.run(nome, tel, email).lastInsertRowid;
  if (email) usuario.run(nome, email, hash, 'cliente', cid); // clientes de demonstração já com senha
  return veiculo.run(cid, placa, marca, modelo, ano, ano, cor, km).lastInsertRowid;
});

const item = (id, tipo, descricao, quantidade, valor_unitario) => ordens.adicionarItem(id, { tipo, descricao, quantidade, valor_unitario }, admin);
const aprovarTudo = (id) => {
  const itens = Object.fromEntries(db.prepare('SELECT id FROM itens_orcamento WHERE ordem_id = ?').all(id).map((i) => [i.id, true]));
  ordens.responderOrcamento(id, { itens, origem: 'cliente' }, null);
};

// Histórico: OS entregues nos últimos meses (para os relatórios)
const historico = [
  [3, 'Revisão dos 60 mil km', [['servico', 'Revisão completa', 1, 380], ['peca', 'Kit filtros (óleo, ar, combustível)', 1, 165], ['peca', 'Óleo 5W30 sintético (L)', 4, 42]]],
  [2, 'Barulho ao frear', [['servico', 'Troca de pastilhas', 1, 150], ['peca', 'Pastilhas dianteiras', 1, 189]]],
  [4, 'Ar-condicionado sem gelar', [['servico', 'Higienização e recarga do A/C', 1, 280], ['peca', 'Filtro de cabine', 1, 58]]],
  [5, 'Alinhamento e balanceamento', [['servico', 'Alinhamento e balanceamento', 1, 160]]],
  [1, 'Troca de correia dentada', [['servico', 'Troca de correia dentada', 1, 320], ['peca', 'Kit correia + tensor', 1, 410]]],
  [3, 'Luz da injeção acesa', [['servico', 'Diagnóstico com scanner', 1, 120], ['peca', 'Sonda lambda', 1, 340], ['servico', 'Troca da sonda lambda', 1, 90]]],
  [0, 'Revisão dos 70 mil km', [['servico', 'Revisão completa', 1, 380], ['peca', 'Kit filtros (óleo, ar, combustível)', 1, 165]]],
  [5, 'Suspensão batendo', [['servico', 'Troca de amortecedores dianteiros', 1, 260], ['peca', 'Par de amortecedores', 1, 690]]],
  [4, 'Bateria descarregando', [['peca', 'Bateria 60Ah', 1, 520], ['servico', 'Teste do sistema de carga', 1, 80]]],
  [2, 'Alinhamento e balanceamento', [['servico', 'Alinhamento e balanceamento', 1, 160]]],
];
historico.forEach(([vi, problema, itens], i) => {
  const id = ordens.criar({ veiculo_id: V[vi], problema_relatado: problema, mecanico_id: i % 2 ? mecA : mecB }, admin);
  ordens.registrarDiagnostico(id, { diagnostico: problema }, admin);
  itens.forEach((it) => item(id, ...it));
  ordens.enviarOrcamento(id, {}, admin);
  aprovarTudo(id);
  ordens.iniciarExecucao(id, {}, admin);
  ordens.concluirExecucao(id, {}, admin);
  ordens.registrarEntrega(id, admin);
  // Espalha as datas pelos últimos 6 meses, com tempos realistas em cada etapa
  const dias = 175 - i * 19; // a mais recente foi entregue há poucos dias
  const h = (d, horas = 0) => `datetime('now', '-${d} days', '+${horas} hours')`;
  db.exec(`UPDATE ordens_servico SET criado_em = ${h(dias)}, atualizado_em = ${h(dias, 70)}, entregue_em = ${h(dias, 70)} WHERE id = ${id}`);
  const marcos = { recebido: [0, 0], diagnostico: [0, 3], orcamento: [3, 6], aprovacao: [6, 20 + (i % 3) * 6], execucao: [26, 50 + i * 2], pronto: [52, 52], entregue: [52, 70] };
  for (const [tipo, [ini, fim]] of Object.entries(marcos))
    db.exec(`UPDATE etapas SET iniciada_em = ${h(dias, ini)}, concluida_em = ${h(dias, fim)} WHERE ordem_id = ${id} AND tipo = '${tipo}'`);
});

// OS abertas, uma em cada etapa
const o1 = ordens.criar({ veiculo_id: V[0], problema_relatado: 'Barulho na suspensão dianteira ao passar em lombadas.', km_entrada: 68420 }, admin);
ordens.atribuir(o1, { mecanico_id: mecA }, admin);

const o2 = ordens.criar({ veiculo_id: V[1], problema_relatado: 'Revisão dos 40 mil km e luz da injeção acesa.', km_entrada: 41230, mecanico_id: mecB }, admin);
ordens.registrarDiagnostico(o2, { diagnostico: 'Sonda lambda com leitura fora do padrão; revisão de 40 mil km pendente.' }, admin);
[['servico', 'Revisão dos 40 mil km', 1, 380], ['peca', 'Kit filtros (óleo, ar, combustível)', 1, 165], ['peca', 'Óleo 5W30 sintético (L)', 4, 42], ['peca', 'Sonda lambda', 1, 340], ['servico', 'Troca da sonda lambda', 1, 90]]
  .forEach((it) => item(o2, ...it));
ordens.enviarOrcamento(o2, { previsao_entrega: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) }, admin);

const o3 = ordens.criar({ veiculo_id: V[2], problema_relatado: 'Freio fazendo ruído e pedal baixo.', km_entrada: 55950, mecanico_id: mecA }, admin);
ordens.registrarDiagnostico(o3, { diagnostico: 'Pastilhas no limite e discos com desgaste irregular. Fluido contaminado.' }, mecanicoA);
[['peca', 'Pastilhas dianteiras', 1, 189], ['peca', 'Par de discos de freio', 1, 420], ['peca', 'Fluido DOT4 (500 ml)', 1, 38], ['servico', 'Troca de pastilhas e discos + sangria', 1, 230]].forEach((it) => item(o3, ...it));
ordens.enviarOrcamento(o3, { previsao_entrega: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, admin);
aprovarTudo(o3);
ordens.iniciarExecucao(o3, {}, mecanicoA);
ordens.definirAguardandoPeca(o3, { aguardando: true, observacao: 'discos chegam amanhã de manhã' }, mecanicoA);

const o4 = ordens.criar({ veiculo_id: V[3], problema_relatado: 'Ar-condicionado não está gelando.', km_entrada: 98350, mecanico_id: mecB }, admin);
ordens.registrarDiagnostico(o4, { diagnostico: 'Baixa carga de gás e filtro de cabine saturado.' }, admin);
[['servico', 'Higienização e recarga do A/C', 1, 280], ['peca', 'Filtro de cabine', 1, 58]].forEach((it) => item(o4, ...it));
ordens.enviarOrcamento(o4, {}, admin);
aprovarTudo(o4);
ordens.iniciarExecucao(o4, {}, admin);
ordens.concluirExecucao(o4, {}, admin);

const o5 = ordens.criar({ veiculo_id: V[4], problema_relatado: 'Motor falhando na partida a frio.', km_entrada: 72600 }, admin);
ordens.registrarDiagnostico(o5, { diagnostico: 'Velas desgastadas e bico injetor do cilindro 2 com vazão baixa.' }, admin);
item(o5, 'peca', 'Jogo de velas', 1, 132);

// OS com vistoria 3D: batida leve, orçamento gerado pelas avarias e aguardando o cliente
const avarias = require('./services/avarias');
const catalogo = require('./services/catalogo');
const cidF = cliente.run('Fernanda Costa', '42999770007', 'fernanda@cliente.com').lastInsertRowid;
usuario.run('Fernanda Costa', 'fernanda@cliente.com', hash, 'cliente', cidF);
const vF = veiculo.run(cidF, 'FRN7C30', 'VW - VolksWagen', 'Polo Track 1.0 Flex 12V 5p', 2023, 2023, 'Prata', 22100).lastInsertRowid;
db.prepare("UPDATE veiculos SET fipe_codigo = '005569-0', fipe_valor = 'R$ 81.200,00', fipe_mes_referencia = 'novembro de 2026', origem_dados = 'fipe' WHERE id = ?").run(vF);
const o6 = ordens.criar({ veiculo_id: vF, problema_relatado: 'Batida leve no estacionamento, lado direito e frente.', km_entrada: 22140, mecanico_id: mecA }, admin);
const marcar = (zona, tipo, gravidade, posicao, normal, observacao) => {
  const { servicos, pre } = catalogo.sugerir(zona, tipo, gravidade);
  avarias.criar(o6, { zona, tipo, gravidade, posicao, normal, observacao, servicos: servicos.filter((x) => pre.includes(x.id)).map((x) => ({ catalogo_id: x.id })) }, mecanicoA);
};
marcar('porta_dianteira_direita', 'amassado', 'moderada', { x: 0.42, y: 0.68, z: 0.962 }, { x: 0, y: 0, z: 1 }, 'Amassado perto da maçaneta');
marcar('para_lama_dianteiro_direita', 'risco', 'moderada', { x: 1.62, y: 0.72, z: 0.962 }, { x: 0, y: 0, z: 1 });
marcar('para_choque_dianteiro', 'trinca', 'leve', { x: 2.225, y: 0.47, z: 0.42 }, { x: 1, y: 0, z: 0 });
marcar('farol_direita', 'trinca', 'grave', { x: 2.2, y: 0.74, z: 0.6 }, { x: 0.85, y: 0.53, z: 0 }, 'Lente trincada');
avarias.gerarOrcamento(o6, mecanicoA);
ordens.enviarOrcamento(o6, { previsao_entrega: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, admin);

db.prepare("UPDATE mensagens SET status = 'enviada', enviada_em = criado_em WHERE direcao = 'saida' AND ordem_id NOT IN (?, ?)").run(o2, o3);

console.log(`Banco de demonstração criado.
  Oficina:  admin@oficina.com (admin) · arthur@oficina.com e rafael@oficina.com (mecânicos)
  Clientes: ana@cliente.com, joao@cliente.com, marcia@cliente.com, luciana@cliente.com, fernanda@cliente.com (vistoria 3D)
  Senha de todos: ${SENHA}`);
