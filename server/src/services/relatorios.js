const db = require('../db');
const ordens = require('./ordens');

const NOMES_ETAPA = { recebido: 'Recebido', diagnostico: 'Diagnóstico', orcamento: 'Orçamento', aprovacao: 'Aprovação', execucao: 'Execução', pronto: 'Pronto', entregue: 'Retirada' };

/** Indicadores do painel e dados dos gráficos (somente admin). */
function painel(usuario, meses = 6) {
  const abertas = ordens.listar(usuario).filter((o) => o.situacao === 'aberta');
  const porEtapa = {};
  for (const o of abertas) porEtapa[o.etapa_atual] = (porEtapa[o.etapa_atual] || 0) + 1;

  const um = (sql, ...p) => db.prepare(sql).get(...p);
  const faturamentoMes = um(
    `SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) v
       FROM itens_orcamento i JOIN ordens_servico o ON o.id = i.ordem_id
      WHERE i.aprovado = 1 AND o.situacao = 'finalizada' AND strftime('%Y-%m', o.entregue_em, '-3 hours') = strftime('%Y-%m', 'now', '-3 hours')`
  ).v;
  const entreguesMes = um(
    `SELECT COUNT(*) n FROM ordens_servico WHERE situacao = 'finalizada' AND strftime('%Y-%m', entregue_em, '-3 hours') = strftime('%Y-%m', 'now', '-3 hours')`
  ).n;
  const aprovacao = um(
    `SELECT SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) aprovadas, COUNT(*) respondidas
       FROM etapas WHERE tipo = 'aprovacao' AND status IN ('concluida','recusada')`
  );

  // Série mensal: OS abertas e faturamento (serviços entregues) — fuso de Brasília
  const serie = db.prepare(
    `WITH RECURSIVE m(i, mes) AS (
        SELECT 0, strftime('%Y-%m', 'now', '-3 hours')
        UNION ALL SELECT i + 1, strftime('%Y-%m', date('now', '-3 hours', 'start of month', '-' || (i + 1) || ' months')) FROM m WHERE i + 1 < ?
     )
     SELECT mes,
       (SELECT COUNT(*) FROM ordens_servico o WHERE strftime('%Y-%m', o.criado_em, '-3 hours') = mes) AS abertas,
       (SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) FROM itens_orcamento i JOIN ordens_servico o ON o.id = i.ordem_id
          WHERE i.aprovado = 1 AND o.situacao = 'finalizada' AND strftime('%Y-%m', o.entregue_em, '-3 hours') = mes) AS faturamento
     FROM m ORDER BY mes`
  ).all(meses);

  // Tempo médio em cada etapa (horas), considerando etapas já concluídas
  const tempos = db.prepare(
    `SELECT tipo, ROUND(AVG((julianday(concluida_em) - julianday(iniciada_em)) * 24), 1) AS horas, COUNT(*) AS amostras
       FROM etapas WHERE status = 'concluida' AND iniciada_em IS NOT NULL AND concluida_em IS NOT NULL
        AND tipo IN ('diagnostico','orcamento','aprovacao','execucao','entregue')
      GROUP BY tipo ORDER BY MIN(sequencia)`
  ).all().map((t) => ({ ...t, nome: NOMES_ETAPA[t.tipo] }));

  const porMecanico = db.prepare(
    `SELECT COALESCE(u.nome, 'Sem responsável') AS nome,
            SUM(CASE WHEN o.situacao = 'aberta' THEN 1 ELSE 0 END) AS abertas,
            SUM(CASE WHEN o.situacao = 'finalizada' THEN 1 ELSE 0 END) AS entregues
       FROM ordens_servico o LEFT JOIN usuarios u ON u.id = o.mecanico_id
      GROUP BY o.mecanico_id ORDER BY abertas DESC`
  ).all();

  const servicosTop = db.prepare(
    `SELECT descricao, COUNT(*) AS vezes, SUM(quantidade * valor_unitario) AS valor
       FROM itens_orcamento WHERE aprovado = 1 AND tipo = 'servico'
      GROUP BY lower(descricao) ORDER BY vezes DESC, valor DESC LIMIT 5`
  ).all();

  return {
    kpis: {
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
