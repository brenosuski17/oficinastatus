import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../lib/auth'
import Configuracoes from './Configuracoes'
import Equipe from './Equipe'

/** Ajustes: integrações e equipe em abas. */
export default function Ajustes() {
  const { usuario } = useAuth()
  const [q, setQ] = useSearchParams()
  const abas = [['integracoes', 'Integrações'], usuario.papel === 'admin' && ['equipe', 'Equipe']].filter(Boolean)
  const aba = abas.some(([k]) => k === q.get('aba')) ? q.get('aba') : 'integracoes'
  return (
    <>
      <div className="flex gap-1 mb-6 rounded-2xl bg-trilho p-1 w-fit" role="tablist">
        {abas.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setQ(k === 'integracoes' ? {} : { aba: k })}
            className={`relative h-10 px-5 rounded-xl text-[15px] font-bold ${aba === k ? 'text-white' : 'text-tinta-3 hover:text-tinta-2'}`}>
            {aba === k && <motion.span layoutId="aba-ajustes" className="absolute inset-0 rounded-xl bg-ultramar-600/30 ring-1 ring-ultramar-500/60" />}
            <span className="relative">{n}</span>
          </button>
        ))}
      </div>
      {aba === 'equipe' ? <Equipe /> : <Configuracoes />}
    </>
  )
}
