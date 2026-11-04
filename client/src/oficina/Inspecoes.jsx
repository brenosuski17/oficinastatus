import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ScanLine, Search, Plus, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { nomeVeiculo, tempoDesde } from '../lib/formato'
import { Botao, Cabecalho, ErroCarga, Esqueleto, Placa, Selo, Vazio, useDados, lista, itemLista } from '../ui/base'

const EDITAVEL = ['recebido', 'diagnostico', 'orcamento', 'aprovacao']
const NOME_CARROCERIA = { hatch: 'Hatch', sedan: 'Sedã', suv: 'SUV', picape: 'Picape' }

/** Escolha do veículo para a inspeção 3D. */
export default function Inspecoes() {
  const [busca, setBusca] = useState('')
  const { dados, erro, carregando, recarregar } = useDados(() => api.ordens({ busca }), [busca])
  const abertas = (dados || []).filter((o) => o.situacao === 'aberta')
  const ordenadas = [...abertas].sort((a, b) => Number(EDITAVEL.includes(b.etapa_atual)) - Number(EDITAVEL.includes(a.etapa_atual)))

  return (
    <>
      <Cabecalho titulo="Inspeção 3D" sub="Escolha o veículo e marque as avarias direto no modelo 3D.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Placa, cliente ou modelo" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Receber veículo</Botao>
      </Cabecalho>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-48 !rounded-3xl" />)}</div>}
      {dados && !ordenadas.length && <Vazio icone={ScanLine} titulo="Nenhum veículo na oficina" texto="Receba um veículo para começar a inspeção." acao={<Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Receber veículo</Botao>} />}

      <motion.ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" variants={lista} initial="initial" animate="animate">
        {ordenadas.map((o) => {
          const pode = EDITAVEL.includes(o.etapa_atual)
          return (
            <motion.li key={o.id} variants={itemLista} className="rounded-3xl border border-linha bg-superficie/80 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-[17px] truncate">{nomeVeiculo(o)}</p>
                  <p className="text-[13.5px] text-tinta-3">{o.cliente_nome} · nº {o.id}</p>
                </div>
                <Placa placa={o.placa} tamanho="m" />
              </div>
              <div className="mt-4 rounded-2xl bg-white/[.03] border border-linha px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[13.5px] text-tinta-2">
                  {NOME_CARROCERIA[o.carroceria] || 'Hatch'} · {o.qtd_avarias} {o.qtd_avarias === 1 ? 'registro' : 'registros'}
                  <span className="block text-tinta-3">Atualizada {tempoDesde(o.atualizado_em)}</span>
                </span>
                <Selo estado={o.etapa_atual} />
              </div>
              <Botao as={Link} to={`/oficina/inspecao/${o.id}`} icone={pode ? ScanLine : Lock} variante={pode ? 'primario' : 'secundario'} className="mt-4">
                {pode ? 'Inspeção 3D' : 'Ver inspeção'}
              </Botao>
            </motion.li>
          )
        })}
      </motion.ul>
    </>
  )
}
