// Vistoria 3D da oficina: marcar avarias no carro e gerar o orçamento a partir delas.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Box, ArrowDownToLine, ChevronsRight, ChevronsLeft, PanelLeft, PanelRight, RotateCw, Maximize2, Minimize2,
  FileText, Plus, Search, Check, X, Trash2, MousePointerClick, Lock, Clock, Pencil,
} from 'lucide-react'
import { api } from '../lib/api'
import { moeda } from '../lib/formato'
import { useToast } from '../ui/Toast'
import Carro3D, { VISTAS } from './Carro3D'
import { ZONAS, TIPOS, GRAVIDADES, DICA_GRAVIDADE, nomeZona, nomeTipo, corGravidade, formatarTempo } from './zonas'

const EDITAVEL = ['recebido', 'diagnostico', 'orcamento', 'aprovacao']
const BOTOES_VISTA = [
  ['perspectiva', Box, 'Perspectiva'], ['topo', ArrowDownToLine, 'Vista de cima'], ['frente', ChevronsLeft, 'Frente'],
  ['traseira', ChevronsRight, 'Traseira'], ['esquerda', PanelLeft, 'Lado esquerdo'], ['direita', PanelRight, 'Lado direito'],
]

function Chip({ ativo, onClick, children, cor, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[14px] font-semibold border transition active:scale-95 ${ativo ? 'bg-ultramar-600 border-ultramar-500 text-white shadow-[0_0_0_3px_rgba(61,91,255,.25)]' : 'bg-white/[.04] border-white/10 text-[#c9d2f0] hover:bg-white/10 hover:text-white'} ${className}`}
      style={ativo && cor ? { background: `color-mix(in srgb, ${cor} 22%, #121a40)`, borderColor: cor, color: 'white', boxShadow: `0 0 0 3px color-mix(in srgb, ${cor} 25%, transparent)` } : undefined}>
      {children}
    </button>
  )
}

function Etapa({ n, titulo, children, extra }) {
  return (
    <section className="py-4 border-b border-white/10 last:border-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-white">
          <span className="grid place-items-center size-6 rounded-md bg-white/10 text-[12.5px] num">{n}</span>{titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

/** Busca na tabela de preços inteira. */
function Catalogo({ aberto, aoFechar, aoEscolher, selecionados }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState([])
  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => api.catalogo({ busca }).then(setLista).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [busca, aberto])
  if (!aberto) return null
  return (
    <motion.div className="absolute inset-0 z-20 bg-[#0f1838] flex flex-col" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
      <div className="flex items-center gap-2 p-4 border-b border-white/10">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8d99c4]" />
          <input autoFocus className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-white placeholder:text-[#7c88b4] focus:outline-none focus:border-ultramar-500" placeholder="Buscar serviço na tabela de preços" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <button onClick={aoFechar} className="p-2 rounded-lg text-[#aab3d4] hover:text-white hover:bg-white/10" aria-label="Fechar catálogo"><X className="size-5" /></button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {lista.map((s) => {
          const on = selecionados.has(s.id)
          return (
            <li key={s.id}>
              <button onClick={() => aoEscolher(s)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 ${on ? 'bg-ultramar-600/20' : ''}`}>
                <span className={`grid place-items-center size-5 rounded-md border ${on ? 'bg-ultramar-600 border-ultramar-500' : 'border-white/20'}`}>{on && <Check className="size-3.5 text-white" strokeWidth={3} />}</span>
                <span className="flex-1 min-w-0 text-[14px] text-white">{s.nome}<span className="block text-[12px] text-[#7c88b4]">{s.zona.replaceAll('_', ' ')} · {formatarTempo(s.minutos)}</span></span>
                <span className="text-[14px] font-bold text-white num">{moeda(s.valor)}</span>
              </button>
            </li>
          )
        })}
        {!lista.length && <li className="p-6 text-center text-[#8d99c4]">Nenhum serviço encontrado.</li>}
      </ul>
    </motion.div>
  )
}

/** Formulário de uma avaria (nova ou existente). */
function Editor({ o, inicial, aoSalvar, aoCancelar, aoExcluir }) {
  const avisar = useToast()
  const [f, setF] = useState(inicial)
  const [sug, setSug] = useState({ servicos: [], pre: [] })
  const [manual, setManual] = useState(null)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const [todos, setTodos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const primeira = useRef(Boolean(inicial.id))

  // Busca os serviços sugeridos sempre que a peça, o tipo ou a gravidade mudam
  useEffect(() => {
    let vivo = true
    api.avarias.sugestao(o.id, { zona: f.zona, tipo: f.tipo, gravidade: f.gravidade }).then((r) => {
      if (!vivo) return
      setSug(r)
      if (primeira.current) { primeira.current = false; return } // editando: mantém o que já foi escolhido
      setF((x) => ({
        ...x,
        servicos: [...r.servicos.filter((s) => r.pre.includes(s.id)).map((s) => ({ catalogo_id: s.id, descricao: s.nome, valor: s.valor, minutos: s.minutos })), ...x.servicos.filter((s) => !s.catalogo_id)],
      }))
    }).catch((e) => avisar(e.message, 'erro'))
    return () => { vivo = false }
  }, [f.zona, f.tipo, f.gravidade]) // eslint-disable-line react-hooks/exhaustive-deps

  const ids = useMemo(() => new Set(f.servicos.filter((s) => s.catalogo_id).map((s) => s.catalogo_id)), [f.servicos])
  const alternar = (s) => setF((x) => ({
    ...x,
    servicos: ids.has(s.id) ? x.servicos.filter((y) => y.catalogo_id !== s.id) : [...x.servicos, { catalogo_id: s.id, descricao: s.nome, valor: s.valor, minutos: s.minutos }],
  }))
  const total = f.servicos.reduce((t, s) => t + Number(s.valor || 0), 0)
  const minutos = f.servicos.reduce((t, s) => t + Number(s.minutos || 0), 0)
  const visiveis = sug.servicos.filter((s) => todos || s.relevancia > 0)
  const extras = f.servicos.filter((s) => !s.catalogo_id || !sug.servicos.some((x) => x.id === s.catalogo_id))

  async function salvar() {
    if (!f.servicos.length) return avisar('Escolha pelo menos um serviço.', 'erro')
    setSalvando(true)
    const corpo = {
      zona: f.zona, tipo: f.tipo, gravidade: f.gravidade, posicao: f.posicao, normal: f.normal, observacao: f.observacao,
      servicos: f.servicos.map((s) => (s.catalogo_id ? { catalogo_id: s.catalogo_id, valor: s.valor, minutos: s.minutos } : s)),
    }
    try {
      const r = f.id ? await api.avarias.editar(o.id, f.id, corpo) : await api.avarias.criar(o.id, corpo)
      aoSalvar(r, f.id ? 'Avaria atualizada.' : `Avaria ${r.avarias.at(-1)?.numero} salva.`)
    } catch (e) { avisar(e.message, 'erro'); setSalvando(false) }
  }

  return (
    <div className="relative flex flex-col h-full">
      <AnimatePresence>{catalogoAberto && <Catalogo aberto aoFechar={() => setCatalogoAberto(false)} selecionados={ids} aoEscolher={alternar} />}</AnimatePresence>

      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center size-8 rounded-full text-white font-extrabold text-[14px]" style={{ background: f.id ? corGravidade(f.gravidade) : '#3d5bff' }}>{f.numero || '+'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] text-[#8d99c4] font-semibold">{f.id ? `Avaria nº ${f.numero}` : 'Nova avaria'}</p>
            <select value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })} aria-label="Peça"
              className="-ml-1 max-w-full bg-transparent text-white text-[17px] font-bold rounded-md px-1 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ultramar-500 [&>option]:text-tinta">
              {Object.entries(ZONAS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
          {f.id && <button onClick={aoExcluir} className="p-2 rounded-lg text-[#aab3d4] hover:text-[#ff8a8a] hover:bg-white/5" aria-label="Excluir avaria"><Trash2 className="size-[18px]" /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        <Etapa n={1} titulo="Tipo de avaria">
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => <Chip key={t.valor} ativo={f.tipo === t.valor} onClick={() => setF({ ...f, tipo: t.valor })}>{t.nome}</Chip>)}
          </div>
        </Etapa>

        <Etapa n={2} titulo="Gravidade">
          <div className="grid grid-cols-3 gap-2">
            {GRAVIDADES.map((g) => (
              <Chip key={g.valor} ativo={f.gravidade === g.valor} cor={g.cor} onClick={() => setF({ ...f, gravidade: g.valor })} className="justify-center !rounded-xl !h-10">
                <span className="size-2 rounded-full" style={{ background: g.cor }} />{g.nome}
              </Chip>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={f.tipo + f.gravidade} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[13.5px] text-[#9aa6cf] mt-2.5">
              {DICA_GRAVIDADE[f.tipo][f.gravidade]}
            </motion.p>
          </AnimatePresence>
        </Etapa>

        <Etapa n={3} titulo="Serviços necessários" extra={
          <span className="flex gap-1">
            <button onClick={() => setManual({ descricao: '', valor: '', minutos: '' })} className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[13.5px] font-semibold text-[#9db2ff] hover:bg-white/5"><Plus className="size-4" />Manual</button>
            <button onClick={() => setCatalogoAberto(true)} className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[13.5px] font-semibold text-[#9db2ff] hover:bg-white/5"><Search className="size-4" />Catálogo</button>
          </span>
        }>
          <div className="flex flex-wrap gap-2">
            {visiveis.map((s) => (
              <motion.span key={s.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <Chip ativo={ids.has(s.id)} onClick={() => alternar(s)} className="!h-auto !py-2 !rounded-xl text-left">
                  {ids.has(s.id) ? <Check className="size-4 shrink-0" strokeWidth={3} /> : <Plus className="size-4 shrink-0 opacity-70" />}
                  <span>{s.nome}</span><span className="num opacity-80 ml-1">{moeda(s.valor)}</span>
                </Chip>
              </motion.span>
            ))}
            {extras.map((s, i) => (
              <Chip key={`x${i}`} ativo onClick={() => setF((x) => ({ ...x, servicos: x.servicos.filter((y) => y !== s) }))} className="!h-auto !py-2 !rounded-xl">
                <X className="size-4 shrink-0" /><span>{s.descricao}</span><span className="num opacity-80 ml-1">{moeda(s.valor)}</span>
              </Chip>
            ))}
          </div>
          {sug.servicos.length > visiveis.length && (
            <button onClick={() => setTodos(true)} className="mt-3 text-[13.5px] font-semibold text-[#9db2ff] hover:underline">Ver todos os serviços desta peça ({sug.servicos.length})</button>
          )}
          <AnimatePresence>
            {manual && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
                onSubmit={(e) => {
                  e.preventDefault()
                  setF((x) => ({ ...x, servicos: [...x.servicos, { descricao: manual.descricao, valor: Number(manual.valor), minutos: Number(manual.minutos || 0) }] }))
                  setManual(null)
                }}>
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-3 grid grid-cols-[1fr_96px_80px] gap-2">
                  <input required autoFocus placeholder="Serviço" aria-label="Descrição do serviço" value={manual.descricao} onChange={(e) => setManual({ ...manual, descricao: e.target.value })} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-white col-span-3 focus:outline-none focus:border-ultramar-500" />
                  <input required type="number" min="0" step="0.01" placeholder="R$" aria-label="Valor" value={manual.valor} onChange={(e) => setManual({ ...manual, valor: e.target.value })} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-white num focus:outline-none focus:border-ultramar-500" />
                  <input type="number" min="0" placeholder="min" aria-label="Tempo em minutos" value={manual.minutos} onChange={(e) => setManual({ ...manual, minutos: e.target.value })} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-white num focus:outline-none focus:border-ultramar-500" />
                  <span className="flex gap-1">
                    <button className="flex-1 h-10 rounded-lg bg-ultramar-600 text-white font-bold" aria-label="Adicionar serviço manual"><Check className="size-4 mx-auto" /></button>
                    <button type="button" onClick={() => setManual(null)} className="h-10 px-2 rounded-lg text-[#aab3d4] hover:bg-white/10" aria-label="Cancelar"><X className="size-4" /></button>
                  </span>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </Etapa>

        <Etapa n={4} titulo="Observação">
          <textarea rows={2} value={f.observacao || ''} onChange={(e) => setF({ ...f, observacao: e.target.value })} placeholder="Ex.: amassado próximo à maçaneta, sem trinca na pintura"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-[#6f7ba8] focus:outline-none focus:border-ultramar-500" />
        </Etapa>
      </div>

      <div className="px-5 py-4 border-t border-white/10 bg-[#0c1430]">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[12px] font-bold text-[#8d99c4] tracking-wide">Valor estimado</p>
            <motion.p key={total} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[28px] font-extrabold text-white num leading-tight">{moeda(total)}</motion.p>
          </div>
          <p className="flex items-center gap-1 text-[14px] text-[#9aa6cf] font-semibold num"><Clock className="size-4" />{formatarTempo(minutos)}</p>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button onClick={aoCancelar} className="h-12 px-5 rounded-xl font-bold text-[#c9d2f0] hover:bg-white/5">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="h-12 rounded-xl bg-ultramar-600 hover:bg-ultramar-500 text-white font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(61,91,255,.9)] disabled:opacity-60">
            <Check className="size-5" />Salvar avaria
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Vistoria({ o, aoAtualizar, aoGerar }) {
  const avisar = useToast()
  const caixa = useRef(null)
  const [editando, setEditando] = useState(null)
  const [vista, setVista] = useState(null)
  const [girar, setGirar] = useState(false)
  const [apontando, setApontando] = useState(null)
  const [cheia, setCheia] = useState(false)
  const [gerando, setGerando] = useState(false)

  const editavel = o.situacao === 'aberta' && EDITAVEL.includes(o.etapa_atual)
  const pendentes = o.avarias.filter((a) => !a.orcada)
  const total = o.avarias.reduce((t, a) => t + a.valor, 0)
  const minutos = o.avarias.reduce((t, a) => t + a.minutos, 0)
  const podeGerar = editavel && o.etapa_atual !== 'recebido' && pendentes.length > 0

  useEffect(() => {
    const sair = () => setCheia(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sair)
    return () => { document.removeEventListener('fullscreenchange', sair); document.body.style.cursor = '' }
  }, [])

  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen()
    else caixa.current?.requestFullscreen?.().catch(() => setCheia((c) => !c))
  }

  function focar(a) {
    const n = [a.nor_x, a.nor_y, a.nor_z]
    const pos = [a.pos_x + n[0] * 3.2, Math.max(0.9, a.pos_y + n[1] * 3.2 + 0.9), a.pos_z + n[2] * 3.2]
    setVista({ pos, alvo: [a.pos_x * 0.6, Math.max(0.5, a.pos_y), a.pos_z * 0.6], foco: true, k: Date.now() })
  }

  function marcar({ zona, posicao, normal }) {
    setGirar(false)
    setEditando({ zona, posicao, normal, tipo: 'amassado', gravidade: 'moderada', observacao: '', servicos: [] })
  }

  function abrir(a) {
    focar(a)
    if (!editavel) return setEditando(null)
    setEditando({
      id: a.id, numero: a.numero, zona: a.zona, tipo: a.tipo, gravidade: a.gravidade, observacao: a.observacao,
      posicao: { x: a.pos_x, y: a.pos_y, z: a.pos_z }, normal: { x: a.nor_x, y: a.nor_y, z: a.nor_z },
      servicos: a.servicos.map((s) => ({ catalogo_id: s.catalogo_id, descricao: s.descricao, valor: s.valor, minutos: s.minutos })),
    })
  }

  async function excluir() {
    if (!confirm(`Excluir a avaria ${editando.numero}?${o.avarias.find((a) => a.id === editando.id)?.orcada ? ' Os itens dela saem do orçamento.' : ''}`)) return
    try { aoAtualizar(await api.avarias.remover(o.id, editando.id)); setEditando(null); avisar('Avaria excluída.') } catch (e) { avisar(e.message, 'erro') }
  }

  async function gerar() {
    setGerando(true)
    try {
      const r = await api.avarias.gerarOrcamento(o.id)
      aoAtualizar(r)
      avisar(`Orçamento gerado com ${pendentes.length} ${pendentes.length === 1 ? 'avaria' : 'avarias'}. Revise e envie ao cliente.`)
      aoGerar?.()
    } catch (e) { avisar(e.message, 'erro') } finally { setGerando(false) }
  }

  return (
    <div ref={caixa} className={`relative overflow-hidden bg-[#070c22] text-white grid lg:grid-cols-[1fr_400px] ${cheia ? 'fixed inset-0 z-50 rounded-none' : 'rounded-[28px] shadow-[0_30px_80px_-30px_rgba(7,12,34,.6)]'}`}>
      {/* palco 3D */}
      <div className={`relative ${cheia ? 'h-[55vh] lg:h-full' : 'h-[52vh] min-h-[380px] lg:h-[680px]'} bg-[radial-gradient(ellipse_at_50%_30%,#1a2660_0%,#0b1233_55%,#070c22_100%)]`}>
        <Carro3D avarias={o.avarias} rascunho={editando && !editando.id ? editando : null} selecionada={editando?.id}
          aoMarcar={editavel ? marcar : undefined} aoSelecionar={abrir} aoApontar={setApontando} vista={vista} girar={girar} />

        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
          <div className="pointer-events-auto rounded-2xl bg-white/[.06] backdrop-blur-md border border-white/10 px-4 py-2.5">
            <p className="text-[12px] font-bold text-[#8d99c4]">Vistoria · OS nº {o.id}</p>
            <AnimatePresence mode="wait">
              <motion.p key={apontando || 'x'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[15px] font-bold">
                {apontando ? nomeZona(apontando) : editavel ? 'Clique no carro para marcar uma avaria' : 'Arraste para girar o carro'}
              </motion.p>
            </AnimatePresence>
          </div>
          {editavel && (
            <button onClick={gerar} disabled={!podeGerar || gerando}
              className="pointer-events-auto inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-ultramar-600 hover:bg-ultramar-500 font-bold shadow-[0_10px_30px_-8px_rgba(61,91,255,.9)] disabled:opacity-40 disabled:shadow-none">
              <FileText className="size-[18px]" />Gerar orçamento{pendentes.length > 0 && <span className="grid place-items-center min-w-6 h-6 px-1.5 rounded-full bg-white/20 text-[12.5px] num">{pendentes.length}</span>}
            </button>
          )}
        </div>

        {/* vistas da câmera */}
        <nav className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-row gap-0.5 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col lg:gap-1 rounded-2xl bg-white/[.06] backdrop-blur-md border border-white/10 p-1.5" aria-label="Vistas do carro">
          {BOTOES_VISTA.map(([k, Icone, nome]) => (
            <button key={k} onClick={() => { setGirar(false); setVista({ ...VISTAS[k], k: Date.now() }) }} title={nome} aria-label={nome}
              className="grid place-items-center size-9 rounded-xl text-[#c9d2f0] hover:bg-white/10 hover:text-white"><Icone className="size-[18px]" /></button>
          ))}
          <span className="w-px lg:w-auto lg:h-px bg-white/10 mx-1 lg:mx-0 lg:my-1" />
          <button onClick={() => setGirar((g) => !g)} title="Girar automaticamente" aria-label="Girar automaticamente" aria-pressed={girar}
            className={`grid place-items-center size-9 rounded-xl ${girar ? 'bg-ultramar-600 text-white' : 'text-[#c9d2f0] hover:bg-white/10'}`}><RotateCw className="size-[18px]" /></button>
          <button onClick={telaCheia} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-label="Tela cheia"
            className="grid place-items-center size-9 rounded-xl text-[#c9d2f0] hover:bg-white/10 hover:text-white">{cheia ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}</button>
        </nav>

        <div className="hidden lg:flex absolute left-4 bottom-4 flex-wrap gap-3 text-[12.5px] font-semibold text-[#9aa6cf] pointer-events-none">
          {GRAVIDADES.map((g) => <span key={g.valor} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: g.cor }} />{g.nome}</span>)}
        </div>
      </div>

      {/* painel */}
      <aside className={`relative bg-[#0f1838] border-l border-white/10 ${cheia ? 'h-[45vh] lg:h-full' : 'lg:h-[680px] max-h-[720px]'} flex flex-col`}>
        <AnimatePresence mode="wait">
          {editando ? (
            <motion.div key={editando.id || 'novo'} className="h-full" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 340, damping: 32 }}>
              <Editor o={o} inicial={editando} aoCancelar={() => setEditando(null)} aoExcluir={excluir}
                aoSalvar={(r, msg) => { aoAtualizar(r); setEditando(null); avisar(msg) }} />
            </motion.div>
          ) : (
            <motion.div key="lista" className="h-full flex flex-col" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-[19px] font-extrabold">Avarias <span className="text-[#8d99c4] num">{o.avarias.length}</span></h2>
                {!editavel && <p className="flex items-center gap-1.5 text-[13.5px] text-[#9aa6cf] mt-1"><Lock className="size-4" />Vistoria travada depois da aprovação do orçamento.</p>}
                {editavel && o.etapa_atual === 'aprovacao' && <p className="text-[13.5px] text-[#f8c35a] mt-1">Alterar avarias aqui volta o orçamento para revisão.</p>}
              </div>
              <div className="flex-1 overflow-y-auto px-3">
                {o.avarias.length === 0 ? (
                  <div className="flex flex-col items-center text-center px-6 py-14 text-[#9aa6cf]">
                    <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} className="grid place-items-center size-14 rounded-2xl bg-ultramar-600/20 text-[#9db2ff] mb-4"><MousePointerClick className="size-7" /></motion.span>
                    <p className="font-bold text-white text-[16px]">Nenhuma avaria marcada</p>
                    <p className="mt-1 text-[14.5px]">{editavel ? 'Gire o carro e clique onde está o dano. A peça é reconhecida sozinha.' : 'Esta OS não teve vistoria.'}</p>
                  </div>
                ) : (
                  <ul className="space-y-2 pb-3">
                    {o.avarias.map((a, i) => (
                      <motion.li key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <button onClick={() => abrir(a)} className="group w-full flex items-start gap-3 rounded-2xl p-3 text-left hover:bg-white/5 border border-transparent hover:border-white/10">
                          <span className="grid place-items-center size-8 shrink-0 rounded-full font-extrabold text-[14px]" style={{ background: corGravidade(a.gravidade) }}>{a.numero}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold text-[15px]">{a.zona_nome}</span>
                            <span className="block text-[13.5px] text-[#9aa6cf]">{nomeTipo(a.tipo)} · {a.gravidade}</span>
                            <span className="block text-[13px] text-[#7c88b4] mt-1 truncate">{a.servicos.map((s) => s.descricao).join(' + ')}</span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block font-bold num">{moeda(a.valor)}</span>
                            <span className={`inline-block mt-1 text-[11.5px] font-bold rounded-full px-2 py-0.5 ${a.orcada ? 'bg-[#12b76a]/20 text-[#6ee7a8]' : 'bg-white/10 text-[#c9d2f0]'}`}>{a.orcada ? 'No orçamento' : 'Nova'}</span>
                          </span>
                          {editavel && <Pencil className="size-4 text-[#7c88b4] opacity-0 group-hover:opacity-100 mt-1" />}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="px-5 py-4 border-t border-white/10 bg-[#0c1430]">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[12px] font-bold text-[#8d99c4] tracking-wide">Valor estimado</p>
                    <p className="text-[28px] font-extrabold num leading-tight">{moeda(total)}</p>
                  </div>
                  <p className="flex items-center gap-1 text-[14px] text-[#9aa6cf] font-semibold num"><Clock className="size-4" />{formatarTempo(minutos)}</p>
                </div>
                {editavel && o.etapa_atual === 'recebido' && <p className="text-[13px] text-[#9aa6cf] mt-2">O orçamento pode ser gerado a partir do diagnóstico.</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  )
}
