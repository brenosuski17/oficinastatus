// Painel de registro de avaria (tipo, gravidade, serviços, valor e tempo) e busca na tabela de preços.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Search, Check, X, Trash2, Clock, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { moeda } from '../lib/formato'
import { useToast } from '../ui/Toast'
import { ZONAS, TIPOS, GRAVIDADES, DICA_GRAVIDADE, formatarTempo } from './zonas'

export function Chip({ ativo, onClick, children, cor, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[14px] font-semibold border transition active:scale-95 ${ativo ? 'bg-ultramar-600 border-ultramar-500 text-white shadow-[0_0_0_3px_rgba(61,91,255,.25)]' : 'bg-white/[.04] border-white/10 text-[#c9d2f0] hover:bg-white/10 hover:text-white'} ${className}`}
      style={ativo && cor ? { background: `color-mix(in srgb, ${cor} 22%, #121a40)`, borderColor: cor, color: 'white', boxShadow: `0 0 0 3px color-mix(in srgb, ${cor} 25%, transparent)` } : undefined}>
      {children}
    </button>
  )
}

export function Etapa({ n, titulo, children, extra }) {
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
export function Catalogo({ aberto, aoFechar, aoEscolher, selecionados }) {
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
export default function Editor({ o, inicial, aoSalvar, aoCancelar, aoExcluir }) {
  const avisar = useToast()
  const [f, setF] = useState(inicial)
  const [sug, setSug] = useState({ servicos: [], pre: [] })
  const [manual, setManual] = useState(null)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const [todos, setTodos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const primeira = useRef(Boolean(inicial.id))
  const servico = f.tipo === 'servico'

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
      aoSalvar(r, f.id ? 'Registro atualizado.' : servico ? 'Serviço adicionado.' : `Avaria ${r.avarias.at(-1)?.numero} registrada.`)
    } catch (e) { avisar(e.message, 'erro'); setSalvando(false) }
  }

  return (
    <div className="relative flex flex-col h-full">
      <AnimatePresence>{catalogoAberto && <Catalogo aberto aoFechar={() => setCatalogoAberto(false)} selecionados={ids} aoEscolher={alternar} />}</AnimatePresence>

      <div className="px-5 pt-4 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <button onClick={aoCancelar} className="inline-flex items-center gap-1.5 -ml-1 px-1 h-8 rounded-lg text-[14px] font-semibold text-[#c9d2f0] hover:text-white"><ArrowLeft className="size-4" />Voltar</button>
          {f.id && <button onClick={aoExcluir} className="p-2 rounded-lg text-[#aab3d4] hover:text-[#ff8a8a] hover:bg-white/5" aria-label="Excluir avaria"><Trash2 className="size-[18px]" /></button>}
        </div>
        <p className="mt-2 text-[11.5px] font-bold tracking-[0.14em] text-[#8ea2ff]">
          {servico ? (f.id ? `SERVIÇO Nº ${f.numero}` : 'ADICIONAR SERVIÇO') : f.id ? `AVARIA Nº ${f.numero}` : 'REGISTRAR AVARIA'}
        </p>
        <select value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })} aria-label="Peça"
          className="-ml-1 mt-0.5 max-w-full bg-transparent text-white text-[21px] font-extrabold tracking-tight rounded-md px-1 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ultramar-500 [&>option]:text-tinta [&>option]:bg-white">
          {Object.entries(ZONAS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {!servico && <>
        <Etapa n={1} titulo="Tipo de avaria">
          <div className="flex flex-wrap gap-2">
            {TIPOS.filter((t) => t.valor !== 'servico').map((t) => <Chip key={t.valor} ativo={f.tipo === t.valor} onClick={() => setF({ ...f, tipo: t.valor })}>{t.nome}</Chip>)}
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
              {DICA_GRAVIDADE[f.tipo]?.[f.gravidade]}
            </motion.p>
          </AnimatePresence>
        </Etapa>

        </>}
        <Etapa n={servico ? 1 : 3} titulo={servico ? 'Serviços na peça' : 'Serviços necessários'} extra={
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

        <Etapa n={servico ? 2 : 4} titulo="Observação">
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
            <Check className="size-5" />{servico ? 'Salvar serviço' : 'Salvar avaria'}
          </button>
        </div>
      </div>
    </div>
  )
}

