import { Link, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { primeiroNome } from '../lib/formato'
import { Avatar } from '../ui/base'

/** Área do cliente: tela leve, centralizada e pensada para o celular. */
export default function LayoutCliente() {
  const { usuario, sair } = useAuth()
  const local = useLocation()
  return (
    <div className="min-h-dvh bg-[radial-gradient(900px_420px_at_50%_-120px,#dfe5ff,transparent)]">
      <header className="sticky top-0 z-30 backdrop-blur bg-fundo/80 border-b border-linha/60">
        <div className="max-w-[640px] mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/cliente" className="flex items-center gap-2 font-extrabold text-[16px] mr-auto">
            <span className="grid place-items-center size-9 rounded-xl bg-ultramar-600 text-white text-[14px]">OS</span>
            Meus veículos
          </Link>
          <span className="hidden sm:block text-[14px] text-tinta-2">Olá, {primeiroNome(usuario.nome)}</span>
          <Avatar nome={usuario.nome} />
          <button onClick={sair} className="p-2 rounded-lg text-tinta-3 hover:text-tinta hover:bg-white" aria-label="Sair"><LogOut className="size-5" /></button>
        </div>
      </header>
      <main className="max-w-[640px] mx-auto px-4 py-6 pb-16">
        <AnimatePresence mode="wait">
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
