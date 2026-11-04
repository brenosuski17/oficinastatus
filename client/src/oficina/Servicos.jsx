import { useState } from 'react'
import { motion } from 'motion/react'
import { Search, Info, Hammer, Paintbrush, Wrench, Square, Zap, Sparkles, Package, Pencil, Check, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { moeda } from '../lib/formato'
import { Cabecalho, ErroCarga, Esqueleto, useDados } from '../ui/base'
import { useToast } from '../ui/Toast'
import { formatarTempo } from '../vistoria/zonas'

const ICONES = { funilaria: Hammer, pintura: Paintbrush, mecanica: Wrench, vidros: Square, eletrica: Zap, estetica: Sparkles, pecas: Package }

/** Linha da tabela de preços; o administrador ajusta valor e tempo na própria linha. */
function Linha({ s, admin, aoSalvar }) {
  const [edit, setEdit] = useState(null)
  const Icone = ICONES[s.categoria] || Wrench
  async function salvar() {
    await aoSalvar(s.id, { valor: Number(edit.valor), minutos: Number(edit.minutos) })
    setEdit(null)
  }
  return (
    <tr className="border-t border-linha hover:bg-white/[.03]">
      <td className="px-6 py-3">
        <span className="flex items-center gap-3">
          <span className="grid place-items-center size-9 rounded-xl bg-ultramar-600/15 text-[#9db2ff]"><Icone className="size-[18px]" /></span>
          <span><span className="block font-semibold">{s.nome}</span><span className="block text-[13px] text-tinta-3">{s.categoria_nome} · acompanha a gravidade</span></span>
        </span>
      </td>
      <td className="py-3 text-tinta-2">{s.aplica_se}</td>
      <td className="py-3 text-tinta-2 num">
        {edit ? <input className="entrada !h-9 !w-24 num" type="number" min="0" value={edit.minutos} onChange={(e) => setEdit({ ...edit, minutos: e.target.value })} aria-label="Tempo em minutos" /> : formatarTempo(s.minutos)}
      </td>
      <td className="py-3 text-right font-bold num">
        {edit ? <input className="entrada !h-9 !w-28 num text-right" type="number" min="0" step="0.01" value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} aria-label="Valor" /> : moeda(s.valor)}
      </td>
      <td className="py-3 pr-4 w-24 text-right">
        {admin && (edit ? (
          <span className="inline-flex gap-1">
            <button onClick={salvar} className="p-2 rounded-lg text-ok hover:bg-ok-bg" aria-label="Salvar"><Check className="size-4" /></button>
            <button onClick={() => setEdit(null)} className="p-2 rounded-lg text-tinta-3 hover:bg-white/10" aria-label="Cancelar"><X className="size-4" /></button>
          </span>
        ) : (
          <button onClick={() => setEdit({ valor: s.valor, minutos: s.minutos })} className="p-2 rounded-lg text-tinta-3 hover:text-white hover:bg-white/10" aria-label={`Editar ${s.nome}`}><Pencil className="size-4" /></button>
        ))}
      </td>
    </tr>
  )
}

export default function Servicos() {
  const { usuario } = useAuth()
  const avisar = useToast()
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const { dados: cats } = useDados(() => api.catalogoCategorias(), [])
  const { dados, erro, carregando, recarregar, setDados } = useDados(() => api.catalogo({ categoria, busca }), [categoria, busca])
  const total = (cats || []).reduce((t, c) => t + c.total, 0)

  async function salvar(id, d) {
    try {
      const novo = await api.salvarServicoCatalogo(id, d)
      setDados(dados.map((s) => (s.id === id ? { ...s, ...novo } : s)))
      avisar('Preço atualizado. Vale para as próximas avarias.')
    } catch (e) { avisar(e.message, 'erro') }
  }

  return (
    <>
      <p className="text-[12px] font-bold tracking-[0.16em] text-tinta-3">CATÁLOGO</p>
      <Cabecalho titulo="Serviços e peças" sub="Valores usados nas sugestões da inspeção e nos orçamentos." />

      <p className="flex items-center gap-2 rounded-2xl border border-alerta-borda bg-alerta-bg text-alerta px-4 py-3 text-[14px] font-semibold mb-5">
        <Info className="size-[18px] shrink-0" />Valores de referência. {usuario.papel === 'admin' ? 'Ajuste à realidade da sua oficina clicando no lápis.' : 'O administrador pode ajustar os preços.'}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-trilho p-1 max-w-full" role="tablist">
          {[{ categoria: '', nome: 'Todos', total }, ...(cats || [])].map((c) => (
            <button key={c.categoria} role="tab" aria-selected={categoria === c.categoria} onClick={() => setCategoria(c.categoria)}
              className={`relative h-9 px-3.5 rounded-xl text-[14px] font-bold whitespace-nowrap ${categoria === c.categoria ? 'text-white' : 'text-tinta-3 hover:text-tinta-2'}`}>
              {categoria === c.categoria && <motion.span layoutId="aba-cat" className="absolute inset-0 rounded-xl bg-ultramar-600/30 ring-1 ring-ultramar-500/60" />}
              <span className="relative">{c.nome} <span className="opacity-60 num">{c.total}</span></span>
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-tinta-3" />
          <input type="search" className="entrada !pl-10 w-[280px] max-w-full" placeholder="Buscar serviço ou peça" aria-label="Buscar serviço" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {carregando && !dados && <Esqueleto className="h-96 !rounded-3xl" />}
      {dados && (
        <div className="rounded-3xl border border-linha bg-superficie/80 overflow-x-auto">
          <table className="w-full text-[14.5px] min-w-[720px]">
            <thead className="text-left text-[12px] font-bold tracking-[0.1em] text-tinta-3">
              <tr><th className="px-6 py-4">ITEM</th><th className="py-4">APLICA-SE A</th><th className="py-4">TEMPO</th><th className="py-4 text-right">VALOR</th><th /></tr>
            </thead>
            <tbody>{dados.map((s) => <Linha key={s.id} s={s} admin={usuario.papel === 'admin'} aoSalvar={salvar} />)}</tbody>
          </table>
          {!dados.length && <p className="p-8 text-center text-tinta-3">Nenhum serviço encontrado.</p>}
        </div>
      )}
    </>
  )
}
