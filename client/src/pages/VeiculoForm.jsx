import { useEffect, useState } from 'react'
import { api } from '../api'
import { Campo } from '../components'
import { TIPOS_VEICULO, telefone } from '../util'

/** Seleção de cliente com opção de cadastrar um novo na hora. */
function ClienteCampo({ valor, aoMudar }) {
  const [clientes, setClientes] = useState([])
  const [novo, setNovo] = useState(null)
  const [erro, setErro] = useState(null)
  useEffect(() => { api.clientes().then(setClientes) }, [])

  async function salvarNovo() {
    setErro(null)
    try {
      const c = await api.salvarCliente(novo)
      setClientes(await api.clientes())
      aoMudar(c.id)
      setNovo(null)
    } catch (e) {
      setErro(e.message)
    }
  }

  if (novo)
    return (
      <fieldset className="subform">
        <legend>Novo cliente</legend>
        <div className="linha">
          <Campo rotulo="Nome completo">
            <input autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="WhatsApp com DDD">
            <input type="tel" inputMode="tel" placeholder="(42) 99999-9999" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
          </Campo>
        </div>
        {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
        <div className="acao-botoes">
          <button type="button" className="botao botao-primario" onClick={salvarNovo}>Salvar cliente</button>
          <button type="button" className="botao botao-sutil" onClick={() => setNovo(null)}>Cancelar</button>
        </div>
      </fieldset>
    )

  return (
    <Campo rotulo="Cliente (dono do veículo)" largo>
      <div className="com-botao">
        <select required value={valor || ''} onChange={(e) => aoMudar(Number(e.target.value))}>
          <option value="">Selecione…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} · {telefone(c.telefone)}</option>)}
        </select>
        <button type="button" className="botao botao-sutil" onClick={() => setNovo({ nome: '', telefone: '' })}>Novo cliente</button>
      </div>
    </Campo>
  )
}

/** Busca encadeada na API FIPE: marca → modelo → ano → valor de referência. */
function BuscaFipe({ tipo, aoEncontrar }) {
  const [listas, setListas] = useState({ marcas: [], modelos: [], anos: [] })
  const [sel, setSel] = useState({ marca: '', modelo: '', ano: '' })
  const [status, setStatus] = useState({ carregando: false, erro: null })

  const chamar = async (fn) => {
    setStatus({ carregando: true, erro: null })
    try { return await fn() } catch (e) { setStatus({ carregando: false, erro: e.message }); return null }
    finally { setStatus((s) => ({ ...s, carregando: false })) }
  }

  useEffect(() => {
    setSel({ marca: '', modelo: '', ano: '' })
    setListas({ marcas: [], modelos: [], anos: [] })
    chamar(() => api.fipe.marcas(tipo)).then((marcas) => marcas && setListas({ marcas, modelos: [], anos: [] }))
  }, [tipo])

  async function escolherMarca(marca) {
    setSel({ marca, modelo: '', ano: '' })
    setListas((l) => ({ ...l, modelos: [], anos: [] }))
    if (marca) {
      const modelos = await chamar(() => api.fipe.modelos(tipo, marca))
      if (modelos) setListas((l) => ({ ...l, modelos }))
    }
  }
  async function escolherModelo(modelo) {
    setSel((s) => ({ ...s, modelo, ano: '' }))
    setListas((l) => ({ ...l, anos: [] }))
    if (modelo) {
      const anos = await chamar(() => api.fipe.anos(tipo, sel.marca, modelo))
      if (anos) setListas((l) => ({ ...l, anos }))
    }
  }
  async function escolherAno(ano) {
    setSel((s) => ({ ...s, ano }))
    if (ano) {
      const v = await chamar(() => api.fipe.valor(tipo, sel.marca, sel.modelo, ano))
      if (v) aoEncontrar({ ...v, anoId: ano })
    }
  }

  return (
    <fieldset className="subform fipe">
      <legend>Buscar na tabela FIPE</legend>
      <p className="campo-dica">Preenche marca, modelo, ano e o valor de referência automaticamente.</p>
      <div className="linha linha-3">
        <Campo rotulo="Marca">
          <select value={sel.marca} onChange={(e) => escolherMarca(e.target.value)} disabled={!listas.marcas.length}>
            <option value="">{listas.marcas.length ? 'Selecione…' : 'Carregando…'}</option>
            {listas.marcas.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Modelo">
          <select value={sel.modelo} onChange={(e) => escolherModelo(e.target.value)} disabled={!listas.modelos.length}>
            <option value="">Selecione…</option>
            {listas.modelos.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Ano">
          <select value={sel.ano} onChange={(e) => escolherAno(e.target.value)} disabled={!listas.anos.length}>
            <option value="">Selecione…</option>
            {listas.anos.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Campo>
      </div>
      {status.carregando && <p className="campo-dica" role="status">Consultando a FIPE…</p>}
      {status.erro && <p className="aviso aviso-erro" role="alert">{status.erro} Você pode preencher os dados manualmente.</p>}
    </fieldset>
  )
}

const VAZIO = { cliente_id: null, placa: '', tipo: 'cars', marca: '', modelo: '', ano_modelo: '', combustivel: '', cor: '', quilometragem: '' }

export default function VeiculoForm({ inicial, aoSalvar, aoCancelar, placaInicial = '' }) {
  const [v, setV] = useState(inicial || { ...VAZIO, placa: placaInicial })
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const set = (campo) => (e) => { const valor = e.target.value; setV((atual) => ({ ...atual, [campo]: valor })) }

  function aplicarFipe(f) {
    setV((atual) => ({
      ...atual,
      marca: f.brand, modelo: f.model, ano_modelo: f.modelYear >= 32000 ? '' : f.modelYear, combustivel: f.fuel,
      fipe_codigo: f.codeFipe, fipe_ano_id: f.anoId, fipe_valor: f.price, fipe_mes_referencia: f.referenceMonth?.trim(),
    }))
  }

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      aoSalvar(await api.salvarVeiculo(v))
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="form" onSubmit={enviar}>
      <ClienteCampo valor={v.cliente_id} aoMudar={(cliente_id) => setV((atual) => ({ ...atual, cliente_id }))} />
      <div className="linha">
        <Campo rotulo="Placa" dica="ABC1234 ou ABC1D23">
          <input required className="entrada-placa" autoCapitalize="characters" maxLength={8} value={v.placa} onChange={set('placa')} />
        </Campo>
        <Campo rotulo="Tipo">
          <select value={v.tipo} onChange={set('tipo')}>
            {TIPOS_VEICULO.map((t) => <option key={t.valor} value={t.valor}>{t.nome}</option>)}
          </select>
        </Campo>
      </div>

      <BuscaFipe tipo={v.tipo} aoEncontrar={aplicarFipe} />

      <div className="linha">
        <Campo rotulo="Marca"><input required value={v.marca} onChange={set('marca')} /></Campo>
        <Campo rotulo="Modelo"><input required value={v.modelo} onChange={set('modelo')} /></Campo>
      </div>
      <div className="linha linha-4">
        <Campo rotulo="Ano modelo"><input type="number" min="1950" max="2100" value={v.ano_modelo ?? ''} onChange={set('ano_modelo')} /></Campo>
        <Campo rotulo="Combustível"><input value={v.combustivel ?? ''} onChange={set('combustivel')} /></Campo>
        <Campo rotulo="Cor"><input value={v.cor ?? ''} onChange={set('cor')} /></Campo>
        <Campo rotulo="Quilometragem"><input type="number" min="0" value={v.quilometragem ?? ''} onChange={set('quilometragem')} /></Campo>
      </div>
      {v.fipe_valor && (
        <p className="fipe-resultado">
          Valor FIPE: <strong>{v.fipe_valor}</strong> <span className="sub">(código {v.fipe_codigo}, {v.fipe_mes_referencia})</span>
        </p>
      )}
      {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
      <div className="acao-botoes">
        <button className="botao botao-primario" disabled={salvando}>{v.id ? 'Salvar alterações' : 'Cadastrar veículo'}</button>
        {aoCancelar && <button type="button" className="botao botao-sutil" onClick={aoCancelar}>Cancelar</button>}
      </div>
    </form>
  )
}
