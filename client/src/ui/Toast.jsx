import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleCheck, CircleAlert, X } from 'lucide-react'

const Ctx = createContext(() => {})

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([])
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItens((l) => [...l, { id, texto, tipo }].slice(-3)) // no máximo 3 avisos na tela
    setTimeout(() => setItens((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 6500 : 4000)
  }, [])
  const fechar = (id) => setItens((l) => l.filter((t) => t.id !== id))

  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        <AnimatePresence>
          {itens.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role={t.tipo === 'erro' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 w-full sm:w-96 rounded-xl px-4 py-3 shadow-xl text-[15px] font-medium text-white ${t.tipo === 'erro' ? 'bg-[#d92d20]' : 'bg-tinta'}`}
            >
              {t.tipo === 'erro' ? <CircleAlert className="size-5 shrink-0 mt-0.5" /> : <CircleCheck className="size-5 shrink-0 mt-0.5 text-[#4ade80]" />}
              <span className="flex-1">{t.texto}</span>
              <button onClick={() => fechar(t.id)} className="opacity-70 hover:opacity-100" aria-label="Fechar aviso"><X className="size-4" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
