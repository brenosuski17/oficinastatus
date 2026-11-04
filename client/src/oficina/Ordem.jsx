import { lazy, Suspense, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeft, Stethoscope, Send, ThumbsUp, ThumbsDown, Play, PackageSearch, PackageCheck, CircleCheckBig, KeyRound,
  Camera, Link2, Copy, Phone, Mail, Gauge, CalendarClock, ImagePlus, Box,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ESTADOS } from '../lib/etapas'
import { dataHora, dia, moeda, nomeVeiculo, telefone } from '../lib/formato'
import { Botao, Campo, ErroCarga, Esqueleto, Modal, Placa, Selo, useDados } from '../ui/base'
import { Trilha, LinhaDoTempo } from '../ui/Trilha'
import { useToast } from '../ui/Toast'
import Orcamento from './Orcamento'
import Mensagem from './Mensagem'
import { avisarMudanca } from './Layout'

const Vistoria = lazy(() => import('../vistoria/Vistoria'))

/** Cartão colorido com a cor da etapa atual. */
function Caixa({ e, titulo, texto, children }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${e.cor}, color-mix(in srgb, ${e.cor} 70%, #121a33))` }}>
      <div className="absolute -right-10 -top-10 size-44 rounded-full bg-white/10" />
      <div className="relative flex items-start gap-4">
        <span className="hidden sm:grid place-items-center size-12 shrink-0 rounded-2xl bg-white/20"><e.icone className="size-6" /></span>
        <div className="flex-1 min-w-0">
          {children && <p className="text-[14px] font-semibold text-white/75">Próximo passo</p>}
          <h2 className="text-[22px] font-extrabold mt-0.5">{titulo}</h2>
          {texto && <p className="text-white/85 mt-1 max-w-[62ch]">{texto}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </div>
  )
}

/** Painel com a próxima ação da etapa atual. */
function ProximaAcao({ o, executar, ocupado, abrirAprovacao, abrirVistoria }) {
  const [diag, setDiag] = useState(o.diagnostico || '')
  const [previsao, setPrevisao] = useState(o.previsao_entrega || '')
  const e = ESTADOS[o.etapa_atual]

  switch (o.etapa_atual) {
    case 'diagnostico':
      return (
        <Caixa e={e} titulo="Registrar o diagnóstico" texto="Marque as avarias na vistoria 3D e gere o orçamento direto dela, ou descreva o que foi encontrado. O cliente é avisado a cada passo.">
          <form onSubmit={(ev) => { ev.preventDefault(); executar(() => api.diagnostico(o.id, { diagnostico: diag }), 'Diagnóstico registrado. Cliente avisado.') }} className="space-y-3">
            <textarea className="entrada !border-white/30" rows={2} required value={diag} onChange={(ev) => setDiag(ev.target.value)} placeholder="Ex.: pastilhas no limite, disco com desgaste irregular" aria-label="Diagnóstico" />
            <div className="flex flex-wrap gap-2">
              <Botao type="button" variante="secundario" icone={Box} onClick={abrirVistoria} className="!border-white">Abrir vistoria 3D</Botao>
              <Botao type="submit" variante="fantasma" icone={Stethoscope} carregando={ocupado} className="!text-white hover:!bg-white/15">Concluir só com o texto</Botao>
            </div>
          </form>
        </Caixa>
      )
    case 'orcamento':
      return (
        <Caixa e={e} titulo="Montar e enviar o orçamento" texto={o.qtd_itens ? `${o.qtd_itens} itens · ${moeda(o.total)}. Ao enviar, o cliente recebe o link para aprovar item por item.` : 'Adicione as peças e a mão de obra na aba Orçamento.'}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-[13px] font-semibold text-white/80 mb-1">Previsão de entrega</span>
              <input type="date" className="entrada !w-auto" value={previsao} onChange={(ev) => setPrevisao(ev.target.value)} />
            </label>
            <Botao variante="secundario" icone={Send} carregando={ocupado} disabled={!o.qtd_itens}
              onClick={() => executar(() => api.enviarOrcamento(o.id, { previsao_entrega: previsao }), 'Orçamento enviado ao cliente.')}>Enviar para aprovação</Botao>
          </div>
        </Caixa>
      )
    case 'aprovacao':
      return (
        <Caixa e={e} titulo="Aguardando a resposta do cliente" texto={`Orçamento de ${moeda(o.total)} enviado. O cliente aprova pelo link ou pelo portal. Se ele responder por telefone ou no balcão, registre aqui.`}>
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" icone={ThumbsUp} onClick={abrirAprovacao}>Registrar resposta</Botao>
          </div>
        </Caixa>
      )
    case 'aprovado':
      return (
        <Caixa e={e} titulo="Iniciar o serviço" texto={`Aprovado: ${moeda(o.total_aprovado)}. O cliente recebe o aviso de início com a previsão de entrega.`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-[13px] font-semibold text-white/80 mb-1">Previsão de entrega</span>
              <input type="date" className="entrada !w-auto" value={previsao} onChange={(ev) => setPrevisao(ev.target.value)} />
            </label>
            <Botao variante="secundario" icone={Play} carregando={ocupado} onClick={() => executar(() => api.execucao(o.id, { previsao_entrega: previsao }), 'Serviço iniciado. Cliente avisado.')}>Iniciar serviço</Botao>
          </div>
        </Caixa>
      )
    case 'execucao':
      return (
        <Caixa e={e} titulo={o.aguardando_peca ? 'Aguardando peça' : 'Serviço em andamento'} texto={o.previsao_entrega ? `Previsão de entrega: ${dia(o.previsao_entrega)}.` : 'Quando terminar, marque como pronto para avisar o cliente.'}>
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" icone={CircleCheckBig} carregando={ocupado} onClick={() => executar(() => api.pronto(o.id), 'Veículo pronto. Cliente avisado para retirar.')}>Marcar como pronto</Botao>
            <Botao variante="fantasma" className="!text-white hover:!bg-white/15" icone={o.aguardando_peca ? PackageCheck : PackageSearch} disabled={ocupado}
              onClick={() => executar(() => api.peca(o.id, { aguardando: !o.aguardando_peca }), o.aguardando_peca ? 'Serviço retomado. Cliente avisado.' : 'Marcado como aguardando peça. Cliente avisado.')}>
              {o.aguardando_peca ? 'Peça chegou, retomar' : 'Aguardando peça'}
            </Botao>
          </div>
        </Caixa>
      )
    case 'pronto':
    case 'recusada':
      return (
        <Caixa e={e} titulo="Registrar a retirada" texto={o.etapa_atual === 'pronto' ? `Total a receber: ${moeda(o.total_aprovado)}.` : 'O cliente recusou o orçamento. Registre quando ele retirar o veículo.'}>
          <Botao variante="secundario" icone={KeyRound} carregando={ocupado} onClick={() => executar(() => api.entrega(o.id), 'Entrega registrada. OS encerrada.')}>Registrar entrega</Botao>
        </Caixa>
      )
    default:
      return <Caixa e={e} titulo="OS encerrada" texto={`Veículo entregue em ${dataHora(o.entregue_em)}.`} />
  }
}

function AprovacaoManual({ o, aberto, aoFechar, executar }) {
  const [marcados, setMarcados] = useState(() => Object.fromEntries(o.itens.map((i) => [i.id, true])))
  const total = o.itens.filter((i) => marcados[i.id]).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const nenhum = !Object.values(marcados).some(Boolean)
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Resposta do cliente">
      <p className="text-tinta-2 mb-4">Marque o que o cliente aprovou por telefone ou no balcão.</p>
      <ul className="space-y-2">
        {o.itens.map((i) => (
          <li key={i.id}>
            <label className="flex items-center gap-3 rounded-xl border border-linha p-3 cursor-pointer has-[:checked]:border-ultramar-500 has-[:checked]:bg-ultramar-50">
              <input type="checkbox" className="size-5 accent-[#2b4cff]" checked={Boolean(marcados[i.id])} onChange={(e) => setMarcados({ ...marcados, [i.id]: e.target.checked })} />
              <span className="flex-1 font-medium">{i.descricao}</span>
              <span className="num font-semibold">{moeda(i.quantidade * i.valor_unitario)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px]">Total aprovado: <strong className="num">{moeda(total)}</strong></p>
      <div className="flex flex-wrap gap-2 mt-5">
        <Botao variante={nenhum ? 'perigo' : 'sucesso'} icone={nenhum ? ThumbsDown : ThumbsUp}
          onClick={() => { aoFechar(); executar(() => api.aprovacao(o.id, { itens: marcados, observacao: 'Resposta por telefone/balcão' }), nenhum ? 'Recusa registrada.' : 'Aprovação registrada. Cliente avisado.') }}>
          {nenhum ? 'Registrar recusa' : 'Registrar aprovação'}
        </Botao>
        <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
      </div>
    </Modal>
  )
}

function Fotos({ o, aoAtualizar }) {
  const avisar = useToast()
  const ref = useRef(null)
  const [momento, setMomento] = useState(o.etapa_atual === 'diagnostico' ? 'diagnostico' : o.etapa_atual === 'execucao' ? 'execucao' : o.etapa_atual === 'pronto' ? 'entrega' : 'entrada')
  const [enviando, setEnviando] = useState(false)
  const [aberta, setAberta] = useState(null)

  async function enviar(files) {
    if (!files?.length) return
    const form = new FormData()
    for (const f of files) form.append('fotos', f)
    form.append('momento', momento)
    setEnviando(true)
    try { aoAtualizar(await api.fotos(o.id, form)); avisar(`${files.length} foto(s) adicionada(s).`) } catch (e) { avisar(e.message, 'erro') } finally { setEnviando(false); ref.current.value = '' }
  }
  const nomes = { entrada: 'Entrada', diagnostico: 'Diagnóstico', execucao: 'Execução', entrega: 'Entrega' }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <Campo rotulo="Momento">
          <select className="entrada !w-auto" value={momento} onChange={(e) => setMomento(e.target.value)}>
            {Object.entries(nomes).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
        <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
        <Botao icone={ImagePlus} carregando={enviando} onClick={() => ref.current.click()}>Adicionar fotos</Botao>
      </div>
      {o.fotos.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-linha py-12 text-center text-tinta-2"><Camera className="size-8 mx-auto mb-2 text-tinta-3" />Fotos da entrada e do problema ajudam o cliente a entender o orçamento.</div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {o.fotos.map((f, i) => (
            <motion.li key={f.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
              <button onClick={() => setAberta(f)} className="group block w-full aspect-[4/3] rounded-2xl overflow-hidden relative bg-fundo">
                <img src={`/uploads/${f.arquivo}`} alt={`Foto ${nomes[f.momento]}`} className="size-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" />
                <span className="absolute left-2 bottom-2 rounded-lg bg-tinta/75 text-white text-[12px] font-bold px-2 py-1">{nomes[f.momento]}</span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
      <Modal aberto={Boolean(aberta)} aoFechar={() => setAberta(null)} titulo={aberta ? `${nomes[aberta.momento]} · ${dataHora(aberta.criado_em)}` : ''} largura="max-w-4xl">
        {aberta && <img src={`/uploads/${aberta.arquivo}`} alt="" className="w-full rounded-xl" />}
      </Modal>
    </div>
  )
}

const ABAS = [['resumo', 'Resumo'], ['vistoria', 'Vistoria 3D'], ['orcamento', 'Orçamento'], ['fotos', 'Fotos'], ['historico', 'Histórico']]

export default function Ordem() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const avisar = useToast()
  const { dados: o, erro, carregando, setDados, recarregar } = useDados(() => api.ordem(id), [id])
  const { dados: mecanicos } = useDados(() => api.mecanicos(), [])
  const [aba, setAba] = useState('resumo')
  const [ocupado, setOcupado] = useState(false)
  const [aprovando, setAprovando] = useState(false)

  async function executar(fn, sucesso) {
    setOcupado(true)
    try { setDados(await fn()); avisar(sucesso); avisarMudanca() } catch (e) { avisar(e.message, 'erro') } finally { setOcupado(false) }
  }

  if (erro) return <ErroCarga erro={erro} tentar={recarregar} />
  if (carregando && !o) return <div className="space-y-4"><Esqueleto className="h-24" /><Esqueleto className="h-28" /><Esqueleto className="h-64" /></div>

  const linkCliente = `${window.location.origin}/acompanhar/${o.codigo_publico}`
  const contagem = { vistoria: o.avarias.length, orcamento: o.itens.length, fotos: o.fotos.length, historico: o.mensagens.length }

  return (
    <>
      <Link to="/oficina/quadro" className="inline-flex items-center gap-1 text-[14px] font-semibold text-tinta-2 hover:text-tinta mb-4"><ChevronLeft className="size-4" />Quadro</Link>

      <motion.header className="cartao p-6 flex flex-wrap items-center gap-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Placa placa={o.placa} tamanho="g" />
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">{nomeVeiculo(o)}</h1>
            <Selo estado={o.etapa_atual} />
            {o.aguardando_peca && <span className="rounded-full bg-sinal-50 text-[#c4410a] px-2.5 py-1 text-[12.5px] font-bold">Aguardando peça</span>}
          </div>
          <p className="text-tinta-2 mt-1">OS {o.id} · aberta em {dataHora(o.criado_em)}{o.ano_modelo ? ` · ${o.ano_modelo}` : ''}{o.cor ? ` · ${o.cor}` : ''}</p>
        </div>
        <label className="block min-w-[200px]">
          <span className="rotulo">Mecânico responsável</span>
          <select className="entrada" value={o.mecanico_id || ''} disabled={usuario.papel !== 'admin' && o.mecanico_id === usuario.id}
            onChange={(e) => executar(() => api.responsavel(o.id, e.target.value ? Number(e.target.value) : null), 'Responsável atualizado.')}>
            <option value="">Sem responsável</option>
            {(mecanicos || []).filter((m) => usuario.papel === 'admin' || m.id === usuario.id || m.id === o.mecanico_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
      </motion.header>

      <section className="cartao px-4 sm:px-8 pt-12 pb-6 mt-4 overflow-x-auto">
        <div className="min-w-[560px]"><Trilha etapas={o.etapas} situacao={o.situacao} aguardandoPeca={o.aguardando_peca} /></div>
      </section>

      <div className="mt-4"><ProximaAcao key={`${o.etapa_atual}-${o.atualizado_em}`} o={o} executar={executar} ocupado={ocupado} abrirAprovacao={() => setAprovando(true)} abrirVistoria={() => setAba('vistoria')} /></div>
      {aprovando && <AprovacaoManual o={o} aberto={aprovando} aoFechar={() => setAprovando(false)} executar={executar} />}

      <div className="mt-6 flex gap-1 border-b border-linha overflow-x-auto" role="tablist">
        {ABAS.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`relative px-4 h-12 font-bold text-[15px] whitespace-nowrap ${aba === k ? 'text-tinta' : 'text-tinta-3 hover:text-tinta-2'}`}>
            {n}{contagem[k] ? <span className="ml-1.5 text-[12px] text-tinta-3 num">{contagem[k]}</span> : null}
            {aba === k && <motion.span layoutId="aba-os" className="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-ultramar-600" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={aba} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-5">
          {aba === 'resumo' && (
            <div className="grid lg:grid-cols-[1fr_340px] gap-4">
              <div className="space-y-4">
                <section className="cartao p-6">
                  <h2 className="font-bold text-[17px] mb-2">Problema relatado</h2>
                  <p className="text-tinta-2">{o.problema_relatado}</p>
                  {o.diagnostico && <><h2 className="font-bold text-[17px] mt-5 mb-2">Diagnóstico</h2><p className="text-tinta-2">{o.diagnostico}</p></>}
                </section>
                <section className="cartao p-6">
                  <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-[17px]">Orçamento</h2><Botao variante="fantasma" tamanho="p" onClick={() => setAba('orcamento')}>Ver itens</Botao></div>
                  <p className="text-[28px] font-extrabold num">{moeda(o.total)}</p>
                  <p className="text-tinta-3 text-[14px]">{o.qtd_itens} itens{o.total_aprovado ? ` · ${moeda(o.total_aprovado)} aprovado` : ''}</p>
                </section>
              </div>
              <aside className="space-y-4">
                <section className="cartao p-6">
                  <h2 className="font-bold text-[17px] mb-3">Cliente</h2>
                  <p className="font-semibold">{o.cliente_nome}</p>
                  <p className="flex items-center gap-2 text-tinta-2 mt-2"><Phone className="size-4" /><a href={`tel:${o.cliente_telefone}`} className="hover:text-ultramar-600">{telefone(o.cliente_telefone)}</a></p>
                  {o.cliente_email && <p className="flex items-center gap-2 text-tinta-2 mt-1 break-all"><Mail className="size-4 shrink-0" />{o.cliente_email}</p>}
                </section>
                <section className="cartao p-6 space-y-2 text-[14.5px]">
                  <h2 className="font-bold text-[17px] mb-1">Veículo</h2>
                  {o.km_entrada && <p className="flex items-center gap-2 text-tinta-2"><Gauge className="size-4" />{o.km_entrada.toLocaleString('pt-BR')} km na entrada</p>}
                  {o.previsao_entrega && <p className="flex items-center gap-2 text-tinta-2"><CalendarClock className="size-4" />Entrega prevista {dia(o.previsao_entrega)}</p>}
                  {o.fipe_valor && <p className="text-tinta-2">Valor FIPE: <strong className="text-tinta num">{o.fipe_valor}</strong> <span className="text-tinta-3">({o.fipe_mes_referencia})</span></p>}
                </section>
                <section className="cartao p-6">
                  <h2 className="font-bold text-[17px] mb-1 flex items-center gap-2"><Link2 className="size-5" />Página do cliente</h2>
                  <p className="text-[14px] text-tinta-3 mb-3">O cliente acompanha e aprova o orçamento por este link, sem precisar de senha.</p>
                  <div className="flex gap-2">
                    <Botao as="a" href={linkCliente} target="_blank" rel="noreferrer" variante="secundario" tamanho="p">Abrir</Botao>
                    <Botao variante="secundario" tamanho="p" icone={Copy} onClick={() => navigator.clipboard?.writeText(linkCliente).then(() => avisar('Link copiado.'))}>Copiar link</Botao>
                  </div>
                </section>
              </aside>
            </div>
          )}
          {aba === 'vistoria' && (
            <Suspense fallback={<Esqueleto className="h-[680px] !rounded-[28px] !bg-[#0b1233]" />}>
              <Vistoria o={o} aoAtualizar={(r) => { setDados(r); avisarMudanca() }} aoGerar={() => setAba('orcamento')} />
            </Suspense>
          )}
          {aba === 'orcamento' && <section className="cartao p-6"><Orcamento o={o} aoAtualizar={setDados} /></section>}
          {aba === 'fotos' && <section className="cartao p-6"><Fotos o={o} aoAtualizar={setDados} /></section>}
          {aba === 'historico' && (
            <div className="grid lg:grid-cols-[360px_1fr] gap-4">
              <section className="cartao p-6"><h2 className="font-bold text-[17px] mb-5">Linha do tempo</h2><LinhaDoTempo etapas={o.etapas} /></section>
              <section className="cartao p-6">
                <h2 className="font-bold text-[17px] mb-4">Mensagens ({o.mensagens.length})</h2>
                <ul className="space-y-3">{o.mensagens.map((m) => <Mensagem key={m.id} m={m} aoMudar={recarregar} />)}</ul>
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
