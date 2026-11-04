import { useState } from 'react'
import { motion } from 'motion/react'
import { MessagesSquare } from 'lucide-react'
import { api } from '../lib/api'
import { Cabecalho, ErroCarga, Esqueleto, Vazio, useDados } from '../ui/base'
import Mensagem from './Mensagem'

const FILTROS = [['', 'Todas'], ['pendente', 'Para enviar'], ['falhou', 'Com falha'], ['enviada', 'Enviadas'], ['recebida', 'Respostas']]

export default function Mensagens() {
  const [status, setStatus] = useState('')
  const { dados, erro, carregando, recarregar } = useDados(() => api.mensagens({ status }), [status])

  return (
    <>
      <Cabecalho titulo="Mensagens" sub="Avisos de cada etapa enviados aos clientes, com o resultado real de cada envio.">
        <div className="flex gap-1 rounded-2xl bg-[#e6e9f2] p-1 overflow-x-auto" role="tablist">
          {FILTROS.map(([v, n]) => (
            <button key={v} role="tab" aria-selected={status === v} onClick={() => setStatus(v)}
              className={`relative h-9 px-3.5 rounded-xl text-[14px] font-bold whitespace-nowrap ${status === v ? 'text-tinta' : 'text-tinta-3 hover:text-tinta-2'}`}>
              {status === v && <motion.span layoutId="filtro-msg" className="absolute inset-0 rounded-xl bg-white shadow-sm" />}
              <span className="relative">{n}</span>
            </button>
          ))}
        </div>
      </Cabecalho>
      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="space-y-3">{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-32" />)}</div>}
      {dados?.length === 0 && <Vazio icone={MessagesSquare} titulo={status === 'pendente' ? 'Tudo enviado' : 'Nenhuma mensagem aqui'} />}
      {dados?.length > 0 && <ul className="space-y-3 max-w-4xl">{dados.map((m) => <Mensagem key={m.id} m={m} aoMudar={recarregar} mostrarOS />)}</ul>}
    </>
  )
}
