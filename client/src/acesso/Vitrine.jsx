import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Placa } from '../ui/base'
import { Trilha } from '../ui/Trilha'

// Painel animado da tela de entrada: uma placa sendo "digitada" e a OS avançando pelas etapas.
const PLACAS = ['BRA2E19', 'MTZ4C21', 'QWE1234', 'RTY5F67']
const etapasDemo = (n) =>
  ['recebido', 'diagnostico', 'orcamento', 'aprovacao', 'execucao', 'pronto', 'entregue'].map((tipo, i) => ({
    tipo, status: i < n ? 'concluida' : i === n ? 'em_andamento' : 'pendente',
  }))

export default function Vitrine({ oficina }) {
  const [placa, setPlaca] = useState('')
  const [passo, setPasso] = useState(1)
  const [p, setP] = useState(0)

  // digitação da placa
  useEffect(() => {
    const alvo = PLACAS[p % PLACAS.length]
    if (placa.length < alvo.length) {
      const t = setTimeout(() => setPlaca(alvo.slice(0, placa.length + 1)), 110)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => { setPlaca(''); setP((x) => x + 1); setPasso(1) }, 5200)
    return () => clearTimeout(t)
  }, [placa, p])

  // etapas avançando
  useEffect(() => {
    if (placa.length < 7 || passo >= 5) return
    const t = setTimeout(() => setPasso((x) => x + 1), 900)
    return () => clearTimeout(t)
  }, [placa, passo])

  return (
    <div className="relative h-full overflow-hidden bg-[#1a2bd8] text-white flex flex-col">
      {/* fundo com brilho */}
      <div className="absolute -top-40 -left-32 size-[520px] rounded-full bg-[#5b74ff] blur-[120px] opacity-70" />
      <div className="absolute -bottom-48 -right-20 size-[480px] rounded-full bg-[#ff6a13] blur-[140px] opacity-40" />
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

      <div className="relative px-10 pt-10 flex items-center gap-3">
        <span className="grid place-items-center size-10 rounded-xl bg-white text-ultramar-600 font-extrabold text-lg">OS</span>
        <span className="text-[19px] font-extrabold tracking-tight">{oficina?.nome || 'OficinaStatus'}</span>
      </div>

      <div className="relative flex-1 flex flex-col justify-center px-10 xl:px-16 pb-10">
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[40px] xl:text-[52px] font-extrabold leading-[1.05] tracking-[-0.03em] max-w-[560px]">
          Cada etapa do conserto, em tempo real.
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }}
          className="mt-4 text-[18px] text-white/80 max-w-[480px]">
          A oficina atualiza, o cliente recebe o aviso e aprova o orçamento pelo celular. Sem ligações.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 30, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 120, damping: 18 }}
          className="mt-10 bg-white text-tinta rounded-3xl p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] max-w-[560px]">
          <div className="flex items-center justify-between gap-4">
            <Placa placa={placa} tamanho="g" />
            <div className="text-right">
              <p className="text-[13px] text-tinta-3 font-semibold">Ordem de serviço</p>
              <AnimatePresence mode="wait">
                <motion.p key={passo} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-[17px] font-bold">
                  {['Recebido', 'Em diagnóstico', 'Montando orçamento', 'Aguardando aprovação', 'Em execução', 'Pronto'][passo]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          <div className="mt-9">
            <Trilha key={p} etapas={etapasDemo(placa.length < 7 ? 0 : passo)} situacao="aberta" compacta />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
