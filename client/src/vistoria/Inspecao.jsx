// Tela de inspeção 3D (tela cheia): palco com o carro, painel Resumo → Peça → Registrar avaria.
import { useMemo, useRef, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Box, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, ArrowDownToLine, Undo2, RotateCw, MapPin, TriangleAlert,
  Maximize2, Minimize2, FileText, Smartphone, ArrowLeft, Check, Plus, Wrench, Lock, Phone, ChevronLeft, ExternalLink,
} from 'lucide-react'
import { api } from '../lib/api'
import { ESTADOS } from '../lib/etapas'
import { dataHora, moeda, nomeVeiculo, telefone } from '../lib/formato'
import { Avatar, ErroCarga, Esqueleto, Modal, Pilula, Placa, useDados } from '../ui/base'
import { useToast } from '../ui/Toast'
import { avisarMudanca } from '../oficina/Layout'
import Carro3D, { VISTAS } from './Carro3D'
import Editor from './Editor'
import { medidasDe, centroDaZona } from './carrocerias'
import { ZONAS, GRAVIDADES, nomeZona, nomeTipo, corAvaria, formatarTempo } from './zonas'

const EDITAVEL = ['recebido', 'diagnostico', 'orcamento', 'aprovacao']
const VISTAS_BOTOES = [
  ['perspectiva', Box, 'Perspectiva'], ['topo', ArrowUpToLine, 'Vista de cima'], ['esquerda', ArrowLeftToLine, 'Lado esquerdo'],
  ['direita', ArrowRightToLine, 'Lado direito'], ['frente', ArrowDownToLine, 'Frente'], ['traseira', Undo2, 'Traseira'],
]

/** Situação da OS com o vocabulário da inspeção. */
function situacao(o) {
  if (['recebido', 'diagnostico', 'orcamento'].includes(o.etapa_atual)) return { nome: 'Em elaboração', cor: '#8ea2ff' }
  return { nome: ESTADOS[o.etapa_atual].nome, cor: ESTADOS[o.etapa_atual].cor }
}

function lado(zona) {
  if (zona.endsWith('_direita')) return 'Lado direito'
  if (zona.endsWith('_esquerda')) return 'Lado esquerdo'
  return { capo: 'Frente', para_choque_dianteiro: 'Frente', para_brisa: 'Frente', teto: 'Topo', tampa_traseira: 'Traseira', para_choque_traseiro: 'Traseira', vidro_traseiro: 'Traseira' }[zona] || 'Centro'
}

function Resumo({ o, editavel, aoEscolherPeca, aoAbrir, aoGerar, gerando }) {
  const pendentes = o.avarias.filter((a) => !a.orcada)
  const todos = o.avarias.flatMap((a) => a.servicos)
  const pecas = todos.filter((s) => /^Substitui/.test(s.descricao)).reduce((t, s) => t + s.valor, 0)
  const total = todos.reduce((t, s) => t + s.valor, 0)
  const minutos = todos.reduce((t, s) => t + s.minutos, 0)
  const dias = Math.max(1, Math.ceil(minutos / 480))
  const ano = (o.criado_em || '').slice(0, 4)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-5">
        <div>
          <p className="text-[11.5px] font-bold tracking-[0.14em] text-[#8ea2ff]">RESUMO DA INSPEÇÃO</p>
          <h2 className="text-[22px] font-extrabold tracking-tight mt-0.5">Atendimento nº {o.id}</h2>
          <p className="text-[13.5px] text-tinta-3">{dataHora(o.criado_em)}{o.mecanico_nome ? ` · ${o.mecanico_nome}` : ''}</p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-white/[.03] p-3">
          <Avatar nome={o.cliente_nome} className="!size-11 !text-[14px] !bg-ultramar-600 !text-white" />
          <div className="min-w-0">
            <p className="font-bold truncate">{o.cliente_nome}</p>
            <p className="text-[13.5px] text-tinta-3 flex items-center gap-1.5"><Phone className="size-3.5" />{telefone(o.cliente_telefone)}</p>
          </div>
        </div>

        <section>
          <h3 className="text-[14px] font-bold text-tinta-2 mb-2">Avarias registradas</h3>
          {o.avarias.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-linha-forte px-4 py-5 text-center text-[14px] text-tinta-3">
              {editavel ? 'Clique em uma peça do carro para começar.' : 'Nenhuma avaria nesta OS.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {o.avarias.map((a, i) => (
                <motion.li key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <button onClick={() => aoAbrir(a)} className="w-full flex items-center gap-3 rounded-2xl border border-linha bg-white/[.03] hover:bg-white/[.06] p-3 text-left">
                    <span className="grid place-items-center size-9 shrink-0 rounded-full font-extrabold text-[14px] text-white" style={{ background: corAvaria(a) }}>{a.numero}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-[14.5px] truncate">{a.zona_nome}</span>
                      <span className="block text-[13px] text-tinta-3">{a.tipo === 'servico' ? 'Serviço sem avaria' : `${nomeTipo(a.tipo)} · ${a.gravidade}`}</span>
                    </span>
                    <span className="font-bold num text-[14.5px]">{moeda(a.valor)}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </section>

        {editavel && (
          <label className="block">
            <span className="text-[14px] font-bold text-tinta-2">Selecionar peça pela lista</span>
            <select className="entrada mt-2" value="" onChange={(e) => e.target.value && aoEscolherPeca(e.target.value)}>
              <option value="">Escolha uma peça…</option>
              {Object.entries(ZONAS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="border-t border-linha bg-[#0a1130] px-5 py-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-bold tracking-wide text-[#8ea2ff]">ORC-{ano}-{String(o.id).padStart(4, '0')}</span>
          {o.itens.length > 0 && <Link to={`/oficina/ordens/${o.id}`} className="inline-flex items-center gap-1 font-semibold text-tinta-3 hover:text-white">Ver na OS<ExternalLink className="size-3.5" /></Link>}
        </div>
        <dl className="mt-2 space-y-1 text-[14px]">
          <div className="flex justify-between"><dt className="text-tinta-3">Peças e insumos</dt><dd className="num font-semibold">{moeda(pecas)}</dd></div>
          <div className="flex justify-between"><dt className="text-tinta-3">Mão de obra</dt><dd className="num font-semibold">{moeda(total - pecas)}</dd></div>
        </dl>
        <div className="flex items-end justify-between mt-3">
          <div>
            <p className="text-[11.5px] font-bold tracking-[0.12em] text-tinta-3">TOTAL DO ORÇAMENTO</p>
            <p className="text-[30px] font-extrabold num leading-tight">{moeda(total)}</p>
          </div>
          {minutos > 0 && <p className="text-right text-[13px] text-tinta-3 num">{formatarTempo(minutos)}<span className="block">≈ {dias} {dias === 1 ? 'dia útil' : 'dias úteis'}</span></p>}
        </div>
        {editavel && (
          <button onClick={aoGerar} disabled={!pendentes.length || gerando || o.etapa_atual === 'recebido'}
            className="mt-3 w-full h-12 rounded-xl bg-ultramar-600 hover:bg-ultramar-500 font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(61,91,255,.9)] disabled:opacity-40 disabled:shadow-none">
            <FileText className="size-5" />{pendentes.length ? `Gerar orçamento (${pendentes.length})` : 'Orçamento em dia'}
          </button>
        )}
      </div>
    </div>
  )
}

function PecaSelecionada({ o, zona, editavel, aoVoltar, aoRegistrar, aoAbrir }) {
  const daPeca = o.avarias.filter((a) => a.zona === zona)
  return (
    <div className="px-5 pt-4 pb-5 space-y-5 overflow-y-auto h-full">
      <button onClick={aoVoltar} className="inline-flex items-center gap-1.5 -ml-1 px-1 h-8 rounded-lg text-[14px] font-semibold text-[#c9d2f0] hover:text-white"><ArrowLeft className="size-4" />Resumo da inspeção</button>
      <div>
        <p className="text-[11.5px] font-bold tracking-[0.14em] text-[#8ea2ff]">PEÇA SELECIONADA</p>
        <h2 className="text-[24px] font-extrabold tracking-tight mt-0.5">{nomeZona(zona)}</h2>
        <span className="inline-block mt-2 rounded-lg bg-white/[.06] border border-linha px-2.5 py-1 text-[13px] font-semibold text-tinta-2">{lado(zona)}</span>
      </div>

      {daPeca.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-[#12b76a]/35 bg-[#12b76a]/10 text-[#6ee7a8] px-4 py-3 text-[14.5px] font-semibold">
          <Check className="size-5" />Nenhuma avaria registrada nesta peça.
        </p>
      ) : (
        <ul className="space-y-2">
          {daPeca.map((a) => (
            <li key={a.id}>
              <button onClick={() => aoAbrir(a)} className="w-full flex items-center gap-3 rounded-2xl border border-linha bg-white/[.03] hover:bg-white/[.06] p-3 text-left">
                <span className="grid place-items-center size-9 rounded-full font-extrabold text-white" style={{ background: corAvaria(a) }}>{a.numero}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold">{a.tipo === 'servico' ? 'Serviço sem avaria' : `${nomeTipo(a.tipo)} · ${a.gravidade}`}</span>
                  <span className="block text-[13px] text-tinta-3 truncate">{a.servicos.map((s) => s.descricao).join(' + ')}</span>
                </span>
                <span className="font-bold num">{moeda(a.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editavel ? (
        <div className="space-y-2.5">
          <button onClick={() => aoRegistrar('amassado')} className="w-full h-12 rounded-xl bg-ultramar-600 hover:bg-ultramar-500 font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(61,91,255,.9)]">
            <Plus className="size-5" />Registrar avaria
          </button>
          <button onClick={() => aoRegistrar('servico')} className="w-full h-12 rounded-xl border border-linha-forte bg-white/[.03] hover:bg-white/[.07] font-bold inline-flex items-center justify-center gap-2 text-tinta-2">
            <Wrench className="size-[18px]" />Adicionar serviço sem avaria
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[14px] text-tinta-3"><Lock className="size-4" />Inspeção travada depois da aprovação do orçamento.</p>
      )}
    </div>
  )
}

export default function Inspecao() {
  const { id } = useParams()
  const avisar = useToast()
  const caixa = useRef(null)
  const { dados: o, erro, setDados, recarregar } = useDados(() => api.ordem(id), [id])
  const [modo, setModo] = useState({ tipo: 'resumo' }) // resumo | peca {zona, ponto} | editor {inicial}
  const [vista, setVista] = useState(null)
  const [girar, setGirar] = useState(false)
  const [pinos, setPinos] = useState(true)
  const [destaque, setDestaque] = useState(true)
  const [cheia, setCheia] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [previa, setPrevia] = useState(false)

  useEffect(() => {
    const f = () => setCheia(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const c = useMemo(() => medidasDe(o?.carroceria, o?.marca), [o?.carroceria, o?.marca])
  if (erro) return <div className="p-8"><ErroCarga erro={erro} tentar={recarregar} /></div>
  if (!o) return <div className="p-8 space-y-4"><Esqueleto className="h-24 w-96" /><Esqueleto className="h-[70vh]" /></div>

  const editavel = o.situacao === 'aberta' && EDITAVEL.includes(o.etapa_atual)
  const s = situacao(o)
  const pendentes = o.avarias.filter((a) => !a.orcada)
  const atualizar = (r) => { setDados(r); avisarMudanca() }

  function focar(ponto) {
    const p = ponto.posicao
    const n = ponto.normal
    setVista({ pos: [p.x + n.x * 4.4 + 1.2, Math.max(1.2, p.y + n.y * 4.4 + 1.3), p.z + n.z * 4.4], alvo: [p.x * 0.6, Math.max(0.5, p.y), p.z * 0.6], foco: true, k: Date.now() })
  }
  function escolherPeca(zona, ponto) {
    const pt = ponto || centroDaZona(zona, c)
    setGirar(false)
    setModo({ tipo: 'peca', zona, ponto: pt })
    if (!ponto && pt) focar(pt)
  }
  function abrirAvaria(a) {
    const ponto = { posicao: { x: a.pos_x, y: a.pos_y, z: a.pos_z }, normal: { x: a.nor_x, y: a.nor_y, z: a.nor_z } }
    focar(ponto)
    if (!editavel) return setModo({ tipo: 'peca', zona: a.zona, ponto })
    setModo({
      tipo: 'editor',
      inicial: { id: a.id, numero: a.numero, zona: a.zona, tipo: a.tipo, gravidade: a.gravidade, observacao: a.observacao, ...ponto,
        servicos: a.servicos.map((x) => ({ catalogo_id: x.catalogo_id, descricao: x.descricao, valor: x.valor, minutos: x.minutos })) },
    })
  }
  function registrar(tipo) {
    const { zona, ponto } = modo
    setModo({ tipo: 'editor', inicial: { zona, ...ponto, tipo, gravidade: tipo === 'servico' ? 'leve' : 'moderada', observacao: '', servicos: [] } })
  }
  async function excluir() {
    const a = modo.inicial
    if (!confirm(`Excluir o registro ${a.numero}?`)) return
    try { atualizar(await api.avarias.remover(o.id, a.id)); setModo({ tipo: 'resumo' }); avisar('Registro excluído.') } catch (e) { avisar(e.message, 'erro') }
  }
  async function gerar() {
    setGerando(true)
    try {
      atualizar(await api.avarias.gerarOrcamento(o.id))
      avisar(`Orçamento gerado com ${pendentes.length} ${pendentes.length === 1 ? 'registro' : 'registros'}. Revise e envie ao cliente pela OS.`)
    } catch (e) { avisar(e.message, 'erro') } finally { setGerando(false) }
  }
  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen()
    else caixa.current?.requestFullscreen?.().catch(() => {})
  }

  const rascunho = modo.tipo === 'editor' && !modo.inicial.id ? modo.inicial : modo.tipo === 'peca' && modo.ponto ? modo.ponto : null
  const zonaAtiva = modo.tipo === 'peca' ? modo.zona : modo.tipo === 'editor' ? modo.inicial.zona : null

  return (
    <div ref={caixa} className="tema-escuro grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px] lg:h-dvh bg-[#060a1c]">
      {/* palco */}
      <section className="relative h-[66vh] min-h-[440px] lg:h-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#16225c_0%,#0a1135_50%,#060a1c_100%)]">
        <Carro3D carroceria={o.carroceria} marca={o.marca} cor={o.cor} avarias={o.avarias} rascunho={rascunho} selecionada={modo.tipo === 'editor' ? modo.inicial.id : null}
          zonaAtiva={zonaAtiva} aoClicarPeca={editavel ? (p) => escolherPeca(p.zona, p) : (p) => setModo({ tipo: 'peca', zona: p.zona, ponto: null })}
          aoSelecionar={abrirAvaria} vista={vista} girar={girar} mostrarPinos={pinos} destacarAvarias={destaque}
          classeCredito="bottom-[62px] right-3 lg:bottom-4 lg:right-20" />

        <div className="absolute top-3 left-3 right-3 lg:top-4 lg:left-4 lg:right-20 flex flex-col items-start gap-2 lg:gap-2.5 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#0b1230]/80 backdrop-blur-md border border-white/10 pl-2 pr-4 py-2">
            <Link to={`/oficina/ordens/${o.id}`} className="grid place-items-center size-8 rounded-lg text-tinta-3 hover:text-white hover:bg-white/10" aria-label="Voltar para a OS"><ChevronLeft className="size-5" /></Link>
            <span className="hidden sm:block"><Placa placa={o.placa} tamanho="m" /></span>
            <div className="min-w-0">
              <p className="font-extrabold text-[15px] lg:text-[16px] leading-tight truncate">{nomeVeiculo(o)}</p>
              <p className="text-[13px] text-tinta-3 truncate">{o.cliente_nome} · Atendimento nº {o.id}</p>
            </div>
          </div>
          <div className="hidden sm:block pointer-events-auto rounded-2xl bg-[#0b1230]/80 backdrop-blur-md border border-white/10 px-4 py-2">
            <p className="text-[11.5px] font-bold tracking-[0.14em] text-[#8ea2ff]">MODELO 3D · {c.nome.toUpperCase()}</p>
            <p className="text-[14px] font-semibold text-tinta-2">{[o.ano_modelo, o.cor, o.quilometragem && `${o.quilometragem.toLocaleString('pt-BR')} km`].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 mt-1">
            <Pilula {...s} />
            <button onClick={() => setPrevia(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-white/15 bg-[#0b1230]/80 backdrop-blur font-bold text-[14px] hover:bg-white/10"><Smartphone className="size-4" />Prévia do cliente</button>
            {editavel && (
              <button onClick={gerar} disabled={!pendentes.length || gerando || o.etapa_atual === 'recebido'}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ultramar-600 hover:bg-ultramar-500 font-bold text-[14px] shadow-[0_10px_30px_-8px_rgba(61,91,255,.95)] disabled:opacity-45 disabled:shadow-none">
                <FileText className="size-4" />Gerar orçamento
              </button>
            )}
          </div>
        </div>

        <nav className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-row gap-0.5 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:right-3 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col lg:gap-1 rounded-2xl bg-[#0b1230]/80 backdrop-blur-md border border-white/10 p-1.5" aria-label="Controles do modelo">
          {VISTAS_BOTOES.map(([k, Icone, nome]) => (
            <button key={k} onClick={() => { setGirar(false); setVista({ ...VISTAS[k], k: Date.now() }) }} title={nome} aria-label={nome}
              className={`${['frente', 'traseira'].includes(k) ? 'hidden lg:grid' : 'grid'} place-items-center size-9 rounded-xl text-[#c9d2f0] hover:bg-white/10 hover:text-white`}><Icone className="size-[18px]" /></button>
          ))}
          <span className="w-px mx-1 lg:w-auto lg:h-px lg:mx-0 bg-white/10 lg:my-1" />
          {[[girar, () => setGirar((g) => !g), RotateCw, 'Girar automaticamente'], [pinos, () => setPinos((v) => !v), MapPin, 'Mostrar marcadores'], [destaque, () => setDestaque((v) => !v), TriangleAlert, 'Destacar peças com avaria']].map(([on, fn, Icone, nome]) => (
            <button key={nome} onClick={fn} title={nome} aria-label={nome} aria-pressed={on}
              className={`grid place-items-center size-9 rounded-xl ${on ? 'bg-ultramar-600 text-white shadow-[0_0_16px_-2px_rgba(61,91,255,.9)]' : 'text-[#c9d2f0] hover:bg-white/10'}`}><Icone className="size-[18px]" /></button>
          ))}
          <button onClick={telaCheia} title="Tela cheia" aria-label="Tela cheia" className="hidden lg:grid place-items-center size-9 rounded-xl text-[#c9d2f0] hover:bg-white/10 hover:text-white">{cheia ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}</button>
        </nav>

        <div className="hidden lg:flex absolute left-4 bottom-4 gap-4 rounded-xl bg-[#0b1230]/70 backdrop-blur border border-white/10 px-3 py-2 text-[13px] font-semibold text-tinta-2">
          {GRAVIDADES.map((g) => <span key={g.valor} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: g.cor }} />{g.nome}</span>)}
        </div>
      </section>

      {/* painel lateral */}
      <aside className="relative bg-[#0b1230] border-l border-white/10 lg:h-dvh min-h-[560px] flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={modo.tipo + (modo.zona || '') + (modo.inicial?.id || '')} className="h-full"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 340, damping: 32 }}>
            {modo.tipo === 'resumo' && <Resumo o={o} editavel={editavel} aoEscolherPeca={(z) => escolherPeca(z)} aoAbrir={abrirAvaria} aoGerar={gerar} gerando={gerando} />}
            {modo.tipo === 'peca' && <PecaSelecionada o={o} zona={modo.zona} editavel={editavel} aoVoltar={() => setModo({ tipo: 'resumo' })} aoRegistrar={registrar} aoAbrir={abrirAvaria} />}
            {modo.tipo === 'editor' && (
              <Editor o={o} inicial={modo.inicial} aoExcluir={excluir}
                aoCancelar={() => (modo.inicial.id ? setModo({ tipo: 'resumo' }) : setModo({ tipo: 'peca', zona: modo.inicial.zona, ponto: { posicao: modo.inicial.posicao, normal: modo.inicial.normal } }))}
                aoSalvar={(r, msg) => { atualizar(r); setModo({ tipo: 'resumo' }); avisar(msg) }} />
            )}
          </motion.div>
        </AnimatePresence>
      </aside>

      <Modal aberto={previa} aoFechar={() => setPrevia(false)} titulo="Prévia do cliente" largura="max-w-[460px]">
        <p className="text-[14px] text-tinta-3 mb-4">É assim que {o.cliente_nome.split(' ')[0]} vê a OS pelo link que recebe.</p>
        <div className="mx-auto w-[360px] max-w-full rounded-[44px] border-[10px] border-[#05070f] bg-[#05070f] shadow-2xl overflow-hidden">
          <div className="h-6 flex justify-center items-center bg-[#05070f]"><span className="w-24 h-4 rounded-full bg-black" /></div>
          <iframe title="Prévia do cliente" src={`/acompanhar/${o.codigo_publico}`} className="w-full h-[640px] bg-white rounded-b-[34px]" />
        </div>
        <a href={`/acompanhar/${o.codigo_publico}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#9db2ff]"><ExternalLink className="size-4" />Abrir em outra aba</a>
      </Modal>
    </div>
  )
}
