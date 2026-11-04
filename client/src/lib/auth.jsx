import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, token } from './api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [estado, setEstado] = useState({ usuario: null, carregando: Boolean(token.ler()) })

  useEffect(() => {
    if (!token.ler()) return
    api.auth.eu()
      .then((usuario) => setEstado({ usuario, carregando: false }))
      .catch(() => { token.salvar(null); setEstado({ usuario: null, carregando: false }) })
  }, [])

  useEffect(() => {
    const sair = () => setEstado({ usuario: null, carregando: false })
    window.addEventListener('sessao:expirou', sair)
    return () => window.removeEventListener('sessao:expirou', sair)
  }, [])

  const entrar = useCallback(({ token: t, usuario }) => {
    token.salvar(t)
    setEstado({ usuario, carregando: false })
  }, [])
  const sair = useCallback(() => {
    token.salvar(null)
    setEstado({ usuario: null, carregando: false })
  }, [])

  return <Ctx.Provider value={{ ...estado, entrar, sair }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
export const areaDe = (u) => (u?.papel === 'cliente' ? '/cliente' : '/oficina')
