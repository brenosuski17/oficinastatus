import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Search, Plus, Pencil, Trash2, CarFront, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { nomeVeiculo } from '../lib/formato'
import { Botao, Cabecalho, ErroCarga, Esqueleto, Modal, Placa, Vazio, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'
import VeiculoForm from './VeiculoForm'

const TIPO = { cars: 'Carro', motorcycles: 'Moto', trucks: 'Caminhão' }

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
      <Cabecalho titulo="Veículos" sub="Cadastro com valor de referência da tabela FIPE.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Placa, modelo ou dono" aria-label="Buscar veículos" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Cadastrar pela placa</Botao>
      </Cabecalho>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-44" />)}</div>}
      {dados?.length === 0 && <Vazio icone={CarFront} titulo={busca ? 'Nenhum veículo encontrado' : 'Nenhum veículo ainda'} texto="Digite a placa em Nova OS para cadastrar." />}

      {dados?.length > 0 && (
        <motion.ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" variants={lista} initial="initial" animate="animate">
          {dados.map((v) => (
            <motion.li key={v.id} variants={itemLista} className="cartao p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <Placa placa={v.placa} tamanho="m" />
                {v.os_aberta
                  ? <Link to={`/oficina/ordens/${v.os_aberta}`} className="inline-flex items-center gap-1 rounded-full bg-sinal-50 text-[#c4410a] text-[12.5px] font-bold px-2.5 py-1"><Wrench className="size-3.5" />Na oficina</Link>
                  : <span className="text-[12.5px] font-semibold text-tinta-3">{TIPO[v.tipo]}</span>}
              </div>
              <p className="font-bold text-[16px] mt-4 leading-snug">{nomeVeiculo(v)}</p>
              <p className="text-[14px] text-tinta-2">{[v.ano_modelo, v.cor, v.quilometragem && `${v.quilometragem.toLocaleString('pt-BR')} km`].filter(Boolean).join(' · ')}</p>
              <p className="text-[14px] text-tinta-3 mt-1">Dono: {v.cliente_nome}</p>
              <div className="mt-4 rounded-xl bg-fundo px-4 py-3 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-tinta-3">Valor FIPE</span>
                {v.fipe_valor ? <span className="font-extrabold num">{v.fipe_valor}</span> : <span className="text-[13.5px] text-tinta-3">não consultado</span>}
              </div>
              <div className="flex gap-1 mt-4 pt-4 border-t border-linha">
                <Botao variante="fantasma" tamanho="p" icone={Pencil} onClick={() => setEditando(v)}>Editar</Botao>
                {usuario.papel === 'admin' && <Botao variante="fantasma" tamanho="p" icone={Trash2} className="ml-auto hover:!text-recusada" onClick={() => excluir(v)} aria-label={`Excluir ${v.placa}`} />}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal aberto={Boolean(editando)} aoFechar={() => setEditando(null)} titulo={`Editar ${editando?.placa || ''}`} largura="max-w-3xl">
        {editando && <VeiculoForm inicial={editando} aoSalvar={() => { setEditando(null); recarregar(); avisar('Veículo salvo.') }} />}
      </Modal>
    </>
  )
}
