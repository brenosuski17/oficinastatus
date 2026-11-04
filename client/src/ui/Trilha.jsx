import { motion } from 'motion/react'
import { Car, Check, X, PackageSearch } from 'lucide-react'
import { ETAPAS, indiceAtual } from '../lib/etapas'
import { dataHora } from '../lib/formato'

/**
 * A "estrada" da OS: 7 paradas e o carro andando até a etapa atual.
 * É o elemento que identifica o sistema — aparece para a oficina e para o cliente.
 */
export function Trilha({ etapas, situacao, aguardandoPeca, compacta = false }) {
  const idx = indiceAtual(etapas, situacao)
  const recusada = situacao === 'recusada'
  const pct = (Math.min(idx, 6) / 6) * 100
  const corAtual = recusada ? 'var(--color-recusada)' : ETAPAS[Math.min(Math.floor(idx), 6)].cor

  return (
    <div className="relative select-none" aria-label="Andamento da ordem de serviço">
      <div className="relative mx-[calc(100%/14)]">
        {/* pista */}
        <div className={`absolute left-0 right-0 ${compacta ? 'top-[15px]' : 'top-[21px]'} h-[6px] rounded-full bg-trilho overflow-hidden`}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: recusada ? 'var(--color-recusada)' : 'linear-gradient(90deg, #7a5af8, #0ba5ec 35%, #f5a300 55%, #ff6a13 75%, #12b76a)' , backgroundSize: '600px 100%' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />
        </div>
        {/* carro */}
        {situacao !== 'finalizada' && (
          <motion.div
            className={`absolute z-20 ${compacta ? '-top-[22px]' : '-top-[26px]'} -translate-x-1/2`}
            initial={{ left: '0%' }}
            animate={{ left: `${pct}%` }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <motion.span
              className="grid place-items-center size-7 rounded-full text-white shadow-lg"
              style={{ background: corAtual }}
              animate={aguardandoPeca ? { rotate: [0, -6, 6, 0] } : { y: [0, -2, 0] }}
              transition={{ repeat: Infinity, duration: aguardandoPeca ? 1.4 : 1.8, ease: 'easeInOut' }}
            >
              {aguardandoPeca ? <PackageSearch className="size-4" /> : <Car className="size-4" />}
            </motion.span>
          </motion.div>
        )}
      </div>

      <ol className="relative grid grid-cols-7">
        {ETAPAS.map((e, i) => {
          const et = etapas.find((x) => x.tipo === e.tipo) || {}
          const st = et.status || 'pendente'
          const ativa = st === 'em_andamento'
          const feita = st === 'concluida'
          const negada = st === 'recusada'
          const Icone = e.icone
          return (
            <li key={e.tipo} className="flex flex-col items-center text-center min-w-0" aria-current={ativa ? 'step' : undefined}>
              <motion.span
                className={`relative z-10 grid place-items-center rounded-full border-[3px] ${compacta ? 'size-9' : 'size-12'} ${feita || ativa || negada ? 'text-white' : 'text-tinta-3 bg-superficie border-linha-forte'}`}
                style={feita || ativa ? { background: e.cor, borderColor: 'white', boxShadow: ativa ? `0 0 0 5px color-mix(in srgb, ${e.cor} 22%, transparent)` : undefined } : negada ? { background: 'var(--color-recusada)', borderColor: 'white' } : undefined}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 400, damping: 22 }}
              >
                {feita ? <Check className={compacta ? 'size-4' : 'size-5'} strokeWidth={3} /> : negada ? <X className="size-5" strokeWidth={3} /> : <Icone className={compacta ? 'size-4' : 'size-5'} />}
              </motion.span>
              <span className={`mt-2 text-[12px] sm:text-[13px] font-bold leading-tight ${compacta ? "whitespace-nowrap" : "truncate max-w-full"} ${ativa ? 'text-tinta' : feita ? 'text-tinta-2' : 'text-tinta-3'} ${compacta && !ativa ? 'hidden sm:block' : ''}`}>{e.nome}</span>
              {!compacta && (
                <span className="hidden md:block text-[11.5px] text-tinta-3 mt-0.5 num">
                  {feita || negada ? dataHora(et.concluida_em) : ativa ? 'agora' : ''}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Mini barra de progresso para cards do quadro e listas. */
export function MiniTrilha({ etapas, situacao }) {
  const idx = indiceAtual(etapas, situacao)
  return (
    <div className="flex gap-1" aria-hidden="true">
      {ETAPAS.map((e, i) => {
        const st = etapas[i]?.status
        const cheio = st === 'concluida' || i < idx
        const ativa = st === 'em_andamento'
        return (
          <span key={e.tipo} className="h-1.5 flex-1 rounded-full overflow-hidden bg-trilho">
            <motion.span className="block h-full rounded-full" style={{ background: st === 'recusada' ? 'var(--color-recusada)' : e.cor }}
              initial={{ width: 0 }} animate={{ width: cheio || st === 'recusada' ? '100%' : ativa ? '55%' : '0%' }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
          </span>
        )
      })}
    </div>
  )
}

/** Linha do tempo vertical com observações (detalhes da OS). */
export function LinhaDoTempo({ etapas }) {
  return (
    <ol className="relative">
      {ETAPAS.map((e, i) => {
        const et = etapas.find((x) => x.tipo === e.tipo) || {}
        const st = et.status || 'pendente'
        const Icone = e.icone
        const marcado = st !== 'pendente'
        return (
          <motion.li key={e.tipo} className="relative flex gap-4 pb-6 last:pb-0"
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            {i < 6 && <span className="absolute left-[17px] top-10 bottom-1 w-[2px] rounded" style={{ background: st === 'concluida' ? e.cor : '#e3e7f1' }} />}
            <span className={`relative grid place-items-center size-9 shrink-0 rounded-full ${marcado ? 'text-white' : 'bg-superficie border-2 border-linha-forte text-tinta-3'}`}
              style={marcado ? { background: st === 'recusada' ? 'var(--color-recusada)' : e.cor } : undefined}>
              {st === 'concluida' ? <Check className="size-4" strokeWidth={3} /> : st === 'recusada' ? <X className="size-4" strokeWidth={3} /> : <Icone className="size-4" />}
              {st === 'em_andamento' && <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: e.cor }} />}
            </span>
            <div className="pt-1.5 min-w-0">
              <p className={`font-bold ${marcado ? '' : 'text-tinta-3'}`}>{e.nome}</p>
              <p className="text-[13px] text-tinta-3 num">
                {st === 'concluida' && `Concluída em ${dataHora(et.concluida_em)}`}
                {st === 'em_andamento' && `Em andamento desde ${dataHora(et.iniciada_em)}`}
                {st === 'recusada' && `Recusada em ${dataHora(et.concluida_em)}`}
                {st === 'pendente' && 'Aguardando'}
              </p>
              {et.observacao && <p className="text-[14px] text-tinta-2 mt-1">{et.observacao}</p>}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
