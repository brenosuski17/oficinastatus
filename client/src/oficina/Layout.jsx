import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutDashboard, KanbanSquare, Plus, MessagesSquare, Car, Users, HardHat, Settings, LogOut } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar } from '../ui/base'

export const avisarMudanca = () => window.dispatchEvent(new Event('os:mudou'))

export default function LayoutOficina() {
  const { usuario, sair } = useAuth()
  const local = useLocation()
  const [pendentes, setPendentes] = useState(0)
  const [oficina, setOficina] = useState(null)
  const admin = usuario.papel === 'admin'

  useEffect(() => {
    const atualizar = () => api.mensagens({ status: 'pendente' }).then((l) => setPendentes(l.length)).catch(() => {})
    atualizar()
    api.integracoes().then((i) => setOficina(i.oficina)).catch(() => {})
    const t = setInterval(atualizar, 30000)
    window.addEventListener('os:mudou', atualizar)
    return () => { clearInterval(t); window.removeEventListener('os:mudou', atualizar) }
  }, [])

  const itens = [
    admin && { para: '/oficina', fim: true, nome: 'Painel', icone: LayoutDashboard },
    { para: '/oficina/quadro', nome: 'Quadro', icone: KanbanSquare },
    { para: '/oficina/ordens/nova', nome: 'Nova OS', icone: Plus },
    { para: '/oficina/mensagens', nome: 'Mensagens', icone: MessagesSquare, contador: pendentes },
    { para: '/oficina/veiculos', nome: 'Veículos', icone: Car },
    { para: '/oficina/clientes', nome: 'Clientes', icone: Users },
    admin && { para: '/oficina/equipe', nome: 'Equipe', icone: HardHat },
    { para: '/oficina/configuracoes', nome: 'Integrações', icone: Settings },
  ].filter(Boolean)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg">Pular para o conteúdo</a>

      {/* Barra lateral (desktop) */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-dvh bg-[#0f1838] text-white px-4 py-6">
        <Link to={admin ? '/oficina' : '/oficina/quadro'} className="flex items-center gap-2.5 px-2 mb-8">
          <span className="grid place-items-center size-9 rounded-xl bg-ultramar-600 font-extrabold text-[15px] shadow-[0_6px_18px_-4px_rgba(61,91,255,.8)]">OS</span>
          <span className="font-extrabold text-[16px] leading-tight truncate">{oficina?.nome || 'OficinaStatus'}</span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Principal">
          {itens.map((i) => (
            <NavLink key={i.para} to={i.para} end={i.fim}
              className={({ isActive }) => `relative flex items-center gap-3 px-3 h-11 rounded-xl text-[15px] font-semibold transition-colors ${isActive ? 'text-white' : 'text-[#aab3d4] hover:text-white hover:bg-white/5'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-ativo" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <i.icone className="relative size-[19px]" />
                  <span className="relative flex-1">{i.nome}</span>
                  {i.contador > 0 && <span className="relative min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-sinal text-[12px] font-bold num">{i.contador}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <Avatar nome={usuario.nome} className="!bg-ultramar-600 !text-white" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[14px] truncate">{usuario.nome}</p>
            <p className="text-[12.5px] text-[#aab3d4]">{admin ? 'Administrador' : 'Mecânico'}</p>
          </div>
          <button onClick={sair} className="p-2 rounded-lg text-[#aab3d4] hover:text-white hover:bg-white/10" aria-label="Sair"><LogOut className="size-[18px]" /></button>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-[#0f1838] text-white px-4 h-14">
        <span className="flex items-center gap-2 font-extrabold"><span className="grid place-items-center size-8 rounded-lg bg-ultramar-600 text-[13px]">OS</span>{oficina?.nome || 'OficinaStatus'}</span>
        <button onClick={sair} className="p-2 rounded-lg text-[#aab3d4]" aria-label="Sair"><LogOut className="size-5" /></button>
      </header>

      <main id="conteudo" className="min-w-0 px-4 sm:px-8 pt-6 sm:pt-8 pb-28 lg:pb-12 max-w-[1440px]">
        <AnimatePresence mode="wait">
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-linha grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label="Principal">
        {[itens.find((i) => i.nome === 'Quadro'), itens.find((i) => i.nome === 'Mensagens'), itens.find((i) => i.nome === 'Nova OS'), itens.find((i) => i.nome === 'Veículos'), itens.find((i) => i.nome === 'Clientes')].map((i) => (
          <NavLink key={i.para} to={i.para} end={i.fim}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 h-16 text-[11.5px] font-semibold ${isActive ? 'text-ultramar-600' : 'text-tinta-3'}`}>
            {i.nome === 'Nova OS'
              ? <span className="grid place-items-center size-11 -mt-5 rounded-2xl bg-ultramar-600 text-white shadow-lg"><Plus className="size-6" /></span>
              : <i.icone className="size-[22px]" />}
            {i.nome !== 'Nova OS' && i.nome}
            {i.contador > 0 && <span className="absolute top-2 right-[calc(50%-20px)] size-4 grid place-items-center rounded-full bg-sinal text-white text-[10px] num">{i.contador}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
