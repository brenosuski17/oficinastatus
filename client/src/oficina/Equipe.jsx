import { useState } from 'react'
import { motion } from 'motion/react'
import { UserPlus, Copy, KeyRound, ShieldCheck, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar, Botao, Cabecalho, Campo, ErroCarga, Modal, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'

export default function Equipe() {
  const { usuario } = useAuth()
  const avisar = useToast()
  const { dados, erro, recarregar } = useDados(() => api.equipe(), [])
  const [novo, setNovo] = useState(null)
  const [convite, setConvite] = useState(null)
  const [salvando, setSalvando] = useState(false)

  async function adicionar(e) {
    e.preventDefault()
    setSalvando(true)
    try { const r = await api.addMembro(novo); setNovo(null); setConvite({ ...r, nome: r.usuario.nome }); recarregar() } catch (err) { avisar(err.message, 'erro') } finally { setSalvando(false) }
  }
  async function alternar(m, campo, valor) {
    try { await api.editMembro(m.id, { [campo]: valor }); recarregar() } catch (err) { avisar(err.message, 'erro') }
  }
  async function novoLink(m) {
    try { const r = await api.conviteMembro(m.id); setConvite({ ...r, nome: m.nome }) } catch (err) { avisar(err.message, 'erro') }
  }

  return (
    <>
      <Cabecalho titulo="Equipe" sub="Quem acessa o sistema. Mecânicos veem só as OS deles e as sem responsável.">
        <Botao icone={UserPlus} onClick={() => setNovo({ nome: '', email: '', papel: 'mecanico' })}>Adicionar pessoa</Botao>
      </Cabecalho>
      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {dados && (
        <motion.ul className="cartao divide-y divide-linha" variants={lista} initial="initial" animate="animate">
          {dados.map((m) => (
            <motion.li key={m.id} variants={itemLista} className={`flex flex-wrap items-center gap-4 p-5 ${m.ativo ? '' : 'opacity-55'}`}>
              <Avatar nome={m.nome} className="!size-11 !text-[14px]" />
              <div className="flex-1 min-w-[200px]">
                <p className="font-bold">{m.nome} {m.id === usuario.id && <span className="text-tinta-3 font-medium">(você)</span>}</p>
                <p className="text-[14px] text-tinta-3">{m.email}{!m.tem_senha && ' · ainda não criou a senha'}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${m.papel === 'admin' ? 'bg-ultramar-50 text-ultramar-700' : 'bg-sinal-50 text-[#c4410a]'}`}>
                {m.papel === 'admin' ? <ShieldCheck className="size-4" /> : <Wrench className="size-4" />}{m.papel === 'admin' ? 'Administrador' : 'Mecânico'}
              </span>
              <span className="text-[14px] text-tinta-2 num w-28">{m.os_abertas} OS abertas</span>
              {m.id !== usuario.id && (
                <div className="flex gap-1">
                  <Botao variante="fantasma" tamanho="p" icone={KeyRound} onClick={() => novoLink(m)}>Link de acesso</Botao>
                  <Botao variante="fantasma" tamanho="p" onClick={() => alternar(m, 'papel', m.papel === 'admin' ? 'mecanico' : 'admin')}>{m.papel === 'admin' ? 'Tornar mecânico' : 'Tornar admin'}</Botao>
                  <Botao variante="fantasma" tamanho="p" onClick={() => alternar(m, 'ativo', !m.ativo)}>{m.ativo ? 'Desativar' : 'Reativar'}</Botao>
                </div>
              )}
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal aberto={Boolean(novo)} aoFechar={() => setNovo(null)} titulo="Adicionar pessoa à equipe">
        {novo && (
          <form onSubmit={adicionar} className="space-y-4">
            <Campo rotulo="Nome"><input className="entrada" required autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
            <Campo rotulo="E-mail"><input className="entrada" type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Campo>
            <Campo rotulo="Função">
              <select className="entrada" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}>
                <option value="mecanico">Mecânico</option><option value="admin">Administrador</option>
              </select>
            </Campo>
            <Botao type="submit" carregando={salvando}>Adicionar e gerar link</Botao>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(convite)} aoFechar={() => setConvite(null)} titulo="Link de acesso">
        {convite && (
          <div className="space-y-4">
            <p className="text-tinta-2">Envie para <strong className="text-tinta">{convite.nome}</strong> criar a senha. Vale por 7 dias.</p>
            {convite.email_enviado && <p className="rounded-xl bg-[#ecfdf3] text-[#067647] px-4 py-3 font-semibold">Também enviado por e-mail.</p>}
            <p className="rounded-xl bg-fundo px-4 py-3 text-[14px] break-all font-mono">{convite.link_convite}</p>
            <Botao variante="secundario" icone={Copy} onClick={() => navigator.clipboard?.writeText(convite.link_convite).then(() => avisar('Link copiado.'))}>Copiar link</Botao>
          </div>
        )}
      </Modal>
    </>
  )
}
