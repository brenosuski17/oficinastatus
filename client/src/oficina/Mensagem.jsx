import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MessageCircle, Check, CheckCheck, CircleAlert, Clock, RotateCcw, Inbox, MousePointerClick } from 'lucide-react'
import { api } from '../lib/api'
import { dataHora } from '../lib/formato'
import { ETAPAS } from '../lib/etapas'
import { Botao, Placa } from '../ui/base'
import { useToast } from '../ui/Toast'

/** Uma mensagem do histórico, com o resultado real do envio (enfileirada, enviada, falha ou respondida). */
export default function Mensagem({ m, aoMudar, mostrarOS }) {
  const avisar = useToast()
  const [ocupado, setOcupado] = useState(false)
  const entrada = m.direcao === 'entrada'
  const Icone = m.canal === 'email' ? Mail : entrada ? Inbox : MessageCircle

  const status = entrada
    ? { texto: m.canal === 'telegram' ? 'Recebida pelo bot' : 'Resposta do cliente', cor: 'text-ultramar-600', icone: Inbox }
    : m.status === 'falha' ? { texto: 'Falhou', cor: 'text-recusada', icone: CircleAlert }
    : m.status === 'respondida' ? { texto: `Respondida ${dataHora(m.respondida_em)}`, cor: 'text-ultramar-600', icone: CheckCheck }
    : m.status === 'enviada' ? { texto: `Enviada ${dataHora(m.enviada_em)}`, cor: 'text-pronto', icone: Check }
    : { texto: 'Na fila', cor: 'text-aprovacao', icone: Clock }

  const quem = entrada
    ? (m.remetente || 'Cliente')
    : m.canal === 'email' ? m.destinatario : 'Telegram'
  const semVinculo = m.erro_codigo === 'sem_vinculo'

  async function reenviar() {
    setOcupado(true)
    try {
      const r = await api.reenviar(m.canal, m.id)
      if (r.status === 'falha') avisar(`Falhou de novo: ${r.erro_descricao}`, 'erro')
      else avisar(r.status === 'enfileirada' ? 'Mensagem de volta na fila.' : 'Mensagem reenviada.')
      aoMudar?.()
    } catch (e) { avisar(e.message, 'erro') } finally { setOcupado(false) }
  }

  return (
    <li className={`rounded-2xl border p-4 ${entrada ? 'bg-ultramar-50 border-ultramar-100' : m.status === 'falha' ? 'bg-erro-bg border-erro-borda' : m.status === 'enfileirada' ? 'bg-alerta-bg border-alerta-borda' : 'bg-superficie border-linha'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <span className={`grid place-items-center size-7 rounded-lg ${m.canal === 'email' ? 'bg-ultramar-100 text-ultramar-700' : entrada ? 'bg-superficie text-ultramar-600' : 'bg-ok-bg text-ok'}`}><Icone className="size-4" /></span>
        {Boolean(m.teste) && <span className="rounded-full bg-fundo text-tinta-2 font-bold px-2.5 py-0.5">Teste</span>}
        {mostrarOS && m.ordem_id && <><Placa placa={m.placa} tamanho="p" /><Link to={`/oficina/ordens/${m.ordem_id}`} className="font-bold text-ultramar-600">OS {m.ordem_id}</Link></>}
        {mostrarOS && m.cliente_nome && <span className="font-semibold">{m.cliente_nome}</span>}
        <span className="font-semibold text-tinta-2">{quem}</span>
        {m.etapa_tipo && <span className="text-tinta-3">{ETAPAS.find((e) => e.tipo === m.etapa_tipo)?.nome}</span>}
        {Boolean(m.com_botoes) && <span className="inline-flex items-center gap-1 text-tinta-3"><MousePointerClick className="size-3.5" />Com botões</span>}
        <span className={`ml-auto inline-flex items-center gap-1 font-bold ${status.cor}`}><status.icone className="size-3.5" />{status.texto}</span>
      </div>
      {m.assunto && !entrada && <p className="font-bold mt-3">{m.assunto}</p>}
      <p className="text-[14.5px] text-tinta-2 whitespace-pre-line mt-1 max-w-[75ch] break-words">{m.conteudo}</p>
      {m.status === 'falha' && <p className="text-[13px] text-erro mt-2">Motivo: {m.erro_descricao}{m.erro_codigo && !semVinculo ? ` (código ${m.erro_codigo})` : ''}</p>}
      {m.status === 'falha' && !entrada && (
        <div className="flex gap-2 mt-3"><Botao variante="secundario" tamanho="p" icone={RotateCcw} carregando={ocupado} onClick={reenviar}>Tentar de novo</Botao></div>
      )}
    </li>
  )
}
