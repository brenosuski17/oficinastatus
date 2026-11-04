import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Placa, useCarregar, Estado } from '../components'
import { ESTADOS, moeda, tempoDesde, dia } from '../util'

const COLUNAS = ['orcamento', 'aprovacao', 'aprovado', 'execucao', 'pronto']

function Ficha({ o }) {
  return (
    <li>
      <Link to={`/ordens/${o.id}`} className={`ficha ficha-${o.etapa_atual}`}>
        <span className="ficha-topo">
          <Placa placa={o.placa} tamanho="p" />
          <span className="ficha-os">OS {o.id}</span>
        </span>
        <span className="ficha-modelo">{o.marca.replace(/^.* - /, '')} {o.modelo}</span>
        <span className="ficha-cliente">{o.cliente_nome}</span>
        <span className="ficha-rodape">
          <span>{tempoDesde(o.atualizado_em)}</span>
          {o.orcamento_valor != null && <span>{moeda(o.orcamento_valor)}</span>}
          {o.previsao_entrega && o.etapa_atual === 'execucao' && <span>Entrega {dia(o.previsao_entrega)}</span>}
        </span>
      </Link>
    </li>
  )
}

export default function Quadro() {
  const [busca, setBusca] = useState('')
  const { dados: ordens, erro, carregando } = useCarregar(() => api.ordens({ busca }), [busca])
  const encerradas = (ordens || []).filter((o) => ['recusada', 'entregue'].includes(o.etapa_atual))

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Quadro da oficina</h1>
          <p className="sub">Onde está cada veículo agora.</p>
        </div>
        <div className="cabecalho-acoes">
          <input
            type="search"
            className="busca"
            placeholder="Buscar placa, cliente ou modelo"
            aria-label="Buscar ordens de serviço"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Link to="/ordens/nova" className="botao botao-primario">Abrir OS</Link>
        </div>
      </div>

      <Estado
        carregando={carregando && !ordens}
        erro={erro}
        vazio={ordens?.length === 0 && (busca
          ? <>Nenhuma OS encontrada para “{busca}”.</>
          : <>Nenhuma ordem de serviço ainda. <Link to="/ordens/nova">Abra a primeira OS</Link> quando um carro chegar.</>)}
      >
        <div className="quadro">
          {COLUNAS.map((col) => {
            const lista = (ordens || []).filter((o) => o.etapa_atual === col)
            return (
              <section key={col} className={`coluna coluna-${col}`} aria-labelledby={`col-${col}`}>
                <header>
                  <h2 id={`col-${col}`}>{ESTADOS[col].titulo}</h2>
                  <span className="coluna-total">{lista.length}</span>
                </header>
                <p className="coluna-dica">{ESTADOS[col].dica}</p>
                <ul className="fichas">
                  {lista.map((o) => <Ficha key={o.id} o={o} />)}
                </ul>
              </section>
            )
          })}
        </div>

        {encerradas.length > 0 && (
          <details className="encerradas">
            <summary>Encerradas ({encerradas.length})</summary>
            <table className="tabela">
              <thead><tr><th>OS</th><th>Placa</th><th>Cliente</th><th>Situação</th><th>Atualizada</th></tr></thead>
              <tbody>
                {encerradas.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/ordens/${o.id}`}>OS {o.id}</Link></td>
                    <td><Placa placa={o.placa} tamanho="p" /></td>
                    <td>{o.cliente_nome}</td>
                    <td>{ESTADOS[o.etapa_atual].titulo}</td>
                    <td>{tempoDesde(o.atualizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Estado>
    </>
  )
}
