import { lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Package, Wrench, ThumbsUp, ThumbsDown, PackageSearch, MessageCircle, Phone, Check, X, CalendarClock } from 'lucide-react'
import { ESTADOS } from '../lib/etapas'
import { dataHora, dia, moeda, nomeVeiculo, telefone } from '../lib/formato'
import { Botao, Modal, Placa } from '../ui/base'
import { Trilha, LinhaDoTempo } from '../ui/Trilha'

const VistoriaCliente = lazy(() => import('../vistoria/VistoriaCliente'))

function textoEstado(o) {
  if (o.aguardando_peca) return ['Aguardando uma peça', 'O serviço continua assim que a peça chegar. Avisamos você.']
  return {
    recebido: ['Recebemos seu veículo', 'Em breve começamos o diagnóstico.'],
    diagnostico: ['Estamos avaliando seu veículo', 'Assim que terminarmos o diagnóstico, você recebe o orçamento aqui.'],
    orcamento: ['Seu orçamento está sendo montado', 'Você será avisado quando estiver pronto para aprovar.'],
    aprovacao: ['Seu orçamento está pronto', 'Confira cada item e aprove só o que quiser fazer.'],
    aprovado: ['Orçamento aprovado', 'Obrigado! O serviço vai começar em breve.'],
    execucao: ['Serviço em andamento', o.previsao_entrega ? `Previsão de entrega: ${dia(o.previsao_entrega)}.` : 'Avisamos quando terminar.'],
    pronto: ['Pronto para retirada!', `Pode vir buscar seu ${o.veiculo.modelo}. Total: ${moeda(o.total_aprovado)}.`],
    entregue: ['Veículo entregue', `Retirado em ${dataHora(o.entregue_em)}. Obrigado pela confiança!`],
    recusada: ['Orçamento não aprovado', 'Seu veículo está disponível para retirada.'],
  }[o.etapa_atual]
}

/** Aprovação item por item: o cliente escolhe o que quer fazer e vê o total na hora. */
function AprovarOrcamento({ o, aoResponder }) {
  const [marcados, setMarcados] = useState(() => Object.fromEntries(o.itens.map((i) => [i.id, true])))
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(null)
  const [confirmarRecusa, setConfirmarRecusa] = useState(false)
  const total = o.itens.filter((i) => marcados[i.id]).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const qtd = Object.values(marcados).filter(Boolean).length

  async function responder(aprovar) {
    setEnviando(aprovar ? 'sim' : 'nao')
    try { await aoResponder({ itens: aprovar ? marcados : {}, observacao: obs }) } finally { setEnviando(null); setConfirmarRecusa(false) }
  }

  return (
    <section className="cartao p-5 sm:p-6 ring-2 ring-aprovacao/60" aria-labelledby="t-orc">
      <h2 id="t-orc" className="text-[20px] font-extrabold">Orçamento</h2>
      <p className="text-tinta-2 text-[14.5px] mb-4">Toque para incluir ou tirar um item.</p>
      <ul className="space-y-2">
        {o.itens.map((i) => {
          const on = Boolean(marcados[i.id])
          return (
            <li key={i.id}>
              <button type="button" onClick={() => setMarcados({ ...marcados, [i.id]: !on })} aria-pressed={on}
                className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition ${on ? 'border-ultramar-500 bg-ultramar-50/70' : 'border-linha bg-white opacity-70'}`}>
                <span className={`hidden sm:grid place-items-center size-10 shrink-0 rounded-xl ${i.tipo === 'peca' ? 'bg-[#e0f2fe] text-orcamento' : 'bg-[#f4f0ff] text-diagnostico'}`}>
                  {i.tipo === 'peca' ? <Package className="size-5" /> : <Wrench className="size-5" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block font-semibold leading-snug ${on ? '' : 'line-through'}`}>{i.descricao}</span>
                  <span className="block text-[13px] text-tinta-3">{i.tipo === 'peca' ? 'Peça' : 'Mão de obra'}{i.quantidade !== 1 ? ` · ${i.quantidade.toLocaleString('pt-BR')} × ${moeda(i.valor_unitario)}` : ''}</span>
                </span>
                <span className="font-bold num shrink-0">{moeda(i.quantidade * i.valor_unitario)}</span>
                <motion.span className={`grid place-items-center size-6 rounded-full shrink-0 ${on ? 'bg-ultramar-600 text-white' : 'border-2 border-[#cfd5e4]'}`} animate={{ scale: on ? [1, 1.2, 1] : 1 }}>
                  {on && <Check className="size-3.5" strokeWidth={3.5} />}
                </motion.span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-tinta-3">{qtd === o.itens.length ? 'Total' : `${qtd} de ${o.itens.length} itens`}</p>
          <motion.p key={total} initial={{ y: -6, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="text-[34px] font-extrabold tracking-tight num leading-none mt-1">{moeda(total)}</motion.p>
        </div>
        {o.previsao_entrega && <p className="text-[13.5px] text-tinta-2 flex items-center gap-1.5"><CalendarClock className="size-4" />Entrega {dia(o.previsao_entrega)}</p>}
      </div>

      <label className="block mt-5">
        <span className="rotulo">Quer deixar um recado? (opcional)</span>
        <textarea className="entrada" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>

      <div className="grid gap-2 mt-5">
        <Botao tamanho="g" variante="sucesso" icone={ThumbsUp} disabled={!qtd} carregando={enviando === 'sim'} onClick={() => responder(true)}>
          {qtd === o.itens.length ? 'Aprovar orçamento' : `Aprovar ${qtd} ${qtd === 1 ? 'item' : 'itens'}`}
        </Botao>
        <Botao tamanho="g" variante="fantasma" icone={ThumbsDown} onClick={() => setConfirmarRecusa(true)}>Não quero fazer agora</Botao>
      </div>

      <Modal aberto={confirmarRecusa} aoFechar={() => setConfirmarRecusa(false)} titulo="Recusar o orçamento?">
        <p className="text-tinta-2">A oficina será avisada e o veículo fica disponível para retirada.</p>
        <div className="flex gap-2 mt-5">
          <Botao variante="perigo" carregando={enviando === 'nao'} onClick={() => responder(false)}>Sim, recusar</Botao>
          <Botao variante="fantasma" onClick={() => setConfirmarRecusa(false)}>Voltar</Botao>
        </div>
      </Modal>
    </section>
  )
}

export default function DetalheOS({ o, aoResponder }) {
  const [titulo, sub] = textoEstado(o)
  const e = ESTADOS[o.etapa_atual]
  const [foto, setFoto] = useState(null)
  const tel = o.oficina?.telefone

  return (
    <div className="space-y-4">
      {/* Destaque com o estado atual */}
      <motion.section className="relative overflow-hidden rounded-[28px] text-white p-6 sm:p-8"
        style={{ background: `linear-gradient(140deg, ${o.aguardando_peca ? 'var(--color-sinal)' : e.cor}, color-mix(in srgb, ${o.aguardando_peca ? 'var(--color-sinal)' : e.cor} 55%, #0f1838))` }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
        <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10" />
        <div className="absolute right-10 -bottom-20 size-40 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="bg-white/95 rounded-xl p-1"><Placa placa={o.veiculo.placa} tamanho="m" /></div>
          <span className="text-[14px] font-semibold text-white/80">OS {o.id}</span>
        </div>
        <p className="relative text-white/85 font-semibold mt-5">{nomeVeiculo(o.veiculo)}{o.veiculo.ano_modelo ? ` ${o.veiculo.ano_modelo}` : ''}</p>
        <AnimatePresence mode="wait">
          <motion.h1 key={titulo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="relative text-[30px] sm:text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em] mt-1">{titulo}</motion.h1>
        </AnimatePresence>
        <p className="relative text-white/90 text-[16px] mt-2 max-w-[48ch]">{sub}</p>
        {o.aguardando_peca && <PackageSearch className="absolute right-6 bottom-6 size-10 text-white/40" />}
      </motion.section>

      <section className="cartao px-3 sm:px-6 pt-10 pb-5">
        <Trilha etapas={o.etapas} situacao={o.situacao} aguardandoPeca={o.aguardando_peca} compacta />
      </section>

      {o.avarias?.length > 0 && (
        <Suspense fallback={<div className="h-[420px] rounded-[28px] bg-[#0b1233] animate-pulse" />}>
          <VistoriaCliente avarias={o.avarias} />
        </Suspense>
      )}

      {o.etapa_atual === 'aprovacao' && o.situacao === 'aberta' && <AprovarOrcamento o={o} aoResponder={aoResponder} />}

      {o.diagnostico && (
        <section className="cartao p-5 sm:p-6">
          <h2 className="font-bold text-[17px]">O que encontramos</h2>
          <p className="text-tinta-2 mt-1.5">{o.diagnostico}</p>
          <p className="text-[13.5px] text-tinta-3 mt-3">Você relatou: {o.problema_relatado}</p>
        </section>
      )}

      {o.itens.length > 0 && o.etapa_atual !== 'aprovacao' && (
        <section className="cartao p-5 sm:p-6">
          <h2 className="font-bold text-[17px] mb-3">Orçamento</h2>
          <ul className="divide-y divide-linha">
            {o.itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5 text-[15px]">
                {i.aprovado === 1 ? <Check className="size-4 text-pronto shrink-0" strokeWidth={3} /> : i.aprovado === 0 ? <X className="size-4 text-tinta-3 shrink-0" /> : <span className="size-4" />}
                <span className={`flex-1 ${i.aprovado === 0 ? 'text-tinta-3 line-through' : ''}`}>{i.descricao}</span>
                <span className="num font-semibold">{moeda(i.quantidade * i.valor_unitario)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-extrabold text-[18px] mt-3 pt-3 border-t border-linha"><span>{o.total_aprovado ? 'Total aprovado' : 'Total'}</span><span className="num">{moeda(o.total_aprovado || o.total)}</span></p>
        </section>
      )}

      {o.fotos.length > 0 && (
        <section className="cartao p-5 sm:p-6">
          <h2 className="font-bold text-[17px] mb-3">Fotos do seu veículo</h2>
          <ul className="grid grid-cols-3 gap-2">
            {o.fotos.map((f) => (
              <li key={f.id}><button onClick={() => setFoto(f)} className="block w-full aspect-square rounded-xl overflow-hidden bg-fundo"><img src={`/uploads/${f.arquivo}`} alt="Foto do veículo" loading="lazy" className="size-full object-cover" /></button></li>
            ))}
          </ul>
          <Modal aberto={Boolean(foto)} aoFechar={() => setFoto(null)} titulo="Foto" largura="max-w-3xl">{foto && <img src={`/uploads/${foto.arquivo}`} alt="" className="w-full rounded-xl" />}</Modal>
        </section>
      )}

      <section className="cartao p-5 sm:p-6">
        <h2 className="font-bold text-[17px] mb-5">Histórico</h2>
        <LinhaDoTempo etapas={o.etapas} />
      </section>

      {tel && (
        <section className="cartao p-5 sm:p-6 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <p className="font-bold">{o.oficina.nome}</p>
            {o.oficina.endereco && <p className="text-[14px] text-tinta-3">{o.oficina.endereco}</p>}
          </div>
          <Botao as="a" href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" variante="whats" icone={MessageCircle}>WhatsApp</Botao>
          <Botao as="a" href={`tel:+55${tel}`} variante="secundario" icone={Phone}>{telefone(tel)}</Botao>
        </section>
      )}
    </div>
  )
}
