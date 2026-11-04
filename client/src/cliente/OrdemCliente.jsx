import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { api } from '../lib/api'
import { ErroCarga, Esqueleto, useDados } from '../ui/base'
import { useToast } from '../ui/Toast'
import DetalheOS from './DetalheOS'

export default function OrdemCliente() {
  const { id } = useParams()
  const avisar = useToast()
  const { dados, erro, recarregar, setDados } = useDados(() => api.portal.ordem(id), [id])

  async function responder(d) {
    try {
      const r = await api.portal.responder(id, d)
      setDados(r)
      avisar(r.etapa_atual === 'recusada' ? 'Resposta enviada. A oficina foi avisada.' : 'Orçamento aprovado! A oficina já foi avisada.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { avisar(e.message, 'erro') }
  }

  return (
    <>
      <Link to="/cliente" className="inline-flex items-center gap-1 text-[14px] font-semibold text-tinta-2 mb-4"><ChevronLeft className="size-4" />Meus veículos</Link>
      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {!dados && !erro && <div className="space-y-4"><Esqueleto className="h-56" /><Esqueleto className="h-28" /></div>}
      {dados && <DetalheOS o={dados} aoResponder={responder} />}
    </>
  )
}
