import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { avisarMudanca } from '../App'
import { Placa, Campo, useCarregar } from '../components'
import VeiculoForm from './VeiculoForm'

export default function NovaOrdem() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [veiculo, setVeiculo] = useState(null)
  const [cadastrando, setCadastrando] = useState(false)
  const [os, setOs] = useState({ problema_relatado: '', previsao_entrega: '' })
  const [erro, setErro] = useState(null)
  const { dados: encontrados } = useCarregar(() => (busca.length >= 2 ? api.veiculos(busca) : Promise.resolve([])), [busca])

  async function abrir(e) {
    e.preventDefault()
    setErro(null)
    try {
      const nova = await api.criarOrdem({ ...os, veiculo_id: veiculo.id })
      avisarMudanca()
      navegar(`/ordens/${nova.id}`)
    } catch (err) {
      setErro(err.message)
    }
  }

  return (
    <>
      <div className="cabecalho"><div><h1>Abrir ordem de serviço</h1><p className="sub">O cliente recebe o link de acompanhamento assim que a OS é aberta.</p></div></div>

      <section className="bloco passo-form">
        <h2>1. Veículo</h2>
        {veiculo ? (
          <div className="escolhido">
            <Placa placa={veiculo.placa} />
            <div>
              <p className="forte">{veiculo.marca} {veiculo.modelo} {veiculo.ano_modelo || ''}</p>
              <p className="sub">{veiculo.cliente_nome}</p>
            </div>
            <button className="botao botao-sutil botao-p" onClick={() => setVeiculo(null)}>Trocar</button>
          </div>
        ) : cadastrando ? (
          <VeiculoForm
            placaInicial={/^[A-Z]{3}/.test(busca.toUpperCase()) ? busca.toUpperCase() : ''}
            aoSalvar={(v) => { setVeiculo(v); setCadastrando(false) }}
            aoCancelar={() => setCadastrando(false)}
          />
        ) : (
          <>
            <Campo rotulo="Buscar por placa, modelo ou nome do cliente" largo>
              <input type="search" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: BRA2E19" />
            </Campo>
            {encontrados?.length > 0 && (
              <ul className="resultados">
                {encontrados.map((v) => (
                  <li key={v.id}>
                    <button className="resultado" onClick={() => setVeiculo(v)}>
                      <Placa placa={v.placa} tamanho="p" />
                      <span>{v.marca.replace(/^.* - /, '')} {v.modelo}</span>
                      <span className="sub">{v.cliente_nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {busca.length >= 2 && encontrados?.length === 0 && <p className="sub">Nenhum veículo encontrado.</p>}
            <button className="botao" onClick={() => setCadastrando(true)}>Cadastrar novo veículo</button>
          </>
        )}
      </section>

      <form className={`bloco passo-form ${veiculo ? '' : 'inativo'}`} onSubmit={abrir} aria-disabled={!veiculo}>
        <h2>2. Problema relatado</h2>
        <Campo rotulo="O que o cliente relatou?" largo>
          <textarea required rows={3} disabled={!veiculo} value={os.problema_relatado} onChange={(e) => setOs({ ...os, problema_relatado: e.target.value })}
            placeholder="Ex.: barulho na suspensão dianteira ao passar em lombadas" />
        </Campo>
        <Campo rotulo="Previsão de entrega (opcional)">
          <input type="date" disabled={!veiculo} value={os.previsao_entrega} onChange={(e) => setOs({ ...os, previsao_entrega: e.target.value })} />
        </Campo>
        {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
        <div className="acao-botoes"><button className="botao botao-primario" disabled={!veiculo}>Abrir OS</button></div>
      </form>
    </>
  )
}
