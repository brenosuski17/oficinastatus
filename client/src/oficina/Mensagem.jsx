import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MessageCircle, Check, CircleAlert, Clock, RotateCcw, Send, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import { dataHora, telefone } from '../lib/formato'
import { ETAPAS } from '../lib/etapas'
import { Botao, Placa } from '../ui/base'
import { useToast } from '../ui/Toast'
import { avisarMudanca } from './Layout'

/** Uma mensagem enviada (ou a enviar) ao cliente, com o status real do envio. */
export default function Mensagem({ m, aoMudar, mostrarOS }) {
  const avisar = useToast()
  const [ocupado, setOcupado] = useState(false)
  const entrada = m.direcao === 'entrada'
  const Icone = entrada ? Inbox : m.canal === 'email' ? Mail : MessageCircle

  const status = entrada
    ? { texto: 'Resposta do cliente', cor: 'text-ultramar-600', icone: Inbox }
    : m.status === 'enviada' ? { texto: `Enviada ${dataHora(m.enviada_em)}`, cor: 'text-pronto', icone: Check }
    : m.status === 'falhou' ? { texto: 'Falhou', cor: 'text-recusada', icone: CircleAlert }
    : { texto: m.link_envio ? 'Para enviar' : 'Enviando…', cor: 'text-aprovacao', icone: Clock }

  async function manual() {
    try { await api.marcarEnviada(m.id); aoMudar?.(); avisarMudanca() } catch (e) { avisar(e.message, 'erro') }
  }
  async function reenviar() {
    setOcupado(true)
    try {
      const r = await api.reenviar(m.id)
      avisar(r.status === 'enviada' ? 'Mensagem reenviada.' : `Falhou de novo: ${r.erro}`, r.status === 'enviada' ? 'ok' : 'erro')
      aoMudar?.()
    } catch (e) { avisar(e.message, 'erro') } finally { setOcupado(false) }
  }

  return (
    <li className={`rounded-2xl border p-4 ${entrada ? 'bg-ultramar-50 border-ultramar-100' : m.status === 'falhou' ? 'bg-[#fffafa] border-[#f5c2bd]' : m.status === 'pendente' && m.link_envio ? 'bg-[#fffbeb] border-[#f8e0a0]' : 'bg-white border-linha'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <span className={`grid place-items-center size-7 rounded-lg ${m.canal === 'email' ? 'bg-ultramar-100 text-ultramar-700' : entrada ? 'bg-white text-ultramar-600' : 'bg-[#dcfae6] text-[#067647]'}`}><Icone className="size-4" /></span>
        {mostrarOS && <><Placa placa={m.placa} tamanho="p" /><Link to={`/oficina/ordens/${m.ordem_id}`} className="font-bold text-ultramar-600">OS {m.ordem_id}</Link><span className="font-semibold">{m.cliente_nome}</span></>}
        <span className="font-semibold text-tinta-2">{entrada ? 'Cliente' : m.canal === 'email' ? m.destinatario : `WhatsApp ${telefone(m.destinatario)}`}</span>
        {m.etapa_tipo && <span className="text-tinta-3">{ETAPAS.find((e) => e.tipo === m.etapa_tipo)?.nome}</span>}
        <span className={`ml-auto inline-flex items-center gap-1 font-bold ${status.cor}`}><status.icone className="size-3.5" />{status.texto}</span>
      </div>
      {m.assunto && !entrada && <p className="font-bold mt-3">{m.assunto}</p>}
      <p className="text-[14.5px] text-tinta-2 whitespace-pre-line mt-1 max-w-[75ch]">{m.conteudo}</p>
      {m.status === 'falhou' && <p className="text-[13px] text-[#b42318] mt-2">Motivo: {m.erro}</p>}
      <div className="flex gap-2 mt-3 empty:hidden">
        {m.link_envio && !entrada && (
          <Botao as="a" href={m.link_envio} target="_blank" rel="noreferrer" variante={m.status === 'enviada' ? 'secundario' : 'whats'} tamanho="p" icone={Send} onClick={manual}>
            {m.status === 'enviada' ? 'Abrir no WhatsApp de novo' : 'Enviar pelo WhatsApp'}
          </Botao>
        )}
        {m.status === 'falhou' && !m.link_envio && <Botao variante="secundario" tamanho="p" icone={RotateCcw} carregando={ocupado} onClick={reenviar}>Tentar de novo</Botao>}
      </div>
    </li>
  )
}
