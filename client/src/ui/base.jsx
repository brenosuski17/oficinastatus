import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useInView } from 'motion/react'
import { LoaderCircle, X } from 'lucide-react'
import { ESTADOS } from '../lib/etapas'

/** Placa no padrão Mercosul. */
export function Placa({ placa, tamanho = 'm', className = '' }) {
  const p = String(placa || '').toUpperCase()
  const texto = p.length === 7 && /\d/.test(p[4]) ? `${p.slice(0, 3)}-${p.slice(3)}` : p
  const t = { p: 'h-7 min-w-[84px] text-[17px]', m: 'h-9 min-w-[110px] text-[22px]', g: 'h-16 min-w-[196px] text-[40px]', xg: 'h-24 min-w-[300px] text-[62px]' }[tamanho]
  const faixa = { p: 'text-[6px] h-2', m: 'text-[7px] h-2.5', g: 'text-[10px] h-4', xg: 'text-[13px] h-6' }[tamanho]
  return (
    <span className={`inline-flex flex-col shrink-0 overflow-hidden rounded-[6px] border-2 border-[#1b1f2b] bg-white align-middle shadow-[0_1px_0_rgba(0,0,0,.08)] ${t} ${className}`}
      role="img" aria-label={`Placa ${p.split('').join(' ')}`}>
      <span className={`flex items-center justify-center bg-[#0b3d91] text-white font-semibold tracking-[0.25em] leading-none ${faixa}`} aria-hidden="true">BRASIL</span>
      <span className="flex-1 flex items-center justify-center px-2 font-placa font-bold leading-none tracking-[0.06em] text-[#1b1f2b]" aria-hidden="true">{texto || '•••••••'}</span>
    </span>
  )
}

const VARIANTES = {
  primario: 'bg-ultramar-600 text-white hover:bg-ultramar-700 shadow-[0_6px_16px_-6px_rgba(43,76,255,.6)]',
  secundario: 'bg-superficie text-tinta border border-linha-forte hover:border-tinta-3 hover:bg-fundo',
  fantasma: 'text-tinta-2 hover:bg-trilho hover:text-tinta',
  sucesso: 'bg-[#0e9f5c] text-white hover:bg-[#0b8a4f] shadow-[0_6px_16px_-6px_rgba(18,183,106,.6)]',
  perigo: 'bg-superficie text-erro border border-erro-borda hover:bg-erro-bg',
  sinal: 'bg-sinal text-white hover:bg-[#ea5a05] shadow-[0_6px_16px_-6px_rgba(255,106,19,.6)]',
  whats: 'bg-[#1fa855] text-white hover:bg-[#178c46]',
}
const TAMANHOS = { p: 'h-9 px-3 text-[14px] gap-1.5 rounded-lg', m: 'h-11 px-4 text-[15px] gap-2 rounded-xl', g: 'h-13 px-6 text-[16px] gap-2 rounded-xl' }

export function Botao({ variante = 'primario', tamanho = 'm', carregando, icone: Icone, children, className = '', as: Comp = 'button', ...props }) {
  return (
    <Comp
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`}
      disabled={carregando || props.disabled}
      {...props}
    >
      {carregando ? <LoaderCircle className="size-4 animate-spin" /> : Icone && <Icone className="size-[18px]" />}
      {children}
    </Comp>
  )
}

export function Campo({ rotulo, dica, erro, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="rotulo">{rotulo}</span>}
      {children}
      {erro ? <span className="block mt-1 text-[13px] text-erro">{erro}</span> : dica && <span className="block mt-1 text-[13px] text-tinta-3">{dica}</span>}
    </label>
  )
}

export function Selo({ estado, className = '' }) {
  const e = ESTADOS[estado] || ESTADOS.recebido
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold border whitespace-nowrap ${className}`}
      style={{ color: `color-mix(in srgb, ${e.cor} 82%, var(--color-tinta))`, background: `color-mix(in srgb, ${e.cor} 14%, transparent)`, borderColor: `color-mix(in srgb, ${e.cor} 38%, transparent)` }}>
      <span className="size-1.5 rounded-full" style={{ background: e.cor }} />
      {e.nome}
    </span>
  )
}

/** Etiqueta de situação com bolinha colorida (estilo da inspeção). */
export function Pilula({ nome, cor }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-bold border"
      style={{ color: `color-mix(in srgb, ${cor} 75%, white)`, background: `color-mix(in srgb, ${cor} 16%, transparent)`, borderColor: `color-mix(in srgb, ${cor} 45%, transparent)` }}>
      <span className="size-2 rounded-full" style={{ background: cor }} />{nome}
    </span>
  )
}

export function Avatar({ nome, className = '' }) {
  const ini = String(nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return <span className={`inline-grid place-items-center rounded-full bg-ultramar-100 text-ultramar-700 font-bold text-[12px] size-8 shrink-0 ${className}`} aria-hidden="true">{ini}</span>
}

export function Modal({ aberto, aoFechar, titulo, children, largura = 'max-w-lg' }) {
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto, aoFechar])
  return (
    <AnimatePresence>
      {aberto && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]" onClick={aoFechar} />
          <motion.div role="dialog" aria-modal="true" aria-label={titulo}
            className={`relative w-full ${largura} max-h-[92vh] overflow-y-auto bg-superficie rounded-t-3xl sm:rounded-2xl shadow-2xl`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <div className="sticky top-0 bg-superficie/95 backdrop-blur flex items-center justify-between px-6 pt-5 pb-3 z-10">
              <h2 className="text-[19px] font-bold">{titulo}</h2>
              <button onClick={aoFechar} className="p-2 -mr-2 rounded-lg hover:bg-fundo" aria-label="Fechar"><X className="size-5" /></button>
            </div>
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Vazio({ icone: Icone, titulo, texto, acao }) {
  return (
    <div className="cartao flex flex-col items-center text-center px-6 py-14">
      {Icone && <span className="grid place-items-center size-14 rounded-2xl bg-ultramar-50 text-ultramar-600 mb-4"><Icone className="size-7" /></span>}
      <p className="text-[17px] font-bold">{titulo}</p>
      {texto && <p className="text-tinta-2 mt-1 max-w-sm">{texto}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}

export function Esqueleto({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-trilho ${className}`} />
}

export function ErroCarga({ erro, tentar }) {
  return (
    <div className="cartao p-6 border-erro-borda bg-erro-bg" role="alert">
      <p className="font-bold text-erro">Não foi possível carregar.</p>
      <p className="text-tinta-2 mt-1">{erro}</p>
      {tentar && <Botao variante="secundario" tamanho="p" className="mt-3" onClick={tentar}>Tentar de novo</Botao>}
    </div>
  )
}

/** Número que sobe até o valor quando aparece na tela. */
export function NumeroAnimado({ valor, formatar = (v) => Math.round(v).toLocaleString('pt-BR') }) {
  const ref = useRef(null)
  const visto = useInView(ref, { once: true })
  const [atual, setAtual] = useState(0)
  useEffect(() => {
    if (!visto) return
    const c = animate(0, Number(valor) || 0, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: setAtual })
    return () => c.stop()
  }, [visto, valor])
  return <span ref={ref} className="num">{formatar(atual)}</span>
}

/** Carrega dados com estados de carregando/erro e função para recarregar. */
export function useDados(fn, deps = []) {
  const [s, setS] = useState({ dados: null, erro: null, carregando: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useCallback(fn, deps)
  const recarregar = useCallback(() => {
    setS((x) => ({ ...x, carregando: true }))
    return f().then((dados) => setS({ dados, erro: null, carregando: false })).catch((e) => setS({ dados: null, erro: e.message, carregando: false }))
  }, [f])
  useEffect(() => { recarregar() }, [recarregar])
  return { ...s, recarregar, setDados: (dados) => setS({ dados, erro: null, carregando: false }) }
}

/** Cabeçalho padrão das páginas. */
export function Cabecalho({ titulo, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-[-0.02em] leading-tight">{titulo}</h1>
        {sub && <p className="text-tinta-2 mt-1">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5 max-w-full">{children}</div>}
    </div>
  )
}

/** Entrada animada de listas: cada item aparece em sequência. */
export const lista = { animate: { transition: { staggerChildren: 0.05 } } }
export const itemLista = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
}
