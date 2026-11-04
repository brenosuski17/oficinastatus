// Popula o banco com dados de exemplo para a apresentação: `npm run seed`
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');
const ordens = require('./services/ordens');

db.exec('DELETE FROM mensagens; DELETE FROM etapas; DELETE FROM ordens_servico; DELETE FROM veiculos; DELETE FROM clientes; DELETE FROM sqlite_sequence;');

const cliente = db.prepare('INSERT INTO clientes (nome, telefone, email) VALUES (?, ?, ?)');
const veiculo = db.prepare(
  `INSERT INTO veiculos (cliente_id, placa, tipo, marca, modelo, ano_modelo, combustivel, cor, quilometragem,
                         fipe_codigo, fipe_valor, fipe_mes_referencia, fipe_consultado_em)
   VALUES (?, ?, 'cars', ?, ?, ?, 'Flex', ?, ?, ?, ?, ?, datetime('now'))`
);

const ana = cliente.run('Ana Paula Kowalski', '42999110001', 'ana@email.com').lastInsertRowid;
const joao = cliente.run('João Batista Ribeiro', '42999220002', null).lastInsertRowid;
const marcia = cliente.run('Márcia Andrade', '42999330003', 'marcia@email.com').lastInsertRowid;
const pedro = cliente.run('Pedro Henrique Lima', '42999440004', null).lastInsertRowid;

const v1 = veiculo.run(ana, 'BRA2E19', 'VW - VolksWagen', 'Gol 1.0 Flex 12V 5p', 2020, 'Prata', 68400, '005340-6', 'R$ 52.317,00', 'novembro de 2026').lastInsertRowid;
const v2 = veiculo.run(joao, 'MTZ4C21', 'Fiat', 'Strada Freedom 1.3 Flex 8V CS', 2022, 'Branca', 41200, '001497-4', 'R$ 98.540,00', 'novembro de 2026').lastInsertRowid;
const v3 = veiculo.run(marcia, 'QWE1234', 'GM - Chevrolet', 'Onix HATCH 1.0 12V Flex 5p Mec.', 2021, 'Vermelho', 55900, '004475-0', 'R$ 67.210,00', 'novembro de 2026').lastInsertRowid;
const v4 = veiculo.run(pedro, 'RTY5F67', 'Toyota', 'Corolla XEi 2.0 Flex 16V Aut.', 2019, 'Preto', 98300, '002161-5', 'R$ 104.900,00', 'novembro de 2026').lastInsertRowid;

// OS 1: aguardando orçamento
ordens.criar({ veiculo_id: v1, problema_relatado: 'Barulho na suspensão dianteira ao passar em lombadas.' });

// OS 2: orçamento enviado, aguardando aprovação do cliente
const o2 = ordens.criar({ veiculo_id: v2, problema_relatado: 'Revisão dos 40 mil km e luz da injeção acesa.' });
ordens.enviarOrcamento(o2.id, {
  descricao: 'Revisão 40 mil km (óleo, filtros de óleo, ar e combustível); troca da sonda lambda; scanner.',
  valor: 1380.0,
});

// OS 3: em execução
const o3 = ordens.criar({ veiculo_id: v3, problema_relatado: 'Freio fazendo ruído e pedal baixo.' });
ordens.enviarOrcamento(o3.id, { descricao: 'Pastilhas e discos dianteiros; sangria e fluido DOT4.', valor: 890.5 });
ordens.responderOrcamento(o3.id, { aprovado: true, origem: 'cliente' });
ordens.iniciarExecucao(o3.id, { previsao_entrega: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });

// OS 4: pronto para retirada
const o4 = ordens.criar({ veiculo_id: v4, problema_relatado: 'Ar-condicionado não está gelando.' });
ordens.enviarOrcamento(o4.id, { descricao: 'Recarga de gás R134a, troca do filtro de cabine e higienização.', valor: 420.0 });
ordens.responderOrcamento(o4.id, { aprovado: true, origem: 'oficina', observacao: 'Cliente aprovou por telefone' });
ordens.iniciarExecucao(o4.id);
ordens.marcarPronto(o4.id);

db.prepare("UPDATE mensagens SET status = 'enviada', enviada_em = datetime('now') WHERE direcao = 'saida' AND ordem_id <> ?").run(o2.id);

console.log('Banco populado: 4 clientes, 4 veículos e 4 ordens de serviço em etapas diferentes.');
