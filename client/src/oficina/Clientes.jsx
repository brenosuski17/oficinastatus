import { useState } from 'react'
import { motion } from 'motion/react'
import { Search, UserPlus, Pencil, Trash2, KeyRound, Users, Mail, Phone, Copy, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { telefone } from '../lib/formato'
import { Avatar, Botao, Cabecalho, Campo, ErroCarga, Esqueleto, Modal, Vazio, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'

function ClienteForm({ inicial, aoSalvar }) {
  const avisar = useToast()
  const [c, setC] = useState({ nome: '', telefone: '', email: '', cpf: '', ...inicial })
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value })
  async function enviar(e) {
    e.preventDefault()
    setSalvando(true)
    try { aoSalvar(await api.salvarCliente(c)) } catch (err) { avisar(err.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Nome completo"><input className="entrada" required autoFocus value={c.nome} onChange={set('nome')} /></Campo>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="WhatsApp com DDD" dica="Recebe os avisos de cada etapa"><input className="entrada" type="tel" inputMode="tel" required placeholder="(42) 99999-9999" value={telefone(c.telefone)} onChange={set('telefone')} /></Campo>
        <Campo rotulo="CPF (opcional)"><input className="entrada num" inputMode="numeric" value={c.cpf || ''} onChange={set('cpf')} /></Campo>
      </div>
      <Campo rotulo="E-mail" dica="Com e-mail, o cliente recebe os avisos por e-mail e ganha acesso ao portal."><input className="entrada" type="email" value={c.email || ''} onChange={set('email')} /></Campo>
      <Botao type="submit" carregando={salvando}>{c.id ? 'Salvar alterações' : 'Cadastrar cliente'}</Botao>
    </form>
  )
}

export default function Clientes() {
  const { usuario } = useAuth()
  const avisar = useToast()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null)
  const [convite, setConvite] = useState(null)
  const { dados, erro, carregando, recarregar } = useDados(() => api.clientes(busca), [busca])

  async function excluir(c) {
    if (!confirm(`Excluir ${c.nome}? Os veículos e as ordens de serviço dele também serão apagados.`)) return
    try { await api.excluirCliente(c.id); recarregar(); avisar('Cliente excluído.') } catch (e) { avisar(e.message, 'erro') }
  }
  async function convidar(c) {
    try { const r = await api.conviteCliente(c.id); setConvite({ ...r, nome: c.nome }) } catch (e) { avisar(e.message, 'erro') }
  }

  return (
    <>
      <Cabecalho titulo="Clientes" sub="Quem recebe os avisos e acessa o portal.">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Nome, telefone ou e-mail" aria-label="Buscar clientes" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Botao icone={UserPlus} onClick={() => setEditando({})}>Novo cliente</Botao>
      </Cabecalho>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-40" />)}</div>}
      {dados?.length === 0 && <Vazio icone={Users} titulo={busca ? 'Ninguém encontrado' : 'Nenhum cliente ainda'} texto="Os clientes também podem ser cadastrados ao abrir uma OS." />}

      {dados?.length > 0 && (
        <motion.ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" variants={lista} initial="initial" animate="animate">
          {dados.map((c) => (
            <motion.li key={c.id} variants={itemLista} className="cartao p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <Avatar nome={c.nome} className="!size-11 !text-[14px]" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[16px] truncate">{c.nome}</p>
                  <p className="text-[13.5px] text-tinta-3">{c.total_veiculos} {c.total_veiculos === 1 ? 'veículo' : 'veículos'}</p>
                </div>
                {c.email && (c.tem_acesso
                  ? <span className="rounded-full bg-[#ecfdf3] text-[#067647] text-[12px] font-bold px-2.5 py-1">Portal ativo</span>
                  : <span className="rounded-full bg-fundo text-tinta-3 text-[12px] font-bold px-2.5 py-1">Sem senha</span>)}
              </div>
              <div className="mt-4 space-y-1.5 text-[14.5px] text-tinta-2">
                <p className="flex items-center gap-2"><Phone className="size-4 text-tinta-3" />{telefone(c.telefone)}</p>
                <p className="flex items-center gap-2 truncate"><Mail className="size-4 text-tinta-3 shrink-0" />{c.email || <span className="text-tinta-3">Sem e-mail</span>}</p>
              </div>
              <div className="flex gap-1 mt-4 pt-4 border-t border-linha">
                <Botao variante="fantasma" tamanho="p" icone={Pencil} onClick={() => setEditando(c)}>Editar</Botao>
                {c.email && <Botao variante="fantasma" tamanho="p" icone={KeyRound} onClick={() => convidar(c)}>Acesso</Botao>}
                {usuario.papel === 'admin' && <Botao variante="fantasma" tamanho="p" icone={Trash2} className="ml-auto hover:!text-recusada" onClick={() => excluir(c)} aria-label={`Excluir ${c.nome}`} />}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal aberto={Boolean(editando)} aoFechar={() => setEditando(null)} titulo={editando?.id ? 'Editar cliente' : 'Novo cliente'}>
        {editando && <ClienteForm inicial={editando} aoSalvar={() => { setEditando(null); recarregar(); avisar('Cliente salvo.') }} />}
      </Modal>

      <Modal aberto={Boolean(convite)} aoFechar={() => setConvite(null)} titulo="Acesso ao portal">
        {convite && (
          <div className="space-y-4">
            <p className="text-tinta-2">Link para <strong className="text-tinta">{convite.nome}</strong> criar a senha. Vale por 7 dias.</p>
            {convite.email_enviado && <p className="rounded-xl bg-[#ecfdf3] text-[#067647] px-4 py-3 font-semibold">Enviado por e-mail.</p>}
            <p className="rounded-xl bg-fundo px-4 py-3 text-[14px] break-all font-mono">{convite.link_convite}</p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" icone={Copy} onClick={() => navigator.clipboard?.writeText(convite.link_convite).then(() => avisar('Link copiado.'))}>Copiar</Botao>
              <Botao as="a" href={convite.link_whatsapp} target="_blank" rel="noreferrer" variante="whats" icone={Send}>Enviar pelo WhatsApp</Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
