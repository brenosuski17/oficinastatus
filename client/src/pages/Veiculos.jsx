import { useState } from 'react'
import { api } from '../api'
import { Placa, useCarregar, Estado } from '../components'
import { TIPOS_VEICULO } from '../util'
import VeiculoForm from './VeiculoForm'

export default function Veiculos() {
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null) // null | {} (novo) | veículo
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.veiculos(busca), [busca])

  async function excluir(v) {
    if (!confirm(`Excluir o veículo ${v.placa}? As ordens de serviço dele também serão apagadas.`)) return
    await api.excluirVeiculo(v.id)
    recarregar()
  }

  return (
    <>
      <div className="cabecalho">
        <div><h1>Veículos</h1><p className="sub">Cadastro com valor de referência da tabela FIPE.</p></div>
        <div className="cabecalho-acoes">
          <input type="search" className="busca" placeholder="Buscar placa, modelo ou cliente" aria-label="Buscar veículos" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="botao botao-primario" onClick={() => setEditando({})}>Cadastrar veículo</button>
        </div>
      </div>

      {editando && (
        <section className="bloco">
          <h2>{editando.id ? `Editar ${editando.placa}` : 'Novo veículo'}</h2>
          <VeiculoForm
            key={editando.id || 'novo'}
            inicial={editando.id ? editando : undefined}
            aoSalvar={() => { setEditando(null); recarregar() }}
            aoCancelar={() => setEditando(null)}
          />
        </section>
      )}

      <Estado carregando={carregando && !dados} erro={erro} vazio={dados?.length === 0 && 'Nenhum veículo cadastrado ainda.'}>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Placa</th><th>Veículo</th><th>Cliente</th><th>Valor FIPE</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {dados?.map((v) => (
                <tr key={v.id}>
                  <td><Placa placa={v.placa} tamanho="p" /></td>
                  <td>
                    {v.marca.replace(/^.* - /, '')} {v.modelo}
                    <span className="sub bloco-linha">{TIPOS_VEICULO.find((t) => t.valor === v.tipo)?.nome} {v.ano_modelo || ''} {v.cor ? `· ${v.cor}` : ''}</span>
                  </td>
                  <td>{v.cliente_nome}</td>
                  <td>{v.fipe_valor || <span className="sub">Não consultado</span>}</td>
                  <td className="acoes-linha">
                    <button className="botao botao-p botao-sutil" onClick={() => setEditando(v)}>Editar</button>
                    <button className="botao botao-p botao-sutil" onClick={() => excluir(v)}>Excluir</button>
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
