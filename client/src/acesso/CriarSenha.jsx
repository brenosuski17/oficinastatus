import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth, areaDe } from '../lib/auth'
import { Botao, Campo, Esqueleto, useDados } from '../ui/base'
import { primeiroNome } from '../lib/formato'

export default function CriarSenha() {
  const { token } = useParams()
  const { entrar } = useAuth()
  const navegar = useNavigate()
  const { dados: convite, erro: erroConvite, carregando } = useDados(() => api.auth.convite(token), [token])
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (senha !== conf) return setErro('As senhas não conferem.')
    setEnviando(true)
    setErro(null)
    try {
      const r = await api.auth.definirSenha(token, senha)
      entrar(r)
      navegar(areaDe(r.usuario), { replace: true })
    } catch (err) {
      setErro(err.message)
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-12 bg-[radial-gradient(1200px_500px_at_50%_-10%,#dfe5ff,transparent)]">
      <motion.div className="cartao w-full max-w-[440px] p-8" initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <span className="grid place-items-center size-12 rounded-2xl bg-ultramar-600 text-white mb-5"><KeyRound className="size-6" /></span>
        {carregando ? (
          <div className="space-y-3"><Esqueleto className="h-8 w-2/3" /><Esqueleto className="h-5" /></div>
        ) : erroConvite ? (
          <>
            <h1 className="text-[24px] font-extrabold">Link inválido ou expirado</h1>
            <p className="text-tinta-2 mt-2">Peça um novo link à oficina ou use “Receber link por e-mail” na tela de entrada.</p>
            <Botao as={Link} to="/entrar" variante="secundario" className="mt-6">Ir para a entrada</Botao>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-extrabold tracking-tight">Olá, {primeiroNome(convite.nome)}!</h1>
            <p className="text-tinta-2 mt-1.5">
              {convite.tem_senha ? 'Escolha sua nova senha.' : convite.papel === 'cliente' ? 'Crie sua senha para acompanhar seus veículos e aprovar orçamentos.' : 'Crie sua senha para acessar o sistema da oficina.'}
            </p>
            <p className="mt-4 text-[14px] text-tinta-3">E-mail de acesso: <strong className="text-tinta">{convite.email}</strong></p>
            <form onSubmit={enviar} className="space-y-4 mt-6">
              <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres.">
                <input className="entrada" type="password" minLength={8} required autoFocus autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </Campo>
              <Campo rotulo="Repita a senha">
                <input className="entrada" type="password" minLength={8} required autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
              </Campo>
              {erro && <p className="rounded-xl bg-[#fef3f2] text-[#b42318] px-4 py-3 text-[14.5px]" role="alert">{erro}</p>}
              <Botao type="submit" tamanho="g" className="w-full" carregando={enviando}>Salvar senha e entrar</Botao>
            </form>
          </>
        )}
      </motion.div>
    </main>
  )
}
