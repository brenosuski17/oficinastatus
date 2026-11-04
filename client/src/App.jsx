import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth, areaDe } from './lib/auth'
import { Esqueleto } from './ui/base'
import Entrar from './acesso/Entrar'
import CriarSenha from './acesso/CriarSenha'
import LayoutOficina from './oficina/Layout'
import LayoutCliente from './cliente/Layout'

const Painel = lazy(() => import('./oficina/Painel'))
const Quadro = lazy(() => import('./oficina/Quadro'))
const Ordem = lazy(() => import('./oficina/Ordem'))
const NovaOrdem = lazy(() => import('./oficina/NovaOrdem'))
const Clientes = lazy(() => import('./oficina/Clientes'))
const Veiculos = lazy(() => import('./oficina/Veiculos'))
const Mensagens = lazy(() => import('./oficina/Mensagens'))
const Ajustes = lazy(() => import('./oficina/Ajustes'))
const Inspecoes = lazy(() => import('./oficina/Inspecoes'))
const Inspecao = lazy(() => import('./vistoria/Inspecao'))
const Orcamentos = lazy(() => import('./oficina/Orcamentos'))
const Servicos = lazy(() => import('./oficina/Servicos'))
const Historico = lazy(() => import('./oficina/Historico'))
const InicioCliente = lazy(() => import('./cliente/Inicio'))
const OrdemCliente = lazy(() => import('./cliente/OrdemCliente'))
const Acompanhar = lazy(() => import('./cliente/Acompanhar'))

function Carregando() {
  return <div className="p-8 space-y-4"><Esqueleto className="h-10 w-64" /><Esqueleto className="h-40" /><Esqueleto className="h-40" /></div>
}

/** Só deixa entrar quem tem um dos papéis; os outros vão para a área certa. */
function Protegida({ papeis, children }) {
  const { usuario, carregando } = useAuth()
  const local = useLocation()
  if (carregando) return <Carregando />
  if (!usuario) return <Navigate to="/entrar" replace state={{ voltar: local.pathname }} />
  if (!papeis.includes(usuario.papel)) return <Navigate to={areaDe(usuario)} replace />
  return children
}

function Inicio() {
  const { usuario, carregando } = useAuth()
  if (carregando) return <Carregando />
  return <Navigate to={usuario ? areaDe(usuario) : '/entrar'} replace />
}

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/criar-senha/:token" element={<CriarSenha />} />
        <Route path="/acompanhar/:codigo" element={<Acompanhar />} />

        <Route path="/oficina" element={<Protegida papeis={['admin', 'mecanico']}><LayoutOficina /></Protegida>}>
          <Route index element={<Painel />} />
          <Route path="patio" element={<Quadro />} />
          <Route path="quadro" element={<Navigate to="/oficina/patio" replace />} />
          <Route path="inspecao" element={<Inspecoes />} />
          <Route path="inspecao/:id" element={<Inspecao />} />
          <Route path="ordens/nova" element={<NovaOrdem />} />
          <Route path="ordens/:id" element={<Ordem />} />
          <Route path="orcamentos" element={<Orcamentos />} />
          <Route path="servicos" element={<Servicos />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="veiculos" element={<Veiculos />} />
          <Route path="mensagens" element={<Mensagens />} />
          <Route path="historico" element={<Historico />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="equipe" element={<Navigate to="/oficina/ajustes?aba=equipe" replace />} />
          <Route path="configuracoes" element={<Navigate to="/oficina/ajustes" replace />} />
        </Route>

        <Route path="/cliente" element={<Protegida papeis={['cliente']}><LayoutCliente /></Protegida>}>
          <Route index element={<InicioCliente />} />
          <Route path="ordens/:id" element={<OrdemCliente />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
