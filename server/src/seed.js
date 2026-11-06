// Dados de demonstração para a apresentação: `npm run seed`
// ATENÇÃO: apaga todos os dados do banco. Nenhuma mensagem é enviada durante o seed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
for (const k of ['SMTP_HOST', 'TELEGRAM_TOKEN']) process.env[k] = '';

const bcrypt = require('bcryptjs');
const db = require('./db');
const ordens = require('./services/ordens');
const avarias = require('./services/avarias');
const catalogo = require('./services/catalogo');
const { migrar } = require('./migrar');

// Evita apagar por engano o banco da nuvem quando o DATABASE_URL apontar para ele
function exigirBancoLocal() {
  const { hostname } = new URL(process.env.DATABASE_URL || 'postgresql://localhost');
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(hostname) && !process.argv.includes('--forcar'))
    throw new Error(`O seed apaga todos os dados e o banco em ${hostname} não é local. Para continuar mesmo assim: npm run seed -- --forcar`);
}

const SENHA = 'oficina123';

const popular = db.transaction(async () => {
  await db.exec(`TRUNCATE mensagens, comunicacoes, canais_usuario, convites_canal, updates_telegram, fotos, avaria_servicos, avarias, itens_orcamento, etapas, ordens_servico,
                          veiculos, usuarios, clientes, catalogo_servicos RESTART IDENTITY CASCADE`);

  // tabela de preços volta ao padrão
  await catalogo.garantirCatalogo();

  const hash = bcrypt.hashSync(SENHA, 10);
  const usuario = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, cliente_id) VALUES (?, ?, ?, ?, ?)');
  const adminId = (await usuario.run('Breno Suski', 'admin@oficina.com', hash, 'admin', null)).lastInsertRowid;
  const mecA = (await usuario.run('Arthur Svidzinski', 'arthur@oficina.com', hash, 'mecanico', null)).lastInsertRowid;
  const mecB = (await usuario.run('Rafael Moreira', 'rafael@oficina.com', hash, 'mecanico', null)).lastInsertRowid;
  const admin = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(adminId);
  const mecanicoA = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(mecA);

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
  // Vínculo de demonstração: o Telegram recusa estes chat_id, que não são de ninguém
  const vincular = (usuarioId, nome) => db.prepare("INSERT INTO canais_usuario (usuario_id, plataforma, chat_id, codigo_convite) VALUES (?, 'telegram', ?, 'demonstracao')")
    .run(usuarioId, `demo-${nome.split(' ')[0].toLowerCase()}`);
  const CARROCERIA = { MTZ4C21: 'picape', RTY5F67: 'sedan' };
  const V = [];
  for (const [nome, tel, email, placa, marca, modelo, ano, cor, km] of C) {
    const { lastInsertRowid: cid } = await cliente.run(nome, tel, email);
    if (email) await vincular((await usuario.run(nome, email, hash, 'cliente', cid)).lastInsertRowid, nome); // clientes de demonstração já com senha
    const { lastInsertRowid: id } = await veiculo.run(cid, placa, marca, modelo, ano, ano, cor, km);
    await db.prepare('UPDATE veiculos SET carroceria = ? WHERE id = ?').run(CARROCERIA[placa] || 'hatch', id);
    V.push(id);
  }

  const item = (id, tipo, descricao, quantidade, valor_unitario) => ordens.adicionarItem(id, { tipo, descricao, quantidade, valor_unitario }, admin);
  const itensDe = async (id, lista) => { for (const it of lista) await item(id, ...it); };
  const aprovarTudo = async (id) => {
    const linhas = await db.prepare('SELECT id FROM itens_orcamento WHERE ordem_id = ?').all(id);
    await ordens.responderOrcamento(id, { itens: Object.fromEntries(linhas.map((i) => [i.id, true])), origem: 'cliente' }, null);
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
  for (const [i, [vi, problema, itens]] of historico.entries()) {
    const id = await ordens.criar({ veiculo_id: V[vi], problema_relatado: problema, mecanico_id: i % 2 ? mecA : mecB }, admin);
    await ordens.registrarDiagnostico(id, { diagnostico: problema }, admin);
    await itensDe(id, itens);
    await ordens.enviarOrcamento(id, {}, admin);
    await aprovarTudo(id);
    await ordens.iniciarExecucao(id, {}, admin);
    await ordens.concluirExecucao(id, {}, admin);
    await ordens.registrarEntrega(id, admin);
    // Espalha as datas pelos últimos 6 meses, com tempos realistas em cada etapa
    const dias = 175 - i * 19; // a mais recente foi entregue há poucos dias
    const h = (d, horas = 0) => `now() - interval '${d} days' + interval '${horas} hours'`;
    await db.exec(`UPDATE ordens_servico SET criado_em = ${h(dias)}, atualizado_em = ${h(dias, 70)}, entregue_em = ${h(dias, 70)} WHERE id = ${id}`);
    const marcos = { recebido: [0, 0], diagnostico: [0, 3], orcamento: [3, 6], aprovacao: [6, 20 + (i % 3) * 6], execucao: [26, 50 + i * 2], pronto: [52, 52], entregue: [52, 70] };
    for (const [tipo, [ini, fim]] of Object.entries(marcos))
      await db.exec(`UPDATE etapas SET iniciada_em = ${h(dias, ini)}, concluida_em = ${h(dias, fim)} WHERE ordem_id = ${id} AND tipo = '${tipo}'`);
  }

  // OS abertas, uma em cada etapa
  const o1 = await ordens.criar({ veiculo_id: V[0], problema_relatado: 'Barulho na suspensão dianteira ao passar em lombadas.', km_entrada: 68420 }, admin);
  await ordens.atribuir(o1, { mecanico_id: mecA }, admin);

  const o2 = await ordens.criar({ veiculo_id: V[1], problema_relatado: 'Revisão dos 40 mil km e luz da injeção acesa.', km_entrada: 41230, mecanico_id: mecB }, admin);
  await ordens.registrarDiagnostico(o2, { diagnostico: 'Sonda lambda com leitura fora do padrão; revisão de 40 mil km pendente.' }, admin);
  await itensDe(o2, [['servico', 'Revisão dos 40 mil km', 1, 380], ['peca', 'Kit filtros (óleo, ar, combustível)', 1, 165], ['peca', 'Óleo 5W30 sintético (L)', 4, 42], ['peca', 'Sonda lambda', 1, 340], ['servico', 'Troca da sonda lambda', 1, 90]]);
  await ordens.enviarOrcamento(o2, { previsao_entrega: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) }, admin);

  const o3 = await ordens.criar({ veiculo_id: V[2], problema_relatado: 'Freio fazendo ruído e pedal baixo.', km_entrada: 55950, mecanico_id: mecA }, admin);
  await ordens.registrarDiagnostico(o3, { diagnostico: 'Pastilhas no limite e discos com desgaste irregular. Fluido contaminado.' }, mecanicoA);
  await itensDe(o3, [['peca', 'Pastilhas dianteiras', 1, 189], ['peca', 'Par de discos de freio', 1, 420], ['peca', 'Fluido DOT4 (500 ml)', 1, 38], ['servico', 'Troca de pastilhas e discos + sangria', 1, 230]]);
  await ordens.enviarOrcamento(o3, { previsao_entrega: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, admin);
  await aprovarTudo(o3);
  await ordens.iniciarExecucao(o3, {}, mecanicoA);
  await ordens.definirAguardandoPeca(o3, { aguardando: true, observacao: 'discos chegam amanhã de manhã' }, mecanicoA);

  const o4 = await ordens.criar({ veiculo_id: V[3], problema_relatado: 'Ar-condicionado não está gelando.', km_entrada: 98350, mecanico_id: mecB }, admin);
  await ordens.registrarDiagnostico(o4, { diagnostico: 'Baixa carga de gás e filtro de cabine saturado.' }, admin);
  await itensDe(o4, [['servico', 'Higienização e recarga do A/C', 1, 280], ['peca', 'Filtro de cabine', 1, 58]]);
  await ordens.enviarOrcamento(o4, {}, admin);
  await aprovarTudo(o4);
  await ordens.iniciarExecucao(o4, {}, admin);
  await ordens.concluirExecucao(o4, {}, admin);

  const o5 = await ordens.criar({ veiculo_id: V[4], problema_relatado: 'Motor falhando na partida a frio.', km_entrada: 72600 }, admin);
  await ordens.registrarDiagnostico(o5, { diagnostico: 'Velas desgastadas e bico injetor do cilindro 2 com vazão baixa.' }, admin);
  await item(o5, 'peca', 'Jogo de velas', 1, 132);

  // OS com vistoria 3D: batida leve, orçamento gerado pelas avarias e aguardando o cliente
  const { lastInsertRowid: cidF } = await cliente.run('Fernanda Costa', '42999770007', 'fernanda@cliente.com');
  await vincular((await usuario.run('Fernanda Costa', 'fernanda@cliente.com', hash, 'cliente', cidF)).lastInsertRowid, 'Fernanda Costa');
  const { lastInsertRowid: vF } = await veiculo.run(cidF, 'FRN7C30', 'VW - VolksWagen', 'Polo Track 1.0 Flex 12V 5p', 2023, 2023, 'Azul', 22100);
  await db.prepare("UPDATE veiculos SET fipe_codigo = '005569-0', fipe_valor = 'R$ 81.200,00', fipe_mes_referencia = 'novembro de 2026', origem_dados = 'fipe' WHERE id = ?").run(vF);
  const o6 = await ordens.criar({ veiculo_id: vF, problema_relatado: 'Batida leve no estacionamento, lado direito e frente.', km_entrada: 22140, mecanico_id: mecA }, admin);
  const marcar = async (zona, tipo, gravidade, posicao, normal, observacao) => {
    const { servicos, pre } = await catalogo.sugerir(zona, tipo, gravidade);
    await avarias.criar(o6, { zona, tipo, gravidade, posicao, normal, observacao, servicos: servicos.filter((x) => pre.includes(x.id)).map((x) => ({ catalogo_id: x.id })) }, mecanicoA);
  };
  await marcar('porta_dianteira_direita', 'amassado', 'moderada', { x: 0.42, y: 0.68, z: 0.962 }, { x: 0, y: 0, z: 1 }, 'Amassado perto da maçaneta');
  await marcar('para_lama_dianteiro_direita', 'risco', 'moderada', { x: 1.62, y: 0.72, z: 0.962 }, { x: 0, y: 0, z: 1 });
  await marcar('para_choque_dianteiro', 'trinca', 'leve', { x: 2.225, y: 0.47, z: 0.42 }, { x: 1, y: 0, z: 0 });
  await marcar('farol_direita', 'trinca', 'grave', { x: 2.2, y: 0.74, z: 0.6 }, { x: 0.85, y: 0.53, z: 0 }, 'Lente trincada');
  await avarias.gerarOrcamento(o6, mecanicoA);
  await ordens.enviarOrcamento(o6, { previsao_entrega: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, admin);

  // Os avisos da demonstração aparecem como enviados, menos os das OS o2 e o3, que ficam na fila; quem não tem vínculo fica com a falha registrada
  await db.prepare("UPDATE mensagens SET status = 'enviada', enviada_em = criada_em, id_externo = id::text WHERE status = 'enfileirada' AND ordem_id NOT IN (?, ?)").run(o2, o3);
  await db.exec(`UPDATE mensagens m SET status = 'respondida', respondida_em = m.criada_em
                  WHERE m.reply_markup IS NOT NULL AND m.status = 'enviada'
                    AND EXISTS (SELECT 1 FROM etapas e WHERE e.ordem_id = m.ordem_id AND e.tipo = 'aprovacao' AND e.status IN ('concluida','recusada'))`);
});

async function principal() {
  exigirBancoLocal();
  await migrar();
  await popular();
  console.log(`Banco de demonstração criado.
  Oficina:  admin@oficina.com (admin) · arthur@oficina.com e rafael@oficina.com (mecânicos)
  Clientes: ana@cliente.com, joao@cliente.com, marcia@cliente.com, luciana@cliente.com, fernanda@cliente.com (vistoria 3D)
  Senha de todos: ${SENHA}`);
}

principal()
  .catch((e) => { console.error(`Erro no seed: ${e.message || e.code}`); process.exitCode = 1; })
  .finally(() => db.fechar());
