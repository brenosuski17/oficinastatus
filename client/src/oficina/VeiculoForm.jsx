import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { UserPlus, BadgeCheck, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api'
import { telefone, limparPlaca, PLACA } from '../lib/formato'
import { Botao, Campo } from '../ui/base'
import { useToast } from '../ui/Toast'

/** Seleciona o dono do veículo, com cadastro rápido de um cliente novo. */
export function ClienteCampo({ valor, aoMudar }) {
  const avisar = useToast()
  const [clientes, setClientes] = useState([])
  const [novo, setNovo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api.clientes().then(setClientes).catch(() => {}) }, [])

  async function salvar() {
    setSalvando(true)
    try {
      const c = await api.salvarCliente(novo)
      setClientes(await api.clientes())
      aoMudar(c.id)
      setNovo(null)
      avisar(c.email ? 'Cliente cadastrado. Ele recebe o acesso ao portal no primeiro aviso.' : 'Cliente cadastrado.')
    } catch (e) { avisar(e.message, 'erro') } finally { setSalvando(false) }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {novo ? (
        <motion.fieldset key="novo" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          className="rounded-2xl border border-ultramar-200 bg-ultramar-50/60 p-4 overflow-hidden">
          <legend className="sr-only">Novo cliente</legend>
          <p className="font-bold mb-3">Novo cliente</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <Campo rotulo="Nome completo"><input className="entrada" autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
            <Campo rotulo="Telefone com DDD"><input className="entrada" type="tel" inputMode="tel" placeholder="(42) 99999-9999" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} /></Campo>
            <Campo rotulo="E-mail" dica="Para avisos e acesso ao portal"><input className="entrada" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Campo>
          </div>
          <div className="flex gap-2 mt-4">
            <Botao type="button" tamanho="p" carregando={salvando} onClick={salvar}>Salvar cliente</Botao>
            <Botao type="button" tamanho="p" variante="fantasma" onClick={() => setNovo(null)}>Cancelar</Botao>
          </div>
        </motion.fieldset>
      ) : (
        <motion.div key="sel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Campo rotulo="Dono do veículo">
            <div className="flex gap-2">
              <select className="entrada" required value={valor || ''} onChange={(e) => aoMudar(Number(e.target.value))}>
                <option value="">Selecione o cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} · {telefone(c.telefone)}</option>)}
              </select>
              <Botao type="button" variante="secundario" icone={UserPlus} onClick={() => setNovo({ nome: '', telefone: '', email: '' })}>Novo</Botao>
            </div>
          </Campo>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Busca encadeada na API FIPE: marca → modelo → ano → valor de referência. */
function BuscaFipe({ tipo, marcaSugerida, aoEncontrar }) {
  const [l, setL] = useState({ marcas: [], modelos: [], anos: [] })
  const [s, setS] = useState({ marca: '', modelo: '', ano: '' })
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)

  async function chamar(fn) {
    setCarregando(true); setErro(null)
    try { return await fn() } catch (e) { setErro(e.message); return null } finally { setCarregando(false) }
  }
  async function escolherMarca(marca, marcas = l.marcas) {
    setS({ marca, modelo: '', ano: '' })
    setL({ marcas, modelos: [], anos: [] })
    if (!marca) return
    const modelos = await chamar(() => api.fipe.modelos(tipo, marca))
    if (modelos) setL({ marcas, modelos, anos: [] })
  }

  useEffect(() => {
    let vivo = true
    chamar(() => api.fipe.marcas(tipo)).then((marcas) => {
      if (!vivo || !marcas) return
      setL({ marcas, modelos: [], anos: [] })
      if (marcaSugerida && marcas.some((m) => m.code === marcaSugerida.code)) escolherMarca(marcaSugerida.code, marcas)
    })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, marcaSugerida?.code])

  async function escolherModelo(modelo) {
    setS((x) => ({ ...x, modelo, ano: '' }))
    setL((x) => ({ ...x, anos: [] }))
    if (!modelo) return
    const anos = await chamar(() => api.fipe.anos(tipo, s.marca, modelo))
    if (anos) setL((x) => ({ ...x, anos }))
  }
  async function escolherAno(ano) {
    setS((x) => ({ ...x, ano }))
    if (!ano) return
    const v = await chamar(() => api.fipe.valor(tipo, s.marca, s.modelo, ano))
    if (v) aoEncontrar({ ...v, anoId: ano })
  }

  return (
    <fieldset className="rounded-2xl border border-ultramar-100 bg-gradient-to-br from-ultramar-50 to-superficie p-4">
      <legend className="sr-only">Tabela FIPE</legend>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-bold">Tabela FIPE <span className="font-normal text-tinta-3 text-[14px]">· preenche modelo e valor de referência</span></p>
        {carregando && <LoaderCircle className="size-4 animate-spin text-ultramar-600" aria-label="Consultando" />}
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo rotulo="Marca">
          <select className="entrada" value={s.marca} onChange={(e) => escolherMarca(e.target.value)} disabled={!l.marcas.length}>
            <option value="">{l.marcas.length ? 'Selecione…' : 'Carregando…'}</option>
            {l.marcas.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Modelo">
          <select className="entrada" value={s.modelo} onChange={(e) => escolherModelo(e.target.value)} disabled={!l.modelos.length}>
            <option value="">Selecione…</option>
            {l.modelos.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Ano">
          <select className="entrada" value={s.ano} onChange={(e) => escolherAno(e.target.value)} disabled={!l.anos.length}>
            <option value="">Selecione…</option>
            {l.anos.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <p className="mt-3 text-[14px] text-erro" role="alert">{erro} Você pode preencher os campos à mão.</p>}
    </fieldset>
  )
}

const VAZIO = { carroceria: 'hatch', cliente_id: null, placa: '', tipo: 'cars', marca: '', modelo: '', ano_fabricacao: '', ano_modelo: '', combustivel: '', cor: '', quilometragem: '', origem_dados: 'manual' }

/** Formulário de veículo: dados da placa (quando houver) + FIPE + ajustes manuais. */
export default function VeiculoForm({ inicial, fipeMarca, aoSalvar, aoCancelar, travarPlaca }) {
  const avisar = useToast()
  const [v, setV] = useState({ ...VAZIO, ...inicial })
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => { const val = e.target.value; setV((x) => ({ ...x, [k]: val })) }

  function aplicarFipe(f) {
    setV((x) => ({
      ...x,
      marca: f.brand, modelo: f.model,
      ano_modelo: f.modelYear >= 32000 ? x.ano_modelo : f.modelYear, // 32000 = "zero km" na FIPE
      combustivel: x.combustivel || f.fuel,
      fipe_codigo: f.codeFipe, fipe_ano_id: f.anoId, fipe_valor: f.price, fipe_mes_referencia: f.referenceMonth?.trim(),
      origem_dados: x.origem_dados === 'placa' ? 'placa' : 'fipe',
    }))
  }

  async function enviar(e) {
    e.preventDefault()
    setSalvando(true)
    try { aoSalvar(await api.salvarVeiculo(v)) } catch (err) { avisar(err.message, 'erro') } finally { setSalvando(false) }
  }
  const placaOk = PLACA.test(v.placa)

  return (
    <form onSubmit={enviar} className="space-y-5">
      {v.origem_dados === 'placa' && (
        <p className="flex items-center gap-2 rounded-xl bg-ok-bg text-ok px-4 py-3 text-[14.5px] font-semibold"><BadgeCheck className="size-5" />Dados preenchidos pela consulta da placa. Confira e escolha o modelo na FIPE para ter o valor de referência.</p>
      )}
      <ClienteCampo valor={v.cliente_id} aoMudar={(cliente_id) => setV((x) => ({ ...x, cliente_id }))} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo rotulo="Placa" erro={v.placa.length === 7 && !placaOk ? 'Formato inválido' : undefined}>
          <input className="entrada font-placa !text-[22px] tracking-[0.12em] uppercase" required maxLength={8} disabled={travarPlaca}
            value={v.placa} onChange={(e) => { const p = limparPlaca(e.target.value); setV((x) => ({ ...x, placa: p })) }} />
        </Campo>
        <Campo rotulo="Tipo">
          <select className="entrada" value={v.tipo} onChange={set('tipo')}>
            <option value="cars">Carro</option><option value="motorcycles">Moto</option><option value="trucks">Caminhão</option>
          </select>
        </Campo>
        <Campo rotulo="Modelo 3D (carroceria)" dica="Usado na inspeção 3D">
          <select className="entrada" value={v.carroceria || 'hatch'} onChange={set('carroceria')}>
            <option value="hatch">Hatch</option><option value="sedan">Sedã</option><option value="suv">SUV</option><option value="picape">Picape</option>
          </select>
        </Campo>
      </div>

      <BuscaFipe tipo={v.tipo} marcaSugerida={fipeMarca} aoEncontrar={aplicarFipe} />

      <div className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Marca"><input className="entrada" required value={v.marca} onChange={set('marca')} /></Campo>
        <Campo rotulo="Modelo"><input className="entrada" required value={v.modelo} onChange={set('modelo')} /></Campo>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Campo rotulo="Ano fabr."><input className="entrada num" type="number" min="1950" max="2100" value={v.ano_fabricacao ?? ''} onChange={set('ano_fabricacao')} /></Campo>
        <Campo rotulo="Ano modelo"><input className="entrada num" type="number" min="1950" max="2100" value={v.ano_modelo ?? ''} onChange={set('ano_modelo')} /></Campo>
        <Campo rotulo="Combustível"><input className="entrada" value={v.combustivel ?? ''} onChange={set('combustivel')} /></Campo>
        <Campo rotulo="Cor"><input className="entrada" value={v.cor ?? ''} onChange={set('cor')} /></Campo>
        <Campo rotulo="Km atual" className="col-span-2 sm:col-span-1"><input className="entrada num" type="number" min="0" value={v.quilometragem ?? ''} onChange={set('quilometragem')} /></Campo>
      </div>

      <AnimatePresence>
        {v.fipe_valor && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-baseline gap-x-3 rounded-2xl bg-ultramar-600 text-white px-5 py-4">
            <span className="text-white/80 font-semibold">Valor FIPE</span>
            <span className="text-[26px] font-extrabold num">{v.fipe_valor}</span>
            <span className="text-white/70 text-[14px]">código {v.fipe_codigo} · {v.fipe_mes_referencia}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <Botao type="submit" carregando={salvando}>{v.id ? 'Salvar alterações' : 'Cadastrar veículo'}</Botao>
        {aoCancelar && <Botao type="button" variante="fantasma" onClick={aoCancelar}>Cancelar</Botao>}
      </div>
    </form>
  )
}
