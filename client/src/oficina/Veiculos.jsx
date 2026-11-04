import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Search, Plus, Pencil, Trash2, CarFront, ScanLine, History, Phone } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dataCurta, nomeVeiculo, telefone } from '../lib/formato'
import { Botao, Cabecalho, ErroCarga, Esqueleto, Modal, Placa, Selo, Vazio, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'
import { corDaPintura } from '../vistoria/carrocerias'
import VeiculoForm from './VeiculoForm'

const CARROCERIA = { hatch: 'Hatch', sedan: 'Sedã', suv: 'SUV', picape: 'Picape' }

export default function Veiculos() {
  const { usuario } = useAuth()
  const avisar = useToast()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null)
  const { dados, erro, carregando, recarregar } = useDados(() => api.veiculos(busca), [busca])

  async function excluir(v) {
    if (!confirm(`Excluir o veículo ${v.placa}? As ordens de serviço dele também serão apagadas.`)) return
    try { await api.excluirVeiculo(v.id); recarregar(); avisar('Veículo excluído.') } catch (e) { avisar(e.message, 'erro') }
  }

  return (
    <>
      <p className="text-[12px] font-bold tracking-[0.16em] text-tinta-3">CADASTROS</p>
      <Cabecalho titulo="Veículos" sub={`${dados?.length ?? '—'} veículos cadastrados · clientes e placas`}>
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Novo veículo</Botao>
      </Cabecalho>
      <label className="relative block max-w-[520px] mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
        <input type="search" className="entrada !pl-10 !h-12" placeholder="Buscar por cliente, placa ou modelo" aria-label="Buscar veículos" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-60 !rounded-3xl" />)}</div>}
      {dados?.length === 0 && <Vazio icone={CarFront} titulo={busca ? 'Nenhum veículo encontrado' : 'Nenhum veículo ainda'} texto="Digite a placa em Nova OS para cadastrar." />}

      {dados?.length > 0 && (
        <motion.ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" variants={lista} initial="initial" animate="animate">
          {dados.map((v) => {
            const linkInspecao = v.os_aberta ? `/oficina/inspecao/${v.os_aberta}` : `/oficina/ordens/nova?placa=${v.placa}&inspecao=1`
            return (
              <motion.li key={v.id} variants={itemLista} className="rounded-3xl border border-linha bg-superficie/80 p-5 flex flex-col hover:border-linha-forte transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[17px] leading-snug truncate">{nomeVeiculo(v)}</p>
                    <p className="flex items-center gap-1.5 text-[13.5px] text-tinta-3 mt-0.5">
                      <span className="size-2.5 rounded-full ring-1 ring-white/20" style={{ background: corDaPintura(v.cor) }} />
                      {[v.ano_modelo, v.cor, v.quilometragem && `${v.quilometragem.toLocaleString('pt-BR')} km`].filter(Boolean).join(' · ') || CARROCERIA[v.carroceria]}
                    </p>
                  </div>
                  <Placa placa={v.placa} tamanho="m" />
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] mt-3">
                  <span className="font-semibold">{v.cliente_nome}</span>
                  <span className="flex items-center gap-1.5 text-tinta-3"><Phone className="size-3.5" />{telefone(v.cliente_telefone)}</span>
                </p>
                <div className="mt-4 rounded-2xl bg-white/[.03] border border-linha px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-[13.5px] text-tinta-2">
                    {v.ultima_os ? `Última inspeção ${dataCurta(v.ultima_os_data)}` : 'Sem inspeções'}
                    <span className="block text-tinta-3">{v.total_os} no histórico · {CARROCERIA[v.carroceria] || 'Hatch'}</span>
                  </span>
                  {v.ultima_os && <Selo estado={v.ultima_os_etapa} />}
                </div>
                <div className="mt-4 flex gap-2">
                  <Botao as={Link} to={linkInspecao} icone={ScanLine} className="flex-1">Inspeção 3D</Botao>
                  <Botao as={Link} to={`/oficina/historico?placa=${v.placa}`} variante="secundario" className="!px-3" aria-label={`Histórico de ${v.placa}`} title="Histórico"><History className="size-[18px]" /></Botao>
                  <Botao variante="secundario" className="!px-3" onClick={() => setEditando(v)} aria-label={`Editar ${v.placa}`} title="Editar"><Pencil className="size-[18px]" /></Botao>
                  {usuario.papel === 'admin' && <Botao variante="secundario" className="!px-3 hover:!text-erro" onClick={() => excluir(v)} aria-label={`Excluir ${v.placa}`} title="Excluir"><Trash2 className="size-[18px]" /></Botao>}
                </div>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      <Modal aberto={Boolean(editando)} aoFechar={() => setEditando(null)} titulo={`Editar ${editando?.placa || ''}`} largura="max-w-3xl">
        {editando && <VeiculoForm inicial={editando} aoSalvar={() => { setEditando(null); recarregar(); avisar('Veículo salvo.') }} />}
      </Modal>
    </>
  )
}
