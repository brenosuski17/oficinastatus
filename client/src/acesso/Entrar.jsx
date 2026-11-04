import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { LogIn, Mail, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth, areaDe } from '../lib/auth'
import { Botao, Campo } from '../ui/base'
import Vitrine from './Vitrine'

export default function Entrar() {
  const { usuario, entrar } = useAuth()
  const navegar = useNavigate()
  const local = useLocation()
  const [estado, setEstado] = useState(null)
  const [modo, setModo] = useState('entrar') // entrar | esqueci | configurar
  const [f, setF] = useState({ nome: '', email: '', senha: '' })
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.auth.estado().then((e) => { setEstado(e); if (e.precisa_configurar) setModo('configurar') }).catch(() => setEstado({}))
  }, [])

  if (usuario) return <Navigate to={local.state?.voltar || areaDe(usuario)} replace />

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      if (modo === 'esqueci') {
        await api.auth.esqueci(f.email)
        setAviso('Se o e-mail estiver cadastrado, você vai receber um link para criar ou redefinir a senha.')
      } else {
        const r = modo === 'configurar' ? await api.auth.configurar(f) : await api.auth.login(f)
        entrar(r)
        navegar(local.state?.voltar || areaDe(r.usuario), { replace: true })
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const titulos = {
    entrar: ['Entrar', 'Acesse a área da oficina ou acompanhe seus veículos.'],
    esqueci: ['Recuperar acesso', 'Enviamos um link para você criar uma nova senha.'],
    configurar: ['Configurar a oficina', 'Primeiro acesso: crie a conta do administrador.'],
  }[modo]

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:block"><Vitrine oficina={estado?.oficina} /></div>

      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <motion.div className="w-full max-w-[420px] mx-auto" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="grid place-items-center size-10 rounded-xl bg-ultramar-600 text-white font-extrabold">OS</span>
            <span className="text-[18px] font-extrabold">{estado?.oficina?.nome || 'OficinaStatus'}</span>
          </div>

          <h1 className="text-[32px] font-extrabold tracking-[-0.02em]">{titulos[0]}</h1>
          <p className="text-tinta-2 mt-1.5 mb-8">{titulos[1]}</p>

          <form onSubmit={enviar} className="space-y-4">
            {modo === 'configurar' && (
              <Campo rotulo="Seu nome"><input className="entrada" required autoComplete="name" value={f.nome} onChange={set('nome')} /></Campo>
            )}
            <Campo rotulo="E-mail">
              <input className="entrada" type="email" required autoComplete="email" autoFocus value={f.email} onChange={set('email')} placeholder="voce@email.com" />
            </Campo>
            {modo !== 'esqueci' && (
              <Campo rotulo="Senha" dica={modo === 'configurar' ? 'Pelo menos 8 caracteres.' : undefined}>
                <input className="entrada" type="password" required minLength={modo === 'configurar' ? 8 : undefined}
                  autoComplete={modo === 'configurar' ? 'new-password' : 'current-password'} value={f.senha} onChange={set('senha')} />
              </Campo>
            )}

            {erro && <p className="rounded-xl bg-[#fef3f2] text-[#b42318] px-4 py-3 text-[14.5px]" role="alert">{erro}</p>}
            {aviso && <p className="rounded-xl bg-[#ecfdf3] text-[#067647] px-4 py-3 text-[14.5px]" role="status">{aviso}</p>}

            <Botao type="submit" tamanho="g" className="w-full" carregando={enviando}
              icone={modo === 'esqueci' ? Mail : modo === 'configurar' ? ShieldCheck : LogIn}>
              {modo === 'esqueci' ? 'Enviar link' : modo === 'configurar' ? 'Criar conta e entrar' : 'Entrar'}
            </Botao>
          </form>

          {modo !== 'configurar' && (
            <p className="mt-6 text-[14.5px] text-tinta-2">
              {modo === 'entrar' ? (
                <>Primeiro acesso ou esqueceu a senha?{' '}
                  <button className="font-semibold text-ultramar-600 hover:underline" onClick={() => { setModo('esqueci'); setErro(null) }}>Receber link por e-mail</button></>
              ) : (
                <button className="font-semibold text-ultramar-600 hover:underline" onClick={() => { setModo('entrar'); setErro(null); setAviso(null) }}>Voltar para o login</button>
              )}
            </p>
          )}

          <p className="mt-10 pt-6 border-t border-linha text-[13.5px] text-tinta-3">
            Cliente: o link enviado pela oficina abre o acompanhamento do seu veículo, mesmo sem login.
          </p>
        </motion.div>
      </main>
    </div>
  )
}
