import { useEffect, useId, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutGrid, ScanLine, Car, FileText, Wrench, History, Settings, LogOut, Plus, KanbanSquare, MessagesSquare, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar } from '../ui/base'

export const avisarMudanca = () => window.dispatchEvent(new Event('os:mudou'))

/** Marca: um "olho" estilizado sobre o carro (inspeção). */
export function Marca({ className = 'size-9' }) {
  const id = useId().replace(/:/g, '') // cada logo com o próprio gradiente (um oculto não apaga o outro)
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d88ff" /><stop offset="1" stopColor="#2b4cff" /></linearGradient>
      </defs>
      <path d="M4 23c3-7 9-11 16-11s13 4 16 11" fill="none" stroke={`url(#${id})`} strokeWidth="3.2" strokeLinecap="round" />
      <ellipse cx="20" cy="25" rx="15" ry="6.5" fill="none" stroke={`url(#${id})`} strokeWidth="3.2" />
      <circle cx="20" cy="22" r="4.2" fill="#9db2ff" />
    </svg>
  )
}

export default function LayoutOficina() {
  const { usuario, sair } = useAuth()
  const local = useLocation()
  const [pendentes, setPendentes] = useState(0)
  const admin = usuario.papel === 'admin'
  const telaCheia = /\/oficina\/inspecao\/\d+/.test(local.pathname)

  useEffect(() => {
    const atualizar = () => api.mensagens({ status: 'pendente' }).then((l) => setPendentes(l.length)).catch(() => {})
    atualizar()
    const t = setInterval(atualizar, 30000)
    window.addEventListener('os:mudou', atualizar)
    return () => { clearInterval(t); window.removeEventListener('os:mudou', atualizar) }
  }, [])

  const itens = [
    admin && { para: '/oficina', fim: true, nome: 'Geral', icone: LayoutGrid },
    { para: '/oficina/patio', nome: 'Pátio', icone: KanbanSquare },
    { para: '/oficina/inspecao', nome: 'Inspeção', icone: ScanLine },
    { para: '/oficina/veiculos', nome: 'Veículos', icone: Car },
    { para: '/oficina/orcamentos', nome: 'Orçamentos', icone: FileText },
    { para: '/oficina/servicos', nome: 'Serviços', icone: Wrench },
    { para: '/oficina/mensagens', nome: 'Mensagens', icone: MessagesSquare, contador: pendentes },
    { para: '/oficina/clientes', nome: 'Clientes', icone: Users },
    { para: '/oficina/historico', nome: 'Histórico', icone: History },
    { para: '/oficina/ajustes', nome: 'Ajustes', icone: Settings },
  ].filter(Boolean)

  return (
    <div className="tema-escuro min-h-dvh lg:grid lg:grid-cols-[92px_1fr] bg-[radial-gradient(1200px_600px_at_70%_-200px,rgba(61,91,255,.16),transparent)]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-superficie focus:px-4 focus:py-2 focus:rounded-lg">Pular para o conteúdo</a>

      {/* Trilho lateral com ícones e rótulos */}
      <aside className="hidden lg:flex flex-col items-center sticky top-0 h-dvh border-r border-linha bg-[#060a1c]/80 backdrop-blur py-4 overflow-y-auto">
        <Link to={admin ? '/oficina' : '/oficina/patio'} className="mb-3" aria-label="Início"><Marca className="size-11" /></Link>
        <Link to="/oficina/ordens/nova" title="Abrir OS" aria-label="Abrir OS"
          className="grid place-items-center size-11 rounded-2xl bg-ultramar-600 text-white shadow-[0_8px_24px_-6px_rgba(61,91,255,.9)] hover:bg-ultramar-500 mb-4">
          <Plus className="size-5" />
        </Link>
        <nav className="flex flex-col items-center gap-1 w-full px-2" aria-label="Principal">
          {itens.map((i) => (
            <NavLink key={i.para} to={i.para} end={i.fim}
              className={({ isActive }) => `relative w-full flex flex-col items-center gap-1 py-2.5 rounded-2xl text-[11.5px] font-semibold transition-colors ${isActive ? 'text-white' : 'text-tinta-3 hover:text-tinta hover:bg-white/5'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="trilho-ativo" className="absolute inset-0 rounded-2xl bg-ultramar-600/20 ring-1 ring-ultramar-500/60 shadow-[0_0_24px_-6px_rgba(61,91,255,.8)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <i.icone className="relative size-[21px]" />
                  <span className="relative">{i.nome}</span>
                  {i.contador > 0 && <span className="absolute top-1.5 right-3 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-sinal text-white text-[11px] font-bold num">{i.contador}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-4 flex flex-col items-center gap-2">
          <Avatar nome={usuario.nome} className="!bg-ultramar-600 !text-white" />
          <button onClick={sair} className="p-2 rounded-lg text-tinta-3 hover:text-white hover:bg-white/10" aria-label="Sair" title="Sair"><LogOut className="size-[18px]" /></button>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-[#060a1c]/90 backdrop-blur border-b border-linha px-4 h-14">
        <span className="flex items-center gap-2 font-extrabold"><Marca className="size-8" />OficinaStatus</span>
        <button onClick={sair} className="p-2 rounded-lg text-tinta-3" aria-label="Sair"><LogOut className="size-5" /></button>
      </header>

      <main id="conteudo" className={`min-w-0 ${telaCheia ? '' : 'px-4 sm:px-8 pt-6 sm:pt-8 pb-28 lg:pb-12 max-w-[1500px]'}`}>
        <AnimatePresence mode="wait">
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#060a1c]/95 backdrop-blur border-t border-linha grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label="Principal">
        {[['/oficina/patio', 'Pátio', KanbanSquare], ['/oficina/inspecao', 'Inspeção', ScanLine], ['/oficina/ordens/nova', 'Nova OS', Plus], ['/oficina/veiculos', 'Veículos', Car], ['/oficina/mensagens', 'Mensagens', MessagesSquare]].map(([para, nome, Icone]) => (
          <NavLink key={para} to={para}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 h-16 text-[11.5px] font-semibold ${isActive ? 'text-[#9db2ff]' : 'text-tinta-3'}`}>
            {nome === 'Nova OS'
              ? <span className="grid place-items-center size-11 -mt-5 rounded-2xl bg-ultramar-600 text-white shadow-lg"><Plus className="size-6" /></span>
              : <Icone className="size-[22px]" />}
            {nome !== 'Nova OS' && nome}
            {nome === 'Mensagens' && pendentes > 0 && <span className="absolute top-2 right-[calc(50%-20px)] size-4 grid place-items-center rounded-full bg-sinal text-white text-[10px] num">{pendentes}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
