const db = require('../db');
const ordens = require('./ordens');

const NOMES_ETAPA = { recebido: 'Recebido', diagnostico: 'Diagnóstico', orcamento: 'Orçamento', aprovacao: 'Aprovação', execucao: 'Execução', pronto: 'Pronto', entregue: 'Retirada' };

// Os meses dos relatórios seguem o fuso de Brasília
const AGORA = "(now() AT TIME ZONE 'America/Sao_Paulo')";
const mes = (coluna) => `to_char(${coluna} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`;
const MES_ATUAL = `to_char(${AGORA}, 'YYYY-MM')`;
const MES_ANTERIOR = `to_char(${AGORA} - interval '1 month', 'YYYY-MM')`;

/** Indicadores do painel e dados dos gráficos (somente admin). */
async function painel(usuario, meses = 6) {
  const abertas = (await ordens.listar(usuario)).filter((o) => o.situacao === 'aberta');
  const porEtapa = {};
  for (const o of abertas) porEtapa[o.etapa_atual] = (porEtapa[o.etapa_atual] || 0) + 1;

  const um = (sql, ...p) => db.prepare(sql).get(...p);
  const faturamentoMes = (await um(
    `SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) v
       FROM itens_orcamento i JOIN ordens_servico o ON o.id = i.ordem_id
      WHERE i.aprovado = 1 AND o.situacao = 'finalizada' AND ${mes('o.entregue_em')} = ${MES_ATUAL}`
  )).v;
  const faturamentoAnterior = (await um(
    `SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) v
       FROM itens_orcamento i JOIN ordens_servico o ON o.id = i.ordem_id
      WHERE i.aprovado = 1 AND o.situacao = 'finalizada' AND ${mes('o.entregue_em')} = ${MES_ANTERIOR}`
  )).v;
  const entreguesMes = (await um(
    `SELECT COUNT(*) n FROM ordens_servico WHERE situacao = 'finalizada' AND ${mes('entregue_em')} = ${MES_ATUAL}`
  )).n;
  const aprovacao = await um(
    `SELECT SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) aprovadas, COUNT(*) respondidas
       FROM etapas WHERE tipo = 'aprovacao' AND status IN ('concluida','recusada')`
  );

  // Série mensal: OS abertas e faturamento (serviços entregues)
  const serie = await db.prepare(
    `SELECT m.mes,
       (SELECT COUNT(*) FROM ordens_servico o WHERE ${mes('o.criado_em')} = m.mes) AS abertas,
       (SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) FROM itens_orcamento i JOIN ordens_servico o ON o.id = i.ordem_id
          WHERE i.aprovado = 1 AND o.situacao = 'finalizada' AND ${mes('o.entregue_em')} = m.mes) AS faturamento
     FROM (SELECT to_char(date_trunc('month', ${AGORA}) - make_interval(months => n), 'YYYY-MM') AS mes
             FROM generate_series(0, ?::int - 1) AS n) m
     ORDER BY m.mes`
  ).all(meses);

  // Tempo médio em cada etapa (horas), considerando etapas já concluídas
  const tempos = (await db.prepare(
    `SELECT tipo, ROUND(AVG(EXTRACT(EPOCH FROM concluida_em - iniciada_em) / 3600)::numeric, 1) AS horas, COUNT(*) AS amostras
       FROM etapas WHERE status = 'concluida' AND iniciada_em IS NOT NULL AND concluida_em IS NOT NULL
        AND tipo IN ('diagnostico','orcamento','aprovacao','execucao','entregue')
      GROUP BY tipo ORDER BY MIN(sequencia)`
  ).all()).map((t) => ({ ...t, nome: NOMES_ETAPA[t.tipo] }));

  const porMecanico = await db.prepare(
    `SELECT COALESCE(u.nome, 'Sem responsável') AS nome,
            SUM(CASE WHEN o.situacao = 'aberta' THEN 1 ELSE 0 END) AS abertas,
            SUM(CASE WHEN o.situacao = 'finalizada' THEN 1 ELSE 0 END) AS entregues
       FROM ordens_servico o LEFT JOIN usuarios u ON u.id = o.mecanico_id
      GROUP BY o.mecanico_id, u.nome ORDER BY abertas DESC`
  ).all();

  const servicosTop = await db.prepare(
    `SELECT MIN(descricao) AS descricao, COUNT(*) AS vezes, SUM(quantidade * valor_unitario) AS valor
       FROM itens_orcamento WHERE aprovado = 1 AND tipo = 'servico'
      GROUP BY lower(descricao) ORDER BY vezes DESC, valor DESC LIMIT 5`
  ).all();

  // Situação das OS do mês (abertas por etapa + encerradas no mês)
  const encerradasMes = await db.prepare(
    `SELECT situacao, COUNT(*) n FROM ordens_servico
      WHERE situacao <> 'aberta' AND ${mes('COALESCE(entregue_em, atualizado_em)')} = ${MES_ATUAL}
      GROUP BY situacao`
  ).all();
  const situacoes = [
    { chave: 'aguardando', nome: 'Aguardando aprovação', total: porEtapa.aprovacao || 0 },
    { chave: 'aprovado', nome: 'Aprovado', total: porEtapa.aprovado || 0 },
    { chave: 'execucao', nome: 'Em execução', total: porEtapa.execucao || 0 },
    { chave: 'elaboracao', nome: 'Em elaboração', total: (porEtapa.diagnostico || 0) + (porEtapa.orcamento || 0) + (porEtapa.recebido || 0) },
    { chave: 'finalizado', nome: 'Finalizado', total: (encerradasMes.find((e) => e.situacao === 'finalizada')?.n || 0) + (porEtapa.pronto || 0) },
    { chave: 'recusado', nome: 'Recusado', total: encerradasMes.find((e) => e.situacao === 'recusada')?.n || 0 },
  ];

  const patio = abertas.map((o) => ({
    id: o.id, placa: o.placa, marca: o.marca, modelo: o.modelo, cliente_nome: o.cliente_nome,
    etapa_atual: o.etapa_atual, aguardando_peca: o.aguardando_peca, atualizado_em: o.atualizado_em,
  }));
  const inspecoes = await db.prepare(
    `SELECT o.id, v.placa, v.marca, v.modelo, c.nome AS cliente_nome, COUNT(a.id) AS qtd_avarias,
            MAX(a.criado_em) AS ultima, o.criado_em
       FROM ordens_servico o JOIN veiculos v ON v.id = o.veiculo_id JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN avarias a ON a.ordem_id = o.id
      GROUP BY o.id, v.id, c.id ORDER BY COALESCE(MAX(a.criado_em), o.criado_em) DESC LIMIT 6`
  ).all();

  return {
    situacoes,
    patio,
    inspecoes,
    kpis: {
      faturamento_mes_anterior: faturamentoAnterior,
      variacao_faturamento: faturamentoAnterior ? (faturamentoMes - faturamentoAnterior) / faturamentoAnterior : null,
      na_oficina: abertas.length,
      aguardando_cliente: porEtapa.aprovacao || 0,
      prontos: porEtapa.pronto || 0,
      aguardando_peca: abertas.filter((o) => o.aguardando_peca).length,
      faturamento_mes: faturamentoMes,
      entregues_mes: entreguesMes,
      ticket_medio: entreguesMes ? faturamentoMes / entreguesMes : 0,
      taxa_aprovacao: aprovacao.respondidas ? aprovacao.aprovadas / aprovacao.respondidas : null,
    },
    por_etapa: porEtapa,
    serie,
    tempos,
    por_mecanico: porMecanico,
    servicos_top: servicosTop,
  };
}

module.exports = { painel };
