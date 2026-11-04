import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { LogIn, SearchX } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Botao, Esqueleto, useDados } from '../ui/base'
import { useToast } from '../ui/Toast'
import DetalheOS from './DetalheOS'

/** Página aberta pelo link enviado ao cliente: acompanha e aprova sem precisar de senha. */
export default function Acompanhar() {
  const { codigo } = useParams()
  const { usuario } = useAuth()
  const avisar = useToast()
  const { dados, erro, setDados } = useDados(() => api.publico.ordem(codigo), [codigo])

  async function responder(d) {
    try {
      const r = await api.publico.responder(codigo, d)
      setDados(r)
      avisar(r.etapa_atual === 'recusada' ? 'Resposta enviada. A oficina foi avisada.' : 'Orçamento aprovado! A oficina já foi avisada.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { avisar(e.message, 'erro') }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(900px_420px_at_50%_-120px,#dfe5ff,transparent)]">
      <header className="max-w-[640px] mx-auto px-4 h-16 flex items-center justify-between">
        <span className="flex items-center gap-2 font-extrabold">
          <span className="grid place-items-center size-9 rounded-xl bg-ultramar-600 text-white text-[14px]">OS</span>
          {dados?.oficina?.nome || 'OficinaStatus'}
        </span>
        {!usuario && <Botao as={Link} to="/entrar" variante="fantasma" tamanho="p" icone={LogIn}>Entrar</Botao>}
        {usuario?.papel === 'cliente' && <Botao as={Link} to="/cliente" variante="fantasma" tamanho="p">Meus veículos</Botao>}
      </header>
      <main className="max-w-[640px] mx-auto px-4 pb-16">
        {erro && (
          <motion.div className="cartao p-8 text-center mt-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <SearchX className="size-10 mx-auto text-tinta-3" />
            <h1 className="text-[22px] font-extrabold mt-3">Não encontramos esta OS</h1>
            <p className="text-tinta-2 mt-1">Confira o link recebido ou fale com a oficina.</p>
          </motion.div>
        )}
        {!dados && !erro && <div className="space-y-4 mt-2"><Esqueleto className="h-56" /><Esqueleto className="h-28" /></div>}
        {dados && <DetalheOS o={dados} aoResponder={responder} />}
      </main>
    </div>
  )
}
