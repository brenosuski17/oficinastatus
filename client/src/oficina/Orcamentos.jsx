import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { FileText, Search } from 'lucide-react'
import { api } from '../lib/api'
import { dataCurta, moeda, nomeVeiculo } from '../lib/formato'
import { Cabecalho, ErroCarga, Esqueleto, Pilula, Placa, Vazio, useDados } from '../ui/base'

/** Situação do orçamento a partir da etapa da OS. */
function situacao(o) {
  if (o.situacao === 'recusada') return ['recusado', 'Recusado', '#f04438']
  if (o.etapa_atual === 'aprovacao') return ['aguardando', 'Aguardando aprovação', '#f5a300']
  if (['recebido', 'diagnostico', 'orcamento'].includes(o.etapa_atual)) return ['elaboracao', 'Em elaboração', '#5b7cff']
  if (o.situacao === 'finalizada') return ['finalizado', 'Finalizado', '#5ee69a']
  return ['aprovado', 'Aprovado', '#12b76a']
}
const FILTROS = [['', 'Todos'], ['elaboracao', 'Em elaboração'], ['aguardando', 'Aguardando aprovação'], ['aprovado', 'Aprovados'], ['finalizado', 'Finalizados'], ['recusado', 'Recusados']]

export default function Orcamentos() {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const { dados, erro, carregando, recarregar } = useDados(() => api.ordens({ busca }), [busca])
  const linhas = useMemo(() => (dados || []).map((o) => ({ ...o, s: situacao(o) })).filter((o) => !filtro || o.s[0] === filtro), [dados, filtro])
  const contagem = useMemo(() => {
    const r = {}
    for (const o of dados || []) { const k = situacao(o)[0]; r[k] = (r[k] || 0) + 1 }
    return r
  }, [dados])

  return (
    <>
      <Cabecalho titulo="Orçamentos" sub="Todos os orçamentos da oficina e em que pé estão.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Placa, cliente ou modelo" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </Cabecalho>

      <div className="flex gap-1 mb-5 overflow-x-auto rounded-2xl bg-trilho p-1 w-fit max-w-full" role="tablist">
        {FILTROS.map(([v, n]) => (
          <button key={v} role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
            className={`relative h-9 px-3.5 rounded-xl text-[14px] font-bold whitespace-nowrap ${filtro === v ? 'text-white' : 'text-tinta-3 hover:text-tinta-2'}`}>
            {filtro === v && <motion.span layoutId="filtro-orc" className="absolute inset-0 rounded-xl bg-ultramar-600/30 ring-1 ring-ultramar-500/60" />}
            <span className="relative">{n}{v ? <span className="ml-1.5 opacity-60 num">{contagem[v] || 0}</span> : null}</span>
          </button>
        ))}
      </div>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <Esqueleto className="h-80 !rounded-3xl" />}
      {dados && !linhas.length && <Vazio icone={FileText} titulo="Nenhum orçamento aqui" />}
      {linhas.length > 0 && (
        <div className="rounded-3xl border border-linha bg-superficie/80 overflow-x-auto">
          <table className="w-full text-[14.5px] min-w-[760px]">
            <thead className="text-left text-[12px] font-bold tracking-[0.1em] text-tinta-3">
              <tr><th className="px-6 py-4">ORÇAMENTO</th><th className="py-4">VEÍCULO</th><th className="py-4">CLIENTE</th><th className="py-4">ITENS</th><th className="py-4 text-right">TOTAL</th><th className="py-4 pl-6">SITUAÇÃO</th><th className="py-4 pr-6">DATA</th></tr>
            </thead>
            <tbody>
              {linhas.map((o, i) => (
                <motion.tr key={o.id} className="border-t border-linha hover:bg-white/[.03]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
                  <td className="px-6 py-3.5"><Link to={`/oficina/ordens/${o.id}`} className="font-bold text-[#9db2ff] num">ORC-{o.criado_em.slice(0, 4)}-{String(o.id).padStart(4, '0')}</Link></td>
                  <td className="py-3.5"><span className="flex items-center gap-3"><Placa placa={o.placa} tamanho="p" /><span className="truncate max-w-[200px]">{nomeVeiculo(o)}</span></span></td>
                  <td className="py-3.5 text-tinta-2">{o.cliente_nome}</td>
                  <td className="py-3.5 text-tinta-3 num">{o.qtd_itens}</td>
                  <td className="py-3.5 text-right font-bold num">{moeda(o.total_aprovado || o.total)}</td>
                  <td className="py-3.5 pl-6"><Pilula nome={o.s[1]} cor={o.s[2]} /></td>
                  <td className="py-3.5 pr-6 text-tinta-3">{dataCurta(o.criado_em)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
