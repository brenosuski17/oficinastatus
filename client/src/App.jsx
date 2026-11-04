import { NavLink, Outlet, Route, Routes, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from './api'
import Quadro from './pages/Quadro'
import Ordem from './pages/Ordem'
import NovaOrdem from './pages/NovaOrdem'
import Clientes from './pages/Clientes'
import Veiculos from './pages/Veiculos'
import Mensagens from './pages/Mensagens'
import Acompanhar from './pages/Acompanhar'

function Painel() {
  const [pendentes, setPendentes] = useState(0)
  useEffect(() => {
    const atualizar = () => api.resumo().then((r) => setPendentes(r.mensagens_pendentes)).catch(() => {})
    atualizar()
    window.addEventListener('os:mudou', atualizar)
    return () => window.removeEventListener('os:mudou', atualizar)
  }, [])

  return (
    <div className="painel">
      <a className="pular" href="#conteudo">Pular para o conteúdo</a>
      <header className="lateral">
        <Link to="/" className="marca">
          <span className="marca-icone" aria-hidden="true" />
          OficinaStatus
        </Link>
        <nav aria-label="Principal">
          <NavLink to="/" end>Quadro</NavLink>
          <NavLink to="/ordens/nova">Nova OS</NavLink>
          <NavLink to="/mensagens">
            Mensagens
            {pendentes > 0 && <span className="contador" aria-label={`${pendentes} para enviar`}>{pendentes}</span>}
          </NavLink>
          <NavLink to="/veiculos">Veículos</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
        </nav>
      </header>
      <main id="conteudo" className="conteudo">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/acompanhar/:codigo" element={<Acompanhar />} />
      <Route element={<Painel />}>
        <Route index element={<Quadro />} />
        <Route path="/ordens/nova" element={<NovaOrdem />} />
        <Route path="/ordens/:id" element={<Ordem />} />
        <Route path="/mensagens" element={<Mensagens />} />
        <Route path="/veiculos" element={<Veiculos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="*" element={<p className="vazio">Página não encontrada. <Link to="/">Voltar ao quadro</Link></p>} />
      </Route>
    </Routes>
  )
}

/** Avisa o painel que algo mudou (atualiza o contador de mensagens). */
export const avisarMudanca = () => window.dispatchEvent(new Event('os:mudou'))
