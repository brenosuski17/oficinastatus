import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Search, Plus, PackageSearch, Clock, Archive } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COLUNAS_QUADRO, ESTADOS } from '../lib/etapas'
import { moeda, nomeVeiculo, tempoDesde, dia, dataCurta } from '../lib/formato'
import { Avatar, Botao, Cabecalho, ErroCarga, Esqueleto, Placa, Selo, Vazio, useDados } from '../ui/base'
import { MiniTrilha } from '../ui/Trilha'

function Ficha({ o }) {
  const e = ESTADOS[o.etapa_atual]
  return (
    <motion.li layout layoutId={`os-${o.id}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
      <Link to={`/oficina/ordens/${o.id}`}
        className="group block rounded-2xl bg-superficie border border-linha p-4 shadow-[0_1px_2px_rgba(18,26,51,.04)] hover:shadow-[0_12px_28px_-12px_rgba(18,26,51,.25)] hover:-translate-y-0.5 transition-all relative overflow-hidden">
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: o.aguardando_peca ? 'var(--color-sinal)' : e.cor }} />
        <div className="flex items-center justify-between gap-2">
          <Placa placa={o.placa} tamanho="p" />
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-tinta-3 num">
            OS {o.id}
            {o.mecanico_nome && <Avatar nome={o.mecanico_nome} className="!size-6 !text-[10px]" />}
          </span>
        </div>
        <p className="font-bold text-[15px] leading-snug mt-3 line-clamp-2">{nomeVeiculo(o)}</p>
        <p className="text-[13.5px] text-tinta-2 mt-0.5 truncate">{o.cliente_nome}</p>
        {!o.mecanico_nome && <p className="mt-2 inline-flex rounded-lg bg-alerta-bg text-alerta px-2 py-0.5 text-[12px] font-bold">Sem responsável</p>}
        {o.aguardando_peca && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sinal-50 text-peca px-2 py-1 text-[12.5px] font-bold"><PackageSearch className="size-3.5" />Aguardando peça</p>
        )}
        <div className="mt-3"><MiniTrilha etapas={o.etapas} situacao={o.situacao} /></div>
        <div className="flex items-center justify-between mt-3 text-[12.5px] text-tinta-3">
          <span className="flex items-center gap-1"><Clock className="size-3.5" />{tempoDesde(o.atualizado_em)}</span>
          {o.total > 0 && <span className="font-bold text-tinta-2 num">{moeda(o.total_aprovado || o.total)}</span>}
        </div>
        {o.previsao_entrega && ['execucao', 'aprovado'].includes(o.etapa_atual) && (
          <p className="mt-2 text-[12.5px] font-semibold text-tinta-2">Entrega prevista: {dia(o.previsao_entrega)}</p>
        )}
      </Link>
    </motion.li>
  )
}

export default function Quadro() {
  const { usuario } = useAuth()
  const [busca, setBusca] = useState('')
  const [minhas, setMinhas] = useState(false)
  const { dados, erro, carregando, recarregar } = useDados(() => api.ordens({ busca }), [busca])

  const ordens = useMemo(() => (dados || []).filter((o) => !minhas || o.mecanico_id === usuario.id), [dados, minhas, usuario.id])
  const encerradas = ordens.filter((o) => o.situacao !== 'aberta')

  return (
    <>
      <Cabecalho titulo="Quadro da oficina" sub="Cada carro na etapa em que está. Clique para abrir a OS.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Placa, cliente ou modelo" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Botao variante={minhas ? 'primario' : 'secundario'} onClick={() => setMinhas((m) => !m)} aria-pressed={minhas}>Minhas OS</Botao>
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Abrir OS</Botao>
      </Cabecalho>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">{COLUNAS_QUADRO.map((c) => <Esqueleto key={c} className="h-80" />)}</div>}

      {dados && ordens.length === 0 && (
        <Vazio icone={Archive} titulo={busca ? `Nada encontrado para “${busca}”` : 'Nenhuma OS ainda'}
          texto={busca ? 'Confira a placa ou o nome do cliente.' : 'Quando um carro chegar, abra a ordem de serviço e ele aparece aqui.'}
          acao={!busca && <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Abrir a primeira OS</Botao>} />
      )}

      {dados && ordens.length > 0 && (
        <LayoutGroup>
          {/* celular: colunas deslizando para o lado · desktop: todas visíveis (3×2, ou 6 em telas largas) */}
          <div className="-mx-4 px-4 overflow-x-auto pb-4 snap-x snap-mandatory sm:mx-0 sm:px-0 sm:overflow-visible">
            <div className="grid grid-flow-col auto-cols-[82vw] gap-4 sm:grid-flow-row sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-6">
              {COLUNAS_QUADRO.map((col, ci) => {
                const e = ESTADOS[col]
                const lista = ordens.filter((o) => o.situacao === 'aberta' && o.etapa_atual === col)
                return (
                  <motion.section key={col} className="snap-start rounded-3xl bg-trilho p-3 min-h-[180px]" aria-labelledby={`c-${col}`}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05, type: 'spring', stiffness: 260, damping: 26 }}>
                    <header className="flex items-center gap-2.5 px-2 pt-1 pb-3">
                      <span className="grid place-items-center size-8 rounded-xl text-white" style={{ background: e.cor }}><e.icone className="size-4" /></span>
                      <h2 id={`c-${col}`} className="font-bold text-[15px] flex-1">{e.nome}</h2>
                      <span className="min-w-7 h-7 px-2 grid place-items-center rounded-full bg-superficie text-[13px] font-bold num">{lista.length}</span>
                    </header>
                    <ul className="space-y-3">
                      <AnimatePresence>{lista.map((o) => <Ficha key={o.id} o={o} />)}</AnimatePresence>
                    </ul>
                  </motion.section>
                )
              })}
            </div>
          </div>
        </LayoutGroup>
      )}

      {encerradas.length > 0 && (
        <details className="cartao mt-6 group">
          <summary className="cursor-pointer select-none px-6 py-4 font-bold flex items-center gap-2"><Archive className="size-5 text-tinta-3" />Encerradas ({encerradas.length})</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-[14.5px]">
              <thead className="text-left text-tinta-3 text-[13px]"><tr><th className="px-6 py-2 font-semibold">OS</th><th className="py-2 font-semibold">Placa</th><th className="py-2 font-semibold">Veículo</th><th className="py-2 font-semibold">Situação</th><th className="py-2 font-semibold">Valor</th><th className="py-2 pr-6 font-semibold">Data</th></tr></thead>
              <tbody>
                {encerradas.map((o) => (
                  <tr key={o.id} className="border-t border-linha hover:bg-fundo">
                    <td className="px-6 py-3"><Link to={`/oficina/ordens/${o.id}`} className="font-bold text-ultramar-600">OS {o.id}</Link></td>
                    <td><Placa placa={o.placa} tamanho="p" /></td>
                    <td className="pr-4">{nomeVeiculo(o)}<span className="block text-tinta-3 text-[13px]">{o.cliente_nome}</span></td>
                    <td><Selo estado={o.etapa_atual} /></td>
                    <td className="num font-semibold">{moeda(o.total_aprovado)}</td>
                    <td className="pr-6 text-tinta-3">{dataCurta(o.entregue_em || o.atualizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  )
}
