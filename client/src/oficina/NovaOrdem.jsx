import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ScanSearch, Search, CarFront, CircleAlert, ArrowRight, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { limparPlaca, PLACA, nomeVeiculo, telefone } from '../lib/formato'
import { Botao, Cabecalho, Campo, Placa, useDados } from '../ui/base'
import { useToast } from '../ui/Toast'
import VeiculoForm from './VeiculoForm'
import { avisarMudanca } from './Layout'

/** Campo de placa com o visual da placa Mercosul: digitou os 7 caracteres, a busca começa sozinha. */
function EntradaPlaca({ valor, aoMudar, buscando }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const exibido = valor.length > 3 && /\d/.test(valor[4] || '') ? `${valor.slice(0, 3)}-${valor.slice(3)}` : valor
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-2xl border-[3px] border-[#1b1f2b] bg-white overflow-hidden shadow-[0_24px_50px_-24px_rgba(18,26,51,.45)] focus-within:ring-8 focus-within:ring-ultramar-100 transition">
        <div className="bg-[#0b3d91] text-white text-center text-[13px] font-bold tracking-[0.35em] py-1.5">BRASIL</div>
        <input
          ref={ref}
          aria-label="Placa do veículo"
          className="w-full text-center font-placa font-bold text-[64px] sm:text-[76px] leading-none tracking-[0.08em] py-3 uppercase outline-none placeholder:text-[#d0d5e2]"
          placeholder="ABC1D23"
          value={exibido}
          onChange={(e) => aoMudar(limparPlaca(e.target.value))}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text"
        />
      </div>
      <AnimatePresence>
        {buscando && (
          <motion.div className="absolute left-3 right-3 bottom-2 h-1 rounded-full overflow-hidden bg-ultramar-100" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="h-full w-1/3 rounded-full bg-ultramar-600" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function NovaOrdem() {
  const navegar = useNavigate()
  const avisar = useToast()
  const { usuario } = useAuth()
  const { dados: mecanicos } = useDados(() => api.mecanicos(), [])
  const [placa, setPlaca] = useState('')
  const [busca, setBusca] = useState({ estado: 'ocioso' }) // ocioso | buscando | cadastrado | consulta | manual
  const [veiculo, setVeiculo] = useState(null)
  const [os, setOs] = useState({ problema_relatado: '', km_entrada: '', previsao_entrega: '', mecanico_id: usuario.papel === 'mecanico' ? usuario.id : '' })
  const [abrindo, setAbrindo] = useState(false)

  // Busca automática ao completar a placa
  useEffect(() => {
    setVeiculo(null)
    if (!PLACA.test(placa)) { setBusca({ estado: 'ocioso' }); return }
    let vivo = true
    setBusca({ estado: 'buscando' })
    api.veiculoPorPlaca(placa)
      .then((r) => {
        if (!vivo) return
        if (r.cadastrado) { setBusca({ estado: 'cadastrado' }); setVeiculo(r.cadastrado) }
        else setBusca({ estado: 'consulta', dados: r.consulta })
      })
      .catch((e) => vivo && setBusca({ estado: 'manual', motivo: e.message, naoConfigurado: e.status === 501 }))
    return () => { vivo = false }
  }, [placa])

  async function abrir(e) {
    e.preventDefault()
    setAbrindo(true)
    try {
      const nova = await api.criarOrdem({ ...os, veiculo_id: veiculo.id })
      avisarMudanca()
      avisar(`OS ${nova.id} aberta. O cliente foi avisado.`)
      navegar(`/oficina/ordens/${nova.id}`)
    } catch (err) { avisar(err.message, 'erro'); setAbrindo(false) }
  }

  const pronto = veiculo && !veiculo.os_aberta

  return (
    <>
      <Cabecalho titulo="Abrir ordem de serviço" sub="Digite a placa. Se o carro já veio antes, ele aparece na hora." />

      <section className="cartao p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ultramar-50 to-transparent pointer-events-none" />
        <div className="relative">
          <EntradaPlaca valor={placa} aoMudar={setPlaca} buscando={busca.estado === 'buscando'} />
          <p className="text-center text-tinta-3 text-[14px] mt-4 flex items-center justify-center gap-1.5">
            <ScanSearch className="size-4" />Padrão antigo (ABC1234) ou Mercosul (ABC1D23)
          </p>
        </div>

        <AnimatePresence mode="wait">
          {busca.estado === 'cadastrado' && veiculo && (
            <motion.div key="cad" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8 max-w-[640px] mx-auto">
              <div className="flex items-center gap-4 rounded-2xl border border-linha p-5">
                <span className="grid place-items-center size-12 rounded-2xl bg-ultramar-50 text-ultramar-600"><CarFront className="size-6" /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[17px]">{nomeVeiculo(veiculo)} {veiculo.ano_modelo || ''}</p>
                  <p className="text-tinta-2">{veiculo.cliente_nome} · {telefone(veiculo.cliente_telefone)}</p>
                </div>
                <span className="rounded-full bg-[#ecfdf3] text-[#067647] text-[12.5px] font-bold px-3 py-1">Já cadastrado</span>
              </div>
              {veiculo.os_aberta && (
                <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#fffaeb] text-[#93370d] px-4 py-3">
                  <CircleAlert className="size-5" />Este veículo já está na oficina.
                  <Link to={`/oficina/ordens/${veiculo.os_aberta}`} className="font-bold underline">Abrir a OS {veiculo.os_aberta}</Link>
                </p>
              )}
            </motion.div>
          )}

          {(busca.estado === 'consulta' || busca.estado === 'manual') && !veiculo && (
            <motion.div key="novo" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8 max-w-[860px] mx-auto">
              <h2 className="text-[20px] font-bold mb-1">Cadastrar o veículo</h2>
              {busca.estado === 'manual' && (
                <p className="text-tinta-2 mb-5">{busca.naoConfigurado ? 'A consulta automática por placa não está configurada. Escolha o modelo pela FIPE.' : `${busca.motivo} Preencha pela FIPE.`}</p>
              )}
              {busca.estado === 'consulta' && <div className="mb-5" />}
              <VeiculoForm
                key={placa}
                travarPlaca
                inicial={{ placa, ...(busca.dados?.veiculo || {}), origem_dados: busca.estado === 'consulta' ? 'placa' : 'manual' }}
                fipeMarca={busca.dados?.fipe_marca}
                aoSalvar={(v) => { setVeiculo(v); setBusca({ estado: 'cadastrado' }); avisar('Veículo cadastrado.') }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {pronto && (
          <motion.form onSubmit={abrir} className="cartao p-6 sm:p-8 mt-4" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-5">
              <Placa placa={veiculo.placa} tamanho="m" />
              <h2 className="text-[20px] font-bold">O que o cliente relatou?</h2>
            </div>
            <Campo rotulo="Problema relatado">
              <textarea className="entrada" rows={3} required autoFocus value={os.problema_relatado} onChange={(e) => setOs({ ...os, problema_relatado: e.target.value })}
                placeholder="Ex.: barulho na suspensão dianteira ao passar em lombadas" />
            </Campo>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              <Campo rotulo="Km na entrada"><input className="entrada num" type="number" min="0" value={os.km_entrada} placeholder={veiculo.quilometragem || ''} onChange={(e) => setOs({ ...os, km_entrada: e.target.value })} /></Campo>
              <Campo rotulo="Previsão de entrega (opcional)"><input className="entrada" type="date" value={os.previsao_entrega} onChange={(e) => setOs({ ...os, previsao_entrega: e.target.value })} /></Campo>
              <Campo rotulo="Mecânico responsável">
                <select className="entrada" value={os.mecanico_id} disabled={usuario.papel === 'mecanico'} onChange={(e) => setOs({ ...os, mecanico_id: e.target.value })}>
                  <option value="">Definir depois</option>
                  {(mecanicos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </Campo>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Botao type="submit" tamanho="g" carregando={abrindo}>Abrir OS e avisar o cliente<ArrowRight className="size-5" /></Botao>
              <Botao type="button" variante="fantasma" icone={Pencil} onClick={() => { setVeiculo(null); setPlaca('') }}>Outra placa</Botao>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {busca.estado === 'ocioso' && placa.length === 0 && (
        <p className="text-center text-tinta-3 mt-6 flex items-center justify-center gap-2"><Search className="size-4" />Também dá para procurar em <Link to="/oficina/veiculos" className="font-semibold text-ultramar-600">Veículos</Link>.</p>
      )}
    </>
  )
}
