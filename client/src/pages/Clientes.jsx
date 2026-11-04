import { useState } from 'react'
import { api } from '../api'
import { useCarregar, Estado, Campo } from '../components'
import { telefone } from '../util'

function ClienteForm({ inicial, aoSalvar, aoCancelar }) {
  const [c, setC] = useState(inicial?.id ? inicial : { nome: '', telefone: '', email: '' })
  const [erro, setErro] = useState(null)
  async function enviar(e) {
    e.preventDefault()
    try { aoSalvar(await api.salvarCliente(c)) } catch (err) { setErro(err.message) }
  }
  return (
    <form className="form" onSubmit={enviar}>
      <div className="linha linha-3">
        <Campo rotulo="Nome completo"><input required value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp com DDD" dica="As notificações vão para este número">
          <input required type="tel" inputMode="tel" placeholder="(42) 99999-9999" value={c.telefone} onChange={(e) => setC({ ...c, telefone: e.target.value })} />
        </Campo>
        <Campo rotulo="E-mail (opcional)"><input type="email" value={c.email || ''} onChange={(e) => setC({ ...c, email: e.target.value })} /></Campo>
      </div>
      {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
      <div className="acao-botoes">
        <button className="botao botao-primario">{c.id ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
        <button type="button" className="botao botao-sutil" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Clientes() {
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null)
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.clientes(busca), [busca])

  async function excluir(c) {
    if (!confirm(`Excluir ${c.nome}? Os veículos e ordens de serviço dele também serão apagados.`)) return
    await api.excluirCliente(c.id)
    recarregar()
  }

  return (
    <>
      <div className="cabecalho">
        <div><h1>Clientes</h1><p className="sub">Quem recebe as notificações de cada OS.</p></div>
        <div className="cabecalho-acoes">
          <input type="search" className="busca" placeholder="Buscar nome ou telefone" aria-label="Buscar clientes" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="botao botao-primario" onClick={() => setEditando({})}>Cadastrar cliente</button>
        </div>
      </div>

      {editando && (
        <section className="bloco">
          <h2>{editando.id ? `Editar ${editando.nome}` : 'Novo cliente'}</h2>
          <ClienteForm key={editando.id || 'novo'} inicial={editando} aoSalvar={() => { setEditando(null); recarregar() }} aoCancelar={() => setEditando(null)} />
        </section>
      )}

      <Estado carregando={carregando && !dados} erro={erro} vazio={dados?.length === 0 && 'Nenhum cliente cadastrado ainda.'}>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>WhatsApp</th><th>E-mail</th><th>Veículos</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {dados?.map((c) => (
                <tr key={c.id}>
                  <td className="forte">{c.nome}</td>
                  <td>{telefone(c.telefone)}</td>
                  <td>{c.email || <span className="sub">—</span>}</td>
                  <td>{c.total_veiculos}</td>
                  <td className="acoes-linha">
                    <button className="botao botao-p botao-sutil" onClick={() => setEditando(c)}>Editar</button>
                    <button className="botao botao-p botao-sutil" onClick={() => excluir(c)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </>
  )
}
