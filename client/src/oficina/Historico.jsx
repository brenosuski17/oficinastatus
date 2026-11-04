import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { History, Search, ScanLine } from 'lucide-react'
import { api } from '../lib/api'
import { dataCurta, moeda, nomeVeiculo } from '../lib/formato'
import { Cabecalho, ErroCarga, Esqueleto, Placa, Selo, Vazio, useDados, lista, itemLista } from '../ui/base'

/** Ordens encerradas (entregues ou recusadas). */
export default function Historico() {
  const [q] = useSearchParams()
  const [busca, setBusca] = useState(q.get('placa') || '')
  const { dados, erro, carregando, recarregar } = useDados(() => api.ordens({ busca }), [busca])
  const encerradas = (dados || []).filter((o) => o.situacao !== 'aberta')

  return (
    <>
      <Cabecalho titulo="Histórico" sub="Serviços encerrados: entregues e orçamentos recusados.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Placa, cliente ou modelo" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </Cabecalho>
      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <Esqueleto className="h-80 !rounded-3xl" />}
      {dados && !encerradas.length && <Vazio icone={History} titulo="Nada no histórico ainda" texto={busca ? `Nenhum serviço encerrado para “${busca}”.` : 'As OS entregues aparecem aqui.'} />}
      <motion.ul className="space-y-2" variants={lista} initial="initial" animate="animate">
        {encerradas.map((o) => (
          <motion.li key={o.id} variants={itemLista}>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-linha bg-superficie/80 px-5 py-4">
              <Placa placa={o.placa} tamanho="m" />
              <Link to={`/oficina/ordens/${o.id}`} className="flex-1 min-w-[200px]">
                <span className="block font-bold">{nomeVeiculo(o)}</span>
                <span className="block text-[13.5px] text-tinta-3">nº {o.id} · {o.cliente_nome} · {o.problema_relatado}</span>
              </Link>
              <span className="text-right">
                <span className="block font-bold num">{moeda(o.total_aprovado)}</span>
                <span className="block text-[13px] text-tinta-3">{dataCurta(o.entregue_em || o.atualizado_em)}</span>
              </span>
              <Selo estado={o.etapa_atual} />
              {o.qtd_avarias > 0 && <Link to={`/oficina/inspecao/${o.id}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#9db2ff]"><ScanLine className="size-4" />{o.qtd_avarias} na inspeção</Link>}
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </>
  )
}
